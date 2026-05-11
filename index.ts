import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { complete, getModel } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
type EditModeState =
  | { phase: "off" }
  | { phase: "draft"; request: string; startedAt: number }
  | { phase: "awaiting-approval"; request: string; startedAt: number }
  | { phase: "apply"; request: string; startedAt: number };

interface ExerciseRecord {
  topic?: string;
  createdAt: number;
}

interface LearningState {
  active: boolean;
  goal?: string;
  currentStep?: string;
  relevantFiles: string[];
  reviewedDiffRefs: string[];
  lastLearnerSignal?: string;
  exercisesGiven: ExerciseRecord[];
  progressNotes: string[];
  editMode: EditModeState;
  updatedAt: number;
}

const STATE_ENTRY_TYPE = "learning-tutor-state";
const CONTEXT_CUSTOM_TYPE = "learning-tutor-context";
const LEARN_DONE = new Set(["done", "off", "stop", "exit", "end"]);
const MOUSE_TRACKING_ON = "\x1b[?1002h\x1b[?1006h";
const MOUSE_TRACKING_OFF = "\x1b[?1002l\x1b[?1006l";

const DEFAULT_STATE: LearningState = {
  active: false,
  goal: undefined,
  currentStep: undefined,
  relevantFiles: [],
  reviewedDiffRefs: [],
  lastLearnerSignal: undefined,
  exercisesGiven: [],
  progressNotes: [],
  editMode: { phase: "off" },
  updatedAt: Date.now(),
};

const READINESS_RE =
  /^\s*(done|review|ready|i\s+tried\s+it|i\s+changed\s+it|take\s+a\s+look|please\s+review|here'?s\s+my\s+attempt)\b/i;

interface LanguageHint {
  name: string;
  fence: string;
  source: string;
}

const DEFAULT_LANGUAGE_HINT: LanguageHint = {
  name: "the current project language",
  fence: "text",
  source: "fallback",
};

const MARKER_LANGUAGES: Array<{ marker: string; name: string; fence: string }> =
  [
    { marker: "Cargo.toml", name: "Rust", fence: "rust" },
    { marker: "go.mod", name: "Go", fence: "go" },
    { marker: "pyproject.toml", name: "Python", fence: "python" },
    { marker: "requirements.txt", name: "Python", fence: "python" },
    { marker: "setup.py", name: "Python", fence: "python" },
    { marker: "tsconfig.json", name: "TypeScript", fence: "typescript" },
    { marker: "deno.json", name: "TypeScript", fence: "typescript" },
    {
      marker: "package.json",
      name: "JavaScript/TypeScript",
      fence: "typescript",
    },
    { marker: "pom.xml", name: "Java", fence: "java" },
    { marker: "build.gradle", name: "Java/Kotlin", fence: "java" },
    { marker: "build.gradle.kts", name: "Kotlin", fence: "kotlin" },
    { marker: "Gemfile", name: "Ruby", fence: "ruby" },
    { marker: "composer.json", name: "PHP", fence: "php" },
    { marker: "Package.swift", name: "Swift", fence: "swift" },
  ];

const EXTENSION_LANGUAGES: Record<string, { name: string; fence: string }> = {
  ".rs": { name: "Rust", fence: "rust" },
  ".ts": { name: "TypeScript", fence: "typescript" },
  ".tsx": { name: "TypeScript/React", fence: "tsx" },
  ".js": { name: "JavaScript", fence: "javascript" },
  ".jsx": { name: "JavaScript/React", fence: "jsx" },
  ".py": { name: "Python", fence: "python" },
  ".go": { name: "Go", fence: "go" },
  ".java": { name: "Java", fence: "java" },
  ".kt": { name: "Kotlin", fence: "kotlin" },
  ".cs": { name: "C#", fence: "csharp" },
  ".cpp": { name: "C++", fence: "cpp" },
  ".cc": { name: "C++", fence: "cpp" },
  ".cxx": { name: "C++", fence: "cpp" },
  ".c": { name: "C", fence: "c" },
  ".h": { name: "C/C++", fence: "c" },
  ".hpp": { name: "C++", fence: "cpp" },
  ".swift": { name: "Swift", fence: "swift" },
  ".rb": { name: "Ruby", fence: "ruby" },
  ".php": { name: "PHP", fence: "php" },
  ".dart": { name: "Dart", fence: "dart" },
  ".scala": { name: "Scala", fence: "scala" },
  ".wgsl": { name: "WGSL", fence: "wgsl" },
};

const LANGUAGE_SCAN_IGNORES = new Set([
  ".git",
  "target",
  "node_modules",
  "dist",
  "build",
  ".next",
  "vendor",
]);

function detectCurrentLanguage(cwd: string): LanguageHint {
  for (const marker of MARKER_LANGUAGES) {
    if (existsSync(join(cwd, marker.marker))) {
      return { name: marker.name, fence: marker.fence, source: marker.marker };
    }
  }

  const counts = new Map<
    string,
    { count: number; name: string; fence: string }
  >();
  const visit = (dir: string, depth: number): void => {
    if (depth > 2) return;
    let entries: any[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!LANGUAGE_SCAN_IGNORES.has(entry.name)) visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        if (statSync(fullPath).size > 512_000) continue;
      } catch {
        continue;
      }
      const language = EXTENSION_LANGUAGES[extname(entry.name).toLowerCase()];
      if (!language) continue;
      const existing = counts.get(language.fence) ?? {
        count: 0,
        name: language.name,
        fence: language.fence,
      };
      existing.count += 1;
      counts.set(language.fence, existing);
    }
  };

  visit(cwd, 0);
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return top
    ? { name: top.name, fence: top.fence, source: "file extensions" }
    : DEFAULT_LANGUAGE_HINT;
}

