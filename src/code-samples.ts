import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const CODE_SAMPLES_CUSTOM_TYPE = "learning-tutor-code-samples";

export interface CodeSample {
  index: number;
  language?: string;
  code: string;
  createdAt: number;
}

type TextPart = { type: string; text?: string; [key: string]: unknown };

interface MarkdownCodeBlock {
  language?: string;
  code: string;
}

interface NormalizedMarkdown {
  text: string;
  blocks: MarkdownCodeBlock[];
  changed: boolean;
}

interface FenceMatch {
  indent: string;
  fence: string;
  marker: "`" | "~";
  length: number;
  info: string;
}

const MAX_RENDERED_CODE_LINES_PER_SAMPLE = 24;

function openingFence(line: string): FenceMatch | undefined {
  const match = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
  if (!match) return undefined;
  const fence = match[2] ?? "```";
  return {
    indent: match[1] ?? "",
    fence,
    marker: fence[0] as "`" | "~",
    length: fence.length,
    info: (match[3] ?? "").trim(),
  };
}

function isClosingFence(line: string, opener: FenceMatch): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith(opener.marker.repeat(opener.length))) return false;
  return new RegExp(`^${opener.marker === "`" ? "`" : "~"}{${opener.length},}\\s*$`).test(
    trimmed,
  );
}

function commonWhitespacePrefix(lines: string[]): string {
  const nonBlank = lines.filter((line) => line.trim().length > 0);
  if (nonBlank.length === 0) return "";
  let prefix = nonBlank[0]?.match(/^[ \t]*/)?.[0] ?? "";
  for (const line of nonBlank.slice(1)) {
    const whitespace = line.match(/^[ \t]*/)?.[0] ?? "";
    let index = 0;
    while (
      index < prefix.length &&
      index < whitespace.length &&
      prefix[index] === whitespace[index]
    ) {
      index++;
    }
    prefix = prefix.slice(0, index);
    if (!prefix) break;
  }
  return prefix;
}

function stripPrefixWhenPresent(line: string, prefix: string): string {
  if (!prefix) return line;
  return line.startsWith(prefix) ? line.slice(prefix.length) : line;
}

function normalizeCodeLines(lines: string[], fenceIndent: string): {
  lines: string[];
  changed: boolean;
} {
  let changed = false;
  let normalized = lines.map((line) => {
    const next = stripPrefixWhenPresent(line, fenceIndent);
    if (next !== line) changed = true;
    return next;
  });

  while (normalized.length > 0 && normalized[0]?.trim() === "") {
    normalized = normalized.slice(1);
    changed = true;
  }
  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1]?.trim() === ""
  ) {
    normalized = normalized.slice(0, -1);
    changed = true;
  }

  const commonIndent = commonWhitespacePrefix(normalized);
  if (commonIndent) {
    normalized = normalized.map((line) => {
      if (!line.trim()) return line;
      const next = stripPrefixWhenPresent(line, commonIndent);
      if (next !== line) changed = true;
      return next;
    });
  }

  return { lines: normalized, changed };
}

function languageFromFenceInfo(info: string): string | undefined {
  return info.trim().split(/\s+/, 1)[0] || undefined;
}

export function normalizeMarkdownCodeBlocks(markdown: string): NormalizedMarkdown {
  const normalizedInput = markdown.replace(/\r\n/g, "\n");
  const lines = normalizedInput.split("\n");
  const output: string[] = [];
  const blocks: MarkdownCodeBlock[] = [];
  let changed = normalizedInput !== markdown;
  let pendingBlankAfterBlock = false;

  let opener: FenceMatch | undefined;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (!opener) {
      const nextOpener = openingFence(line);
      if (!nextOpener) {
        if (pendingBlankAfterBlock && line.trim() !== "") {
          output.push("");
          changed = true;
        }
        output.push(line);
        pendingBlankAfterBlock = false;
        continue;
      }

      if (output.length > 0 && output[output.length - 1]?.trim() !== "") {
        output.push("");
        changed = true;
      }
      opener = nextOpener;
      codeLines = [];
      continue;
    }

    if (!isClosingFence(line, opener)) {
      codeLines.push(line);
      continue;
    }

    const normalizedCode = normalizeCodeLines(codeLines, opener.indent);
    const fence = opener.marker.repeat(Math.max(3, opener.length));
    const opening = `${fence}${opener.info}`;
    output.push(opening);
    output.push(...normalizedCode.lines);
    output.push(fence);

    const closingWasIndented = line.match(/^[ \t]+/) !== null;
    if (
      opener.indent ||
      closingWasIndented ||
      normalizedCode.changed ||
      line.trim() !== fence
    ) {
      changed = true;
    }

    const code = normalizedCode.lines.join("\n");
    if (code.trim()) {
      blocks.push({ language: languageFromFenceInfo(opener.info), code });
    }

    opener = undefined;
    codeLines = [];
    pendingBlankAfterBlock = true;
  }

  if (opener) {
    output.push(`${opener.indent}${opener.fence}${opener.info}`);
    output.push(...codeLines);
  }

  return { text: output.join("\n"), blocks, changed };
}

