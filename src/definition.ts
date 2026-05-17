import { spawnSync } from "node:child_process";
import { complete, getModel } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { recentConversationSnippet } from "./conversation.js";
import { detectCurrentLanguage } from "./language.js";
import type { LearningState } from "./types.js";

const MOUSE_TRACKING_ON = "\x1b[?1002h\x1b[?1006h";
const MOUSE_TRACKING_OFF = "\x1b[?1002l\x1b[?1006l";

export const ENABLE_MOUSE_SELECTION_CAPTURE = /^(1|true|yes|on)$/i.test(
  process.env.PI_LEARNING_TUTOR_MOUSE_CAPTURE ?? "",
);

export async function askModelForDefinition(
  ctx: ExtensionContext,
  state: LearningState,
  text: string,
): Promise<string> {
  const currentModel = (ctx as any).model ?? getModel("openai", "gpt-5.2");
  if (!currentModel) {
    return `No active model was available for an AI definition.\n\nTerm: **${text}**`;
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(currentModel);
  if (auth.ok === false) {
    return `Could not call the model for a definition: ${auth.error}.\n\nTerm: **${text}**`;
  }
  if (!auth.apiKey) {
    return `Could not call the model for a definition: no API key was available.\n\nTerm: **${text}**`;
  }

  const language = detectCurrentLanguage(ctx.cwd);
  const prompt = `Define for a coding learner.

Term: ${text}
Goal: ${state.goal || "(none)"}
Context: ${recentConversationSnippet(ctx, 1200) || "(none)"}

Return compact Markdown: prerequisite idea(s) if the term depends on them, meaning, why it matters here, tiny example/analogy if useful (use \`${language.fence}\` fences for ${language.name}), and one possible follow-up. Define required terms before relying on them; do not use unexplained jargon or solve the task.`;
  const response = await complete(
    currentModel,
    {
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: prompt }],
          timestamp: Date.now(),
        },
      ],
    },
    { apiKey: auth.apiKey, headers: auth.headers, reasoningEffort: "minimal" },
  );

  const answer = response.content
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();

  return answer || `No definition text was returned for: **${text}**`;
}

export async function showDefinitionOverlay(
  ctx: ExtensionContext,
  title: string,
  markdown: string,
): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify(markdown, "info");
    return;
  }
  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) =>
      new DefinitionOverlay(theme, title, markdown, done),
    {
      overlay: true,
      overlayOptions: {
        width: "70%",
        minWidth: 50,
        maxHeight: "80%",
        anchor: "center",
        margin: 2,
      },
    },
  );
}

type MouseEvent = {
  button: number;
  col: number;
  row: number;
  release: boolean;
  motion: boolean;
};

type MousePoint = { col: number; row: number };
type DefineSelectionAction = "define" | "copy" | "cancel";
type DefineSelectionOption = 0 | 1 | 2;

const DEFINE_SELECTION_POPUP_WIDTH = 48;
const DEFINE_SELECTION_POPUP_HEIGHT = 9;

export type SelectionSupport = {
  uninstall?: () => void;
  tui?: any;
  start?: MousePoint;
  end?: MousePoint;
  busy: boolean;
};

function parseSgrMouse(data: string): MouseEvent | undefined {
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return undefined;
  const button = Number(match[1]);
  return {
    button,
    col: Number(match[2]),
    row: Number(match[3]),
    release: match[4] === "m",
    motion: (button & 32) !== 0,
  };
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b_pi:c\x07/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\([^)]/g, "");
}

function sliceVisibleText(
  text: string,
  startCol: number,
  endCol: number,
): string {
  const clean = stripAnsi(text);
  let col = 1;
  let result = "";
  for (const char of clean) {
    const next = col + Math.max(1, visibleWidth(char));
    if (next > startCol && col <= endCol) result += char;
    if (col > endCol) break;
    col = next;
  }
  return result;
}

function selectedTextFromScreen(
  tui: any,
  start: MousePoint,
  end: MousePoint,
): string {
  const lines = (tui?.previousLines ?? []) as string[];
  const viewportTop = Number(tui?.previousViewportTop ?? 0);
  if (!Array.isArray(lines) || lines.length === 0) return "";

  let a = { row: viewportTop + start.row - 1, col: start.col };
  let b = { row: viewportTop + end.row - 1, col: end.col };
  if (a.row > b.row || (a.row === b.row && a.col > b.col)) [a, b] = [b, a];

  const parts: string[] = [];
  for (let row = a.row; row <= b.row; row++) {
    const line = lines[row];
    if (line === undefined) continue;
    const from = row === a.row ? a.col : 1;
    const to =
      row === b.row ? b.col : Math.max(1, visibleWidth(stripAnsi(line)));
    parts.push(sliceVisibleText(line, from, to));
  }
  return parts.join("\n").replace(/\s+$/g, "").trim();
}