function cloneState(state: LearningState): LearningState {
  return {
    ...state,
    relevantFiles: [...state.relevantFiles],
    reviewedDiffRefs: [...state.reviewedDiffRefs],
    exercisesGiven: [...state.exercisesGiven],
    progressNotes: [...state.progressNotes],
    editMode: { ...state.editMode } as EditModeState,
  };
}

function restoreState(ctx: ExtensionContext): LearningState {
  const latest = ctx.sessionManager
    .getEntries()
    .filter(
      (entry: any) =>
        entry?.type === "custom" && entry.customType === STATE_ENTRY_TYPE,
    )
    .pop() as { data?: Partial<LearningState> } | undefined;

  if (!latest?.data) return cloneState(DEFAULT_STATE);

  return {
    ...cloneState(DEFAULT_STATE),
    ...latest.data,
    relevantFiles: Array.isArray(latest.data.relevantFiles)
      ? latest.data.relevantFiles
      : [],
    reviewedDiffRefs: Array.isArray(latest.data.reviewedDiffRefs)
      ? latest.data.reviewedDiffRefs
      : [],
    exercisesGiven: Array.isArray(latest.data.exercisesGiven)
      ? latest.data.exercisesGiven
      : [],
    progressNotes: Array.isArray(latest.data.progressNotes)
      ? latest.data.progressNotes
      : [],
    editMode: latest.data.editMode ?? { phase: "off" },
    updatedAt: latest.data.updatedAt ?? Date.now(),
  };
}