export function normalizeCodeSamplesInContent<T>(
  content: T,
  createdAt = Date.now(),
): { content: T; samples: CodeSample[]; changed: boolean } {
  if (typeof content === "string") {
    const normalized = normalizeMarkdownCodeBlocks(content);
    return {
      content: normalized.text as T,
      samples: normalized.blocks.map((block, index) => ({
        index: index + 1,
        language: block.language,
        code: block.code,
        createdAt,
      })),
      changed: normalized.changed,
    };
  }

  if (!Array.isArray(content)) {
    return { content, samples: [], changed: false };
  }

  let changed = false;
  const samples: CodeSample[] = [];
  const mapped = content.map((part) => {
    const maybeText = part as TextPart;
    if (maybeText?.type !== "text" || typeof maybeText.text !== "string") {
      return part;
    }

    const normalized = normalizeMarkdownCodeBlocks(maybeText.text);
    changed ||= normalized.changed;
    for (const block of normalized.blocks) {
      samples.push({
        index: samples.length + 1,
        language: block.language,
        code: block.code,
        createdAt,
      });
    }

    return normalized.changed ? { ...maybeText, text: normalized.text } : part;
  });

  return { content: mapped as T, samples, changed };
}

export function renderCodeSamplesMessage(
  message: { details?: unknown },
  _options: unknown,
  theme: Theme,
): CodeSamplesCard {
  const samples = codeSamplesFromDetails(message.details);
  return new CodeSamplesCard(theme, samples);
}

export function codeSamplesFromDetails(details: unknown): CodeSample[] {
  const samples = (details as { samples?: unknown })?.samples;
  if (!Array.isArray(samples)) return [];
  return samples
    .filter(
      (sample): sample is CodeSample =>
        typeof sample === "object" &&
        sample !== null &&
        typeof (sample as CodeSample).index === "number" &&
        typeof (sample as CodeSample).code === "string",
    )
    .map((sample) => ({
      index: sample.index,
      language: sample.language,
      code: sample.code,
      createdAt: sample.createdAt,
    }));
}

class CodeSamplesCard {
  constructor(
    private theme: Theme,
    private samples: CodeSample[],
  ) {}

  render(width: number): string[] {
    if (this.samples.length === 0) {
      return [this.theme.fg("dim", "No copyable code samples found.")];
    }

    const w = Math.max(44, Math.min(width, 104));
    const inner = w - 2;
    const lines: string[] = [];

    for (const sample of this.samples) {
      if (lines.length > 0) lines.push("");
      const header = ` Copyable code sample ${sample.index}${
        sample.language ? ` · ${sample.language}` : ""
      } `;
      lines.push(this.border("╭", "╮", inner, header));
      for (const codeLine of this.renderedCodeLines(sample)) {
        lines.push(this.row(codeLine, inner));
      }
      const footer = ` /copy-code ${sample.index} copies raw code `;
      lines.push(this.border("╰", "╯", inner, footer));
    }

    return lines;
  }

  invalidate(): void {}

  private renderedCodeLines(sample: CodeSample): string[] {
    const codeLines = sample.code.split("\n");
    const visible = codeLines.slice(0, MAX_RENDERED_CODE_LINES_PER_SAMPLE);
    if (codeLines.length > visible.length) {
      visible.push(`… ${codeLines.length - visible.length} more line(s); use /copy-code ${sample.index}`);
    }
    return visible;
  }

  private row(text: string, inner: number): string {
    const truncated = truncateToWidth(text.replace(/\t/g, "  "), inner - 2, "…");
    const body = ` ${truncated}`;
    return `${this.theme.fg("border", "│")}${this.pad(body, inner)}${this.theme.fg("border", "│")}`;
  }

  private border(
    left: "╭" | "╰",
    right: "╮" | "╯",
    inner: number,
    label: string,
  ): string {
    const styledLabel = this.theme.fg("accent", label);
    const remaining = Math.max(0, inner - visibleWidth(label));
    return `${this.theme.fg("border", left)}${styledLabel}${this.theme.fg(
      "border",
      "─".repeat(remaining),
    )}${this.theme.fg("border", right)}`;
  }

  private pad(text: string, width: number): string {
    return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
  }
}