export function installSelectionDefineSupport(
  ctx: ExtensionContext,
  stateRef: () => LearningState,
): SelectionSupport {
  const support: SelectionSupport = { busy: false };

  ctx.ui.setWidget(
    "learning-tutor-selection-capture",
    (tui: any) => {
      support.tui = tui;
      return { render: () => [], invalidate: () => {} };
    },
    { placement: "belowEditor" },
  );

  if (process.stdout.isTTY) process.stdout.write(MOUSE_TRACKING_ON);
  support.uninstall = ctx.ui.onTerminalInput((data) => {
    if (!stateRef().active) return undefined;
    const mouse = parseSgrMouse(data);
    if (!mouse) return undefined;
    if (support.busy) return undefined;

    const leftButton = (mouse.button & 3) === 0;
    if (leftButton && !mouse.release && !mouse.motion) {
      support.start = { row: mouse.row, col: mouse.col };
      support.end = support.start;
      return { consume: true };
    }

    if (support.start && leftButton && mouse.motion) {
      support.end = { row: mouse.row, col: mouse.col };
      return { consume: true };
    }

    if (support.start && mouse.release) {
      support.end = { row: mouse.row, col: mouse.col };
      const popupPoint = { ...support.end };
      const moved =
        support.start.row !== support.end.row ||
        support.start.col !== support.end.col;
      const text = moved
        ? selectedTextFromScreen(support.tui, support.start, support.end).slice(
            0,
            500,
          )
        : "";
      support.start = undefined;
      support.end = undefined;
      if (text) void promptDefineSelection(ctx, stateRef(), text, support, popupPoint);
      return { consume: true };
    }

    return { consume: true };
  });

  return support;
}

export function uninstallSelectionDefineSupport(
  ctx?: ExtensionContext,
  support?: SelectionSupport,
): void {
  const hadSupport = Boolean(support);
  support?.uninstall?.();
  ctx?.ui.setWidget("learning-tutor-selection-capture", undefined);
  if (hadSupport && process.stdout.isTTY) process.stdout.write(MOUSE_TRACKING_OFF);
}

type ClipboardResult = { ok: true } | { ok: false; error: string };

function runClipboardCommand(
  command: string,
  args: string[],
  text: string,
): ClipboardResult {
  const result = spawnSync(command, args, {
    input: text,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status === 0) return { ok: true };
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  return {
    ok: false,
    error: stderr || `${command} exited with status ${result.status ?? "unknown"}`,
  };
}

function copyViaOsc52(text: string): ClipboardResult {
  if (!process.stdout.isTTY) {
    return { ok: false, error: "terminal clipboard is unavailable" };
  }
  const encoded = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
  return { ok: true };
}

function copyTextToClipboard(text: string): ClipboardResult {
  const attempts: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          [
            "pwsh.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
            ],
          ],
          [
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
            ],
          ],
          ["clip.exe", []],
        ]
      : process.platform === "darwin"
        ? [["pbcopy", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];

  let lastError = "no clipboard command was available";
  for (const [command, args] of attempts) {
    const result = runClipboardCommand(command, args, text);
    if (result.ok === true) return result;
    lastError = result.error;
  }

  const osc52 = copyViaOsc52(text);
  return osc52.ok === true ? osc52 : { ok: false, error: lastError };
}

export type ClipboardTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

function readClipboardCommand(
  command: string,
  args: string[],
): ClipboardTextResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status === 0) return { ok: true, text: String(result.stdout ?? "") };
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  return {
    ok: false,
    error: stderr || `${command} exited with status ${result.status ?? "unknown"}`,
  };
}