function firstWord(text: string): string {
  return text.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

function shellSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function tokenize(segment: string): string[] {
  return (
    segment
      .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
      ?.map((t) => t.replace(/^['"]|['"]$/g, "")) ?? []
  );
}

function isReadOnlyGit(tokens: string[]): boolean {
  const sub = tokens[1];
  return [
    "status",
    "log",
    "diff",
    "show",
    "branch",
    "grep",
    "ls-files",
    "remote",
    "rev-parse",
    "describe",
    "blame",
  ].includes(sub);
}

function isReadOnlyGh(tokens: string[]): boolean {
  const sub = tokens[1];
  const sub2 = tokens[2];
  if (sub === "issue")
    return [undefined, "list", "view", "status"].includes(sub2);
  if (sub === "pr")
    return [undefined, "list", "view", "status", "diff", "checks"].includes(
      sub2,
    );
  if (sub === "repo") return [undefined, "view", "list"].includes(sub2);
  if (sub === "label" || sub === "milestone")
    return [undefined, "list", "view"].includes(sub2);
  return ["status", "auth"].includes(sub);
}

function isProbablyReadOnlyBash(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;

  // Shell redirection and common write-through helpers mutate files even when paired with read-only commands.
  if (/(^|[^<])>(>|&)?\s*\S/.test(trimmed) || /\btee\b/.test(trimmed))
    return false;

  const mutatingPattern =
    /\b(rm|mv|cp|mkdir|rmdir|touch|chmod|chown|sudo|kill|pkill|reboot|shutdown|npm\s+install|pnpm\s+add|yarn\s+add|cargo\s+add|cargo\s+install|pip\s+install|sed\s+-i|perl\s+-pi|git\s+(add|commit|push|checkout|switch|reset|merge|rebase|apply|stash|clean|restore)|gh\s+(issue|pr)\s+(create|edit|close|reopen|comment|merge)|curl\s+.*\|\s*(sh|bash)|wget\s+.*\|\s*(sh|bash))\b/i;
  if (mutatingPattern.test(trimmed)) return false;

  for (const segment of shellSegments(trimmed)) {
    // Pipelines are allowed only when each command in the pipeline is read-only.
    for (const part of segment
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean)) {
      const tokens = tokenize(part);
      const cmd = firstWord(part);
      if (!cmd) continue;
      if (
        [
          "pwd",
          "ls",
          "cat",
          "head",
          "tail",
          "less",
          "more",
          "wc",
          "sort",
          "uniq",
          "cut",
          "awk",
          "jq",
          "rg",
          "grep",
          "find",
          "tree",
          "du",
          "df",
          "echo",
          "printf",
          "curl",
          "wget",
        ].includes(cmd)
      )
        continue;
      if (cmd === "git" && isReadOnlyGit(tokens)) continue;
      if (cmd === "gh" && isReadOnlyGh(tokens)) continue;
      if (
        ["npm", "pnpm", "yarn"].includes(cmd) &&
        tokens.some((t) => ["test", "run"].includes(t))
      )
        continue;
      if (
        cmd === "cargo" &&
        tokens.some((t) =>
          ["test", "check", "build", "clippy", "fmt"].includes(t),
        )
      )
        continue;
      if (
        cmd === "python" ||
        cmd === "python3" ||
        cmd === "node" ||
        cmd === "bun"
      )
        continue;
      return false;
    }
  }
  return true;
}

function textFromMessage(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function recentConversationSnippet(
  ctx: ExtensionContext,
  maxChars = 3000,
): string {
  const chunks: string[] = [];
  const branch = ctx.sessionManager.getBranch();
  for (
    let i = branch.length - 1;
    i >= 0 && chunks.join("\n\n").length < maxChars;
    i--
  ) {
    const entry: any = branch[i];
    if (entry?.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = textFromMessage(entry.message).trim();
    if (!text || text.includes("[LEARNING TUTOR MODE ACTIVE]")) continue;
    chunks.unshift(`${role}: ${text.slice(0, 900)}`);
  }
  return chunks.join("\n\n").slice(-maxChars);
}

function learningInstructions(
  state: LearningState,
  language: LanguageHint,
): string {
  const editMode = state.editMode.phase;
  return `[LEARNING TUTOR MODE ACTIVE]

You are a Pi learning tutor, not a normal coding agent.

Active learning goal/context:
${state.goal || "(not specified)"}

Current language hint:
- Primary language: ${language.name} (detected from ${language.source}).
- Use Markdown code fences tagged as \`\`\`${language.fence}\` for ${language.name} examples so Pi can syntax-highlight them.

Default behavior:
- Optimize for durable learning, not fast task completion.
- Accept arbitrary context. Do NOT assume the input is a GitHub issue or any fixed format.
- Give one small learner-owned next step at a time.
- Before asking the learner to type code or commands, present the underlying concepts so they understand WHY the step matters.
- Name 1-3 concepts for the current step, explain each in learner-friendly language, and tie each concept directly to the exact code/command they are about to type.
- Ask at most one focused diagnostic question if needed.
- Prefer Socratic hints, concise explanations, and checkable instructions.
- When a code example would help, show a small exact code sample, not vague pseudocode.
- Put every code sample in a fenced Markdown code block with the correct language tag for syntax highlighting; default to \`\`\`${language.fence}\` for current-language code.
- Keep code samples minimal and illustrative; do not write, edit, or generate complete task solutions for the learner in default learning mode.
- When the learner signals readiness (done/review/I tried it/etc.), inspect relevant diffs/files first, then review before giving the next step.
- Use bounded proactive inspection: obvious/referenced files, git status/diff, and narrow searches are OK; ask before broad repo scans.
- When you inspect files/diffs, briefly say what you inspected.

Tool access:
- You have full access to external/research tools during learning mode (for example web_search, code_search, fetch_content, MCP tools, gh, curl, or small URL-fetch scripts) and you do not need to ask before using them when they help the learner.
- You may also use bounded local inspection tools such as read, grep/find/ls, and safe bash commands like git status/git diff/tests.
- You must not use edit/write unless edit-mode apply is explicitly approved.
- Mutating bash commands are blocked in default learning mode.

Edit mode status: ${editMode}
${editMode === "draft" ? "- The user requested edit mode. Draft a patch/proposal only. Do NOT apply it. Tell the user to run `/edit-mode apply` if they explicitly want it applied." : ""}
${editMode === "apply" ? "- The user explicitly approved applying the previously drafted patch. Apply only the scoped approved change, then return to learning-mode explanation." : ""}

Response shape:
1. Briefly orient the learner.
2. Add a short **Concepts behind this step** section with 1-3 bullets: concept name, why it matters, and how it appears in the upcoming code/command.
3. Give the next small step or review, with exact syntax-highlighted code samples when useful.
4. End with exactly what the learner should do next.`;
}

function reviewSignalPrompt(original: string): string {
  return `[LEARNER READY FOR REVIEW]

The learner signaled readiness with: ${JSON.stringify(original)}

Before giving the next learning step:
1. Inspect relevant context using bounded read-only tools.
2. Prefer git status and git diff when in a git repo.
3. Read only relevant files/diffs.
4. Summarize what you inspected.
5. Give concise review: what is good, what to improve, and the next small learner-owned step.
6. Before the next typing step, include the concepts behind it and why those concepts matter.`;
}

function updateStatus(ctx: ExtensionContext, state: LearningState): void {
  if (!state.active) {
    ctx.ui.setStatus("learning-tutor", undefined);
    ctx.ui.setWidget("learning-tutor", undefined);
    return;
  }

  const phase =
    state.editMode.phase === "off"
      ? "no AI edits"
      : `edit: ${state.editMode.phase}`;
  ctx.ui.setStatus(
    "learning-tutor",
    ctx.ui.theme.fg("warning", `🎓 learning (${phase})`),
  );
  ctx.ui.setWidget("learning-tutor", [
    ctx.ui.theme.fg("accent", "🎓 Learning mode active"),
    ctx.ui.theme.fg(
      "muted",
      `Goal: ${state.goal ? state.goal.slice(0, 100) : "(unspecified)"}`,
    ),
    ctx.ui.theme.fg(
      "muted",
      "AI file edits are blocked unless `/edit-mode apply` is approved.",
    ),
  ]);
}

function persist(pi: ExtensionAPI, state: LearningState): void {
  state.updatedAt = Date.now();
  pi.appendEntry(STATE_ENTRY_TYPE, cloneState(state));
}

async function sendAsUser(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  message: string,
): Promise<void> {
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
  } else {
    pi.sendUserMessage(message, { deliverAs: "followUp" });
    ctx.ui.notify("Learning tutor request queued as a follow-up", "info");
  }
}

async function askModelForDefinition(
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
  const prompt = `You are helping a learner understand a term from a coding/technology tutoring session.

Term or sentence to define:
${text}
Active learning goal:
${state.goal || "(none)"}

Recent conversation context:
${recentConversationSnippet(ctx, 2400) || "(none)"}

Return a compact Markdown explanation with:
- Short meaning
- Why it matters here
- Tiny exact code example or analogy if useful; use fenced Markdown code blocks tagged as \`\`\`${language.fence}\` for ${language.name} code so it syntax-highlights
- One follow-up question the learner might ask

Do not solve the learner's coding task.`;
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

async function showDefinitionOverlay(
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

type SelectionSupport = {
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

function sliceVisibleText(text: string, startCol: number, endCol: number): string {
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

function selectedTextFromScreen(tui: any, start: MousePoint, end: MousePoint): string {
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
    const to = row === b.row ? b.col : Math.max(1, visibleWidth(stripAnsi(line)));
    parts.push(sliceVisibleText(line, from, to));
  }
  return parts.join("\n").replace(/\s+$/g, "").trim();
}

function installSelectionDefineSupport(
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
      const moved = support.start.row !== support.end.row || support.start.col !== support.end.col;
      const text = moved ? selectedTextFromScreen(support.tui, support.start, support.end).slice(0, 500) : "";
      support.start = undefined;
      support.end = undefined;
      if (text) void promptDefineSelection(ctx, stateRef(), text, support, popupPoint);
      return { consume: true };
    }

    return { consume: true };
  });

  return support;
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

type ClipboardTextResult = { ok: true; text: string } | { ok: false; error: string };

function readClipboardCommand(command: string, args: string[]): ClipboardTextResult {
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

function readTextFromClipboard(): ClipboardTextResult {
  const attempts: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          ["pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"]],
          ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"]],
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
        copied.ok === true ? "Copied selected text to clipboard" : `Copy failed: ${copied.error}`,
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
  const row = cursorRow + height < termRows ? cursorRow + 1 : Math.max(0, cursorRow - height);
  const col = cursorCol + width < termCols ? cursorCol + 1 : Math.max(0, cursorCol - width);
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
    const isDoubleClick = this.lastClickOption === option && now - this.lastClickAt < 500;
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
    const pad = (s: string) => s + " ".repeat(Math.max(0, inner - visibleWidth(s)));
    const row = (s = "") => `${this.theme.fg("border", "│")}${pad(truncateToWidth(s, inner, "…"))}${this.theme.fg("border", "│")}`;
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
    else if (matchesKey(data, "pageDown") || data === " ") this.scrollBy(this.lastBodyLines);
  }

  private scrollBy(delta: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
  }

  render(width: number): string[] {
    const w = Math.max(44, Math.min(width, 96));
    const inner = w - 2;
    const maxTotal = Math.max(8, Math.floor((process.stdout.rows || 30) * 0.8) - 4);
    const bodyLines = Math.max(1, maxTotal - 5);
    this.lastBodyLines = bodyLines;
    const renderedBody = this.markdown.render(inner);
    const maxOffset = Math.max(0, renderedBody.length - bodyLines);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const visibleBody = renderedBody.slice(this.scrollOffset, this.scrollOffset + bodyLines);
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
        ? ` • ${this.scrollOffset + 1}-${Math.min(renderedBody.length, this.scrollOffset + bodyLines)}/${renderedBody.length}`
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

export default function learningTutorExtension(pi: ExtensionAPI): void {
  let state: LearningState = cloneState(DEFAULT_STATE);
  let selectionSupport: SelectionSupport | undefined;

  function enableSelectionSupport(_ctx: ExtensionContext): void {
    // Disabled by design: enabling terminal mouse tracking interferes with native
    // multi-line terminal selection/copy. Use `/define` with copied clipboard text
    // instead of capturing mouse drags inside the extension.
    return;
  }

  function disableSelectionSupport(ctx?: ExtensionContext): void {
    const hadSupport = Boolean(selectionSupport);
    selectionSupport?.uninstall?.();
    selectionSupport = undefined;
    ctx?.ui.setWidget("learning-tutor-selection-capture", undefined);
    if (hadSupport && process.stdout.isTTY) process.stdout.write(MOUSE_TRACKING_OFF);
  }

  function enableLearning(ctx: ExtensionContext, goal: string): void {
    state = {
      ...state,
      active: true,
      goal: goal || state.goal,
      editMode: { phase: "off" },
    };
    enableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  function disableLearning(ctx: ExtensionContext): void {
    state = { ...state, active: false, editMode: { phase: "off" } };
    disableSelectionSupport(ctx);
    updateStatus(ctx, state);
    persist(pi, state);
  }

  pi.on("session_start", async (_event, ctx) => {
    disableSelectionSupport(ctx);
    state = restoreState(ctx);
    if (state.active) {
      enableSelectionSupport(ctx);
    }
    updateStatus(ctx, state);
  });

  pi.on("session_shutdown", async () => {
    disableSelectionSupport();
  });

  pi.registerCommand("learn", {
    description:
      "Start/stop a persistent learning-tutor thread: /learn <anything>, /learn done, /learn off",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (LEARN_DONE.has(trimmed.toLowerCase())) {
        disableLearning(ctx);
        ctx.ui.notify("Learning mode off", "info");
        return;
      }

      if (!trimmed) {
        ctx.ui.notify("Usage: /learn <anything> or /learn done", "warning");
        return;
      }

      enableLearning(ctx, trimmed);
      await sendAsUser(
        pi,
        ctx,
        `[START LEARNING THREAD]\n\nUser-provided context can be any format; do not assume a GitHub issue.\n\nContext:\n${trimmed}\n\nStart by orienting me, optionally inspect bounded context if useful, then explain the concepts behind the work and give me one small learner-owned next step.`,
      );
    },
  });

  pi.registerCommand("exercise", {
    description: "Generate a context-relevant practice exercise",
    handler: async (args, ctx) => {
      if (!state.active) {
        ctx.ui.notify(
          "Tip: start learning mode with /learn <anything> for context-aware exercises.",
          "info",
        );
      }
      state.exercisesGiven.push({
        topic: args.trim() || undefined,
        createdAt: Date.now(),
      });
      persist(pi, state);
      await sendAsUser(
        pi,
        ctx,
        `[LEARNING EXERCISE REQUEST]\n\nCreate a small practice exercise${args.trim() ? ` about: ${args.trim()}` : " based on the current learning context"}. Make it logical for my current context. Include the concepts being practiced, why those concepts matter, the goal, constraints, hints, and how I should ask for review. Do not provide the solution.`,
      );
    },
  });

  pi.registerCommand("review", {
    description:
      "Broad learning review, e.g. /review commit history or /review overall task",
    handler: async (args, ctx) => {
      await sendAsUser(
        pi,
        ctx,
        `[BROAD LEARNING REVIEW REQUEST]\n\nScope: ${args.trim() || "overall current learning thread"}\n\nThis is not the normal per-step review. Use bounded inspection appropriate to the scope. If the scope mentions commit history, inspect git log/diff/status read-only. Summarize learning progress, recurring issues, the key concepts involved, and 2-3 next improvement steps.`,
      );
    },
  });

  pi.registerCommand("define", {
    description:
      "Define text in an overlay. With no args, reads the clipboard first.",
    handler: async (args, ctx) => {
      const explicitText = args.trim();
      const clipboard = explicitText ? undefined : readTextFromClipboard();
      const clipboardText = clipboard?.ok === true ? clipboard.text.trim() : "";
      const text =
        explicitText ||
        clipboardText ||
        (
          await ctx.ui.input("Define what word or sentence?", "borrow checker")
        )?.trim();
      if (!text) return;
      if (!explicitText && clipboard && clipboard.ok === false) {
        ctx.ui.notify(`Could not read clipboard: ${clipboard.error}`, "warning");
      }
      ctx.ui.notify("Preparing definition overlay...", "info");
      const definition = await askModelForDefinition(ctx, state, text);
      await showDefinitionOverlay(ctx, text, definition);
    },
  });

  pi.registerShortcut("ctrl+shift+d", {
    description: "Define selected/current text in learning overlay fallback",
    handler: async (ctx) => {
      const editorText = ctx.ui.getEditorText()?.trim();
      const text =
        editorText ||
        (
          await ctx.ui.input("Define what word or sentence?", "term to define")
        )?.trim();
      if (!text) return;
      ctx.ui.notify("Preparing definition overlay...", "info");
      const definition = await askModelForDefinition(
        ctx as ExtensionCommandContext,
        state,
        text,
      );
      await showDefinitionOverlay(
        ctx as ExtensionCommandContext,
        text,
        definition,
      );
    },
  });

  pi.registerCommand("edit-mode", {
    description:
      "Two-step patch approval: /edit-mode <request>, then /edit-mode apply",
    handler: async (args, ctx) => {
      if (!state.active) {
        ctx.ui.notify(
          "Edit mode is only available inside learning mode. Start with /learn <anything>.",
          "warning",
        );
        return;
      }

      const trimmed = args.trim();
      if (trimmed.toLowerCase() === "apply") {
        if (state.editMode.phase !== "awaiting-approval") {
          ctx.ui.notify(
            "No drafted patch is awaiting approval. Run /edit-mode <request> first.",
            "warning",
          );
          return;
        }
        state.editMode = {
          phase: "apply",
          request: state.editMode.request,
          startedAt: Date.now(),
        };
        persist(pi, state);
        updateStatus(ctx, state);
        await sendAsUser(
          pi,
          ctx,
          `[EDIT MODE APPLY APPROVED]\n\nApply only the previously drafted/scoped patch for this request:\n${state.editMode.request}\n\nAfter applying, explain what changed, the concepts behind the changes, and return me to learner-owned next steps.`,
        );
        return;
      }

      const request =
        trimmed ||
        (
          await ctx.ui.editor(
            "What should the AI draft? It will not apply changes yet.",
            "",
          )
        )?.trim();
      if (!request) return;
      state.editMode = { phase: "draft", request, startedAt: Date.now() };
      persist(pi, state);
      updateStatus(ctx, state);
      await sendAsUser(
        pi,
        ctx,
        `[EDIT MODE DRAFT REQUEST]\n\nDraft a patch/proposal for this request, but do NOT apply it and do NOT call edit/write:\n${request}\n\nExplain the concepts behind the patch and why each change is needed so I can learn from it. End by saying I can run /edit-mode apply if I explicitly want it applied.`,
      );
    },
  });

  pi.on("input", async (event) => {
    if (
      !state.active ||
      event.source === "extension" ||
      event.text.trim().startsWith("/")
    ) {
      return { action: "continue" };
    }

    if (READINESS_RE.test(event.text)) {
      state.lastLearnerSignal = event.text.trim();
      persist(pi, state);
      return { action: "transform", text: reviewSignalPrompt(event.text) };
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!state.active) return;
    return {
      message: {
        customType: CONTEXT_CUSTOM_TYPE,
        content: learningInstructions(state, detectCurrentLanguage(ctx.cwd)),
        display: false,
      },
    };
  });
  pi.on("tool_call", async (event) => {
    if (!state.active) return;
    const applying = state.editMode.phase === "apply";

    if (isToolCallEventType("bash", event)) {
      if (applying) return;
      const command = event.input.command ?? "";
      if (!isProbablyReadOnlyBash(command)) {
        return {
          block: true,
          reason: `Learning tutor blocked a mutating bash command. Default learning mode is read-only for local changes, but external/research tools are allowed. Use /edit-mode for two-step patch approval.\nCommand: ${command}`,
        };
      }
      return;
    }

    if (event.toolName === "edit" || event.toolName === "write") {
      if (applying) return;
      return {
        block: true,
        reason:
          "Learning tutor blocked AI file edits. The learner should type the code. Use /edit-mode for two-step patch approval.",
      };
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active) return;

    if (state.editMode.phase === "draft") {
      state.editMode = {
        phase: "awaiting-approval",
        request: state.editMode.request,
        startedAt: state.editMode.startedAt,
      };
      persist(pi, state);
      updateStatus(ctx, state);
      return;
    }

    if (state.editMode.phase === "apply") {
      state.editMode = { phase: "off" };
      persist(pi, state);
      updateStatus(ctx, state);
    }
  });
}
