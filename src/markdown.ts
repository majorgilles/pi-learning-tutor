import { sanitizeLatexForTerminalMarkdown } from "./latex.js";

const FENCE_RE = /^(\s*)(`{3,}|~{3,})([^`~]*)$/;

function isMarkdownFenceInfo(info: string): boolean {
  const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return language === "md" || language === "markdown";
}

function isFenceClose(line: string, marker: string): boolean {
  const match = FENCE_RE.exec(line);
  if (!match) return false;
  const fence = match[2] ?? "";
  const info = match[3] ?? "";
  return (
    fence[0] === marker[0] &&
    fence.length >= marker.length &&
    info.trim().length === 0
  );
}

function nestedFenceStart(line: string): string | undefined {
  const match = FENCE_RE.exec(line);
  if (!match) return undefined;
  const fence = match[2] ?? "";
  const info = match[3] ?? "";
  return info.trim().length > 0 ? fence : undefined;
}

function fenceLine(marker: string, originalLine: string): string {
  const indent = originalLine.match(/^\s*/)?.[0] ?? "";
  return `${indent}${marker}`;
}

export function fixNestedMarkdownSourceFences(text: string): string {
  const lines = text.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const openMatch = FENCE_RE.exec(lines[i] ?? "");
    if (!openMatch) continue;

    const opener = openMatch[2] ?? "";
    const info = openMatch[3] ?? "";
    if (!isMarkdownFenceInfo(info)) continue;

    let nested: string | undefined;
    let closeIndex = -1;
    let maxFenceLength = opener.length;
    let sawNestedFence = false;

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";

      if (nested) {
        if (isFenceClose(line, nested)) {
          maxFenceLength = Math.max(maxFenceLength, nested.length);
          nested = undefined;
        }
        continue;
      }

      const nestedStart = nestedFenceStart(line);
      if (nestedStart) {
        nested = nestedStart;
        sawNestedFence = true;
        maxFenceLength = Math.max(maxFenceLength, nestedStart.length);
        continue;
      }

      if (isFenceClose(line, opener)) {
        closeIndex = j;
        break;
      }
    }

    if (!sawNestedFence || closeIndex === -1) continue;

    const replacementMarker = opener[0].repeat(maxFenceLength + 1);
    lines[i] = lines[i]!.replace(opener, replacementMarker);
    lines[closeIndex] = fenceLine(replacementMarker, lines[closeIndex] ?? "");
    changed = true;
    i = closeIndex;
  }

  return changed ? lines.join("\n") : text;
}

export function sanitizeAssistantMarkdown(text: string): string {
  return fixNestedMarkdownSourceFences(sanitizeLatexForTerminalMarkdown(text));
}