export function readTextFromClipboard(): ClipboardTextResult {
  const attempts: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          [
            "pwsh.exe",
            ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
          ],
          [
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
          ],
        ]
      : process.platform === "darwin"
        ? [["pbpaste", []]]
        : [
            ["termux-clipboard-get", []],
            ["wl-paste", ["--no-newline"]],
            ["xclip", ["-selection", "clipboard", "-o"]],
            ["xsel", ["--clipboard", "--output"]],
          ];

  let lastError = "no clipboard command was available";
  for (const [command, args] of attempts) {
    const result = readClipboardCommand(command, args);
    if (result.ok === true) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

async function promptDefineSelection(
  ctx: ExtensionContext,
  state: LearningState,
  text: string,
  support: SelectionSupport,
  point?: MousePoint,
): Promise<void> {
  if (support.busy || !ctx.hasUI) return;
  support.busy = true;
  try {
    const action = await showDefineSelectionPopup(ctx, text, point);
    if (action === "cancel") return;
    if (action === "copy") {
      const copied = copyTextToClipboard(text);
      ctx.ui.notify(
        copied.ok === true
          ? "Copied selected text to clipboard"
          : `Copy failed: ${copied.error}`,
        copied.ok === true ? "info" : "warning",
      );
      return;
    }
    ctx.ui.notify("Preparing definition overlay...", "info");
    const definition = await askModelForDefinition(ctx, state, text);
    await showDefinitionOverlay(ctx, text, definition);
  } finally {
    support.busy = false;
  }
}

async function showDefineSelectionPopup(
  ctx: ExtensionContext,
  text: string,
  point?: MousePoint,
): Promise<DefineSelectionAction> {
  const width = DEFINE_SELECTION_POPUP_WIDTH;
  const height = DEFINE_SELECTION_POPUP_HEIGHT;
  const termCols = process.stdout.columns || 100;
  const termRows = process.stdout.rows || 30;
  const cursorRow = Math.max(0, (point?.row ?? termRows) - 1);
  const cursorCol = Math.max(0, (point?.col ?? 1) - 1);
  const row =
    cursorRow + height < termRows ? cursorRow + 1 : Math.max(0, cursorRow - height);
  const col =
    cursorCol + width < termCols ? cursorCol + 1 : Math.max(0, cursorCol - width);
  return await ctx.ui.custom<DefineSelectionAction>(
    (_tui, theme, _keybindings, done) =>
      new DefineSelectionPopup(theme, text, done, { row, col }),
    {
      overlay: true,
      overlayOptions: {
        row,
        col,
        width,
        maxHeight: height,
        margin: 0,
      },
    },
  );
}

class DefineSelectionPopup {
  private selected: DefineSelectionOption = 0;
  private pressedOption: DefineSelectionOption | undefined;
  private lastClickAt = 0;
  private lastClickOption: DefineSelectionOption | undefined;

  constructor(
    private theme: Theme,
    private text: string,
    private done: (result: DefineSelectionAction) => void,
    private position: { row: number; col: number },
  ) {}

  handleInput(data: string): void {
    const mouse = parseSgrMouse(data);
    if (mouse) {
      this.handleMouse(mouse);
      return;
    }

    if (matchesKey(data, "escape") || data === "q") this.done("cancel");
    else if (matchesKey(data, "return") || matchesKey(data, "enter")) {
      this.done(this.actionFor(this.selected));
    } else if (matchesKey(data, "up") || data === "k") this.moveSelection(-1);
    else if (matchesKey(data, "down") || data === "j") this.moveSelection(1);
    else if (data === "d") this.done("define");
    else if (data === "c") this.done("copy");
  }

  private handleMouse(mouse: MouseEvent): void {
    const button = mouse.button & 3;
    const option = this.optionAt(mouse.row, mouse.col);

    if (!mouse.release && !mouse.motion && button === 0) {
      this.pressedOption = option;
      return;
    }

    if (!mouse.release || (button !== 0 && button !== 3)) return;
    if (option === undefined) return;
    if (this.pressedOption !== undefined && this.pressedOption !== option) {
      this.pressedOption = undefined;
      return;
    }
    this.pressedOption = undefined;

    const now = Date.now();
    const isDoubleClick =
      this.lastClickOption === option && now - this.lastClickAt < 500;
    this.selected = option;
    this.lastClickOption = option;
    this.lastClickAt = now;
    if (isDoubleClick) this.done(this.actionFor(option));
  }

  private moveSelection(delta: -1 | 1): void {
    this.selected = ((this.selected + delta + 3) % 3) as DefineSelectionOption;
  }

  private actionFor(option: DefineSelectionOption): DefineSelectionAction {
    if (option === 0) return "define";
    if (option === 1) return "copy";
    return "cancel";
  }

  private optionAt(row: number, col: number): DefineSelectionOption | undefined {
    const localRow = row - this.position.row - 1;
    const localCol = col - this.position.col - 1;
    if (localCol < 0 || localCol >= DEFINE_SELECTION_POPUP_WIDTH) return undefined;
    if (localRow === 4) return 0;
    if (localRow === 5) return 1;
    if (localRow === 6) return 2;
    return undefined;
  }

  render(width: number): string[] {
    const w = Math.max(40, Math.min(width, DEFINE_SELECTION_POPUP_WIDTH));
    const inner = w - 2;
    const preview = this.text.replace(/\s+/g, " ").slice(0, inner - 4);
    const pad = (s: string) =>
      s + " ".repeat(Math.max(0, inner - visibleWidth(s)));
    const row = (s = "") =>
      `${this.theme.fg("border", "│")}${pad(truncateToWidth(s, inner, "…"))}${this.theme.fg("border", "│")}`;
    const option = (idx: DefineSelectionOption, label: string) =>
      row(` ${idx === this.selected ? this.theme.fg("accent", "›") : " "} ${label}`);

    return [
      this.theme.fg("border", `╭${"─".repeat(inner)}╮`),
      row(` ${this.theme.fg("accent", "Use selected text?")}`),
      row(` “${preview}”`),
      row(""),
      option(0, "Define in learning overlay"),
      option(1, "Copy selected text"),
      option(2, "Cancel"),
      row(` ${this.theme.fg("dim", "Enter/d/c • double-click option")}`),
      this.theme.fg("border", `╰${"─".repeat(inner)}╯`),
    ];
  }

  invalidate(): void {}
}

class DefinitionOverlay {
  private markdown: Markdown;
  private scrollOffset = 0;
  private lastBodyLines = 1;

  constructor(
    private theme: Theme,
    private title: string,
    body: string,
    private done: () => void,
  ) {
    this.markdown = new Markdown(body, 1, 0, getMarkdownTheme());
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "return") ||
      matchesKey(data, "enter") ||
      data === "q"
    ) {
      this.done();
      return;
    }

    if (matchesKey(data, "up") || data === "k") this.scrollBy(-1);
    else if (matchesKey(data, "down") || data === "j") this.scrollBy(1);
    else if (matchesKey(data, "pageUp")) this.scrollBy(-this.lastBodyLines);
    else if (matchesKey(data, "pageDown") || data === " ")
      this.scrollBy(this.lastBodyLines);
  }

  private scrollBy(delta: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
  }

  render(width: number): string[] {
    const w = Math.max(44, Math.min(width, 96));
    const inner = w - 2;
    const maxTotal = Math.max(
      8,
      Math.floor((process.stdout.rows || 30) * 0.8) - 4,
    );
    const bodyLines = Math.max(1, maxTotal - 5);
    this.lastBodyLines = bodyLines;
    const renderedBody = this.markdown.render(inner);
    const maxOffset = Math.max(0, renderedBody.length - bodyLines);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const visibleBody = renderedBody.slice(
      this.scrollOffset,
      this.scrollOffset + bodyLines,
    );
    const lines: string[] = [];
    const pad = (s: string) =>
      s + " ".repeat(Math.max(0, inner - visibleWidth(s)));
    const row = (s = "") =>
      `${this.theme.fg("border", "│")}${pad(truncateToWidth(s, inner, "…"))}${this.theme.fg("border", "│")}`;
    lines.push(this.theme.fg("border", `╭${"─".repeat(inner)}╮`));
    lines.push(row(` ${this.theme.fg("accent", `Definition: ${this.title}`)}`));
    lines.push(row(""));
    for (const line of visibleBody) lines.push(row(line));
    lines.push(row(""));
    const scrollText =
      renderedBody.length > bodyLines
        ? ` • ${this.scrollOffset + 1}-${Math.min(
            renderedBody.length,
            this.scrollOffset + bodyLines,
          )}/${renderedBody.length}`
        : "";
    lines.push(
      row(
        ` ${this.theme.fg("dim", `↑/↓ PgUp/PgDn scroll${scrollText} • Enter/Esc/q closes`)}`,
      ),
    );
    lines.push(this.theme.fg("border", `╰${"─".repeat(inner)}╯`));
    return lines;
  }

  invalidate(): void {
    this.markdown.invalidate();
  }
}
