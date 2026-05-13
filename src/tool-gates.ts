import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { textFromMessage } from "./conversation.js";
import type { CommentSyntax } from "./types.js";

export const READINESS_RE =
  /^\s*(done|review|ready|i\s+tried\s+it|i\s+changed\s+it|take\s+a\s+look|please\s+review|here'?s\s+my\s+attempt)\b/i;

const COMMENT_TARGET_RE =
  /\b(comment(?:s|ary|ing)?|annotat(?:e|ed|ing|ion|ions)|doc(?:s|umentation|string)s?|javadocs?|jsdocs?|inline\s+notes?|explanatory\s+notes?)\b/i;
const COMMENT_MUTATION_RE =
  /\b(add|insert|include|write|put|place|update|modify|change|replace|improve|expand|make|clarify|annotate|document)\b/i;
const COMMENT_EXPLAIN_IN_COMMENTS_RE =
  /\b(explain|clarify)\b[\s\S]{0,80}\b(in|as|with)\s+(?:inline\s+)?comments?\b/i;
const COMMENT_CODE_VERB_RE =
  /\b(comment|annotate|document)\b[\s\S]{0,40}\b(code|file|function|class|method|module|implementation|logic|this)\b/i;
const AFFIRMATIVE_RE =
  /^\s*(yes|yep|yeah|sure|ok(?:ay)?|please|do it|go ahead|sounds good)\b/i;

const C_LIKE_COMMENT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".kt",
  ".kts",
  ".cs",
  ".go",
  ".rs",
  ".swift",
  ".php",
  ".dart",
  ".scala",
  ".sol",
  ".wgsl",
  ".jsonc",
  ".json5",
]);
const HASH_COMMENT_EXTENSIONS = new Set([
  ".py",
  ".rb",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".dockerignore",
  ".gitignore",
]);
const CSS_COMMENT_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);
const HTML_COMMENT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".mdx",
]);
const TEMPLATE_COMMENT_EXTENSIONS = new Set([".vue", ".svelte", ".astro"]);
const SQL_COMMENT_EXTENSIONS = new Set([".sql"]);
const LUA_COMMENT_EXTENSIONS = new Set([".lua"]);
const HASKELL_COMMENT_EXTENSIONS = new Set([".hs", ".lhs"]);

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
      ?.map((t) => t.replace(/^["']|["']$/g, "")) ?? []
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

export function isProbablyReadOnlyBash(command: string): boolean {
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

function textRequestsCommentEdit(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    COMMENT_EXPLAIN_IN_COMMENTS_RE.test(trimmed) ||
    COMMENT_CODE_VERB_RE.test(trimmed) ||
    (COMMENT_TARGET_RE.test(trimmed) && COMMENT_MUTATION_RE.test(trimmed))
  );
}

function latestUserMessage(
  ctx: ExtensionContext,
): { text: string; index: number } | undefined {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry: any = branch[i];
    if (entry?.type !== "message" || entry.message?.role !== "user") continue;
    const text = textFromMessage(entry.message).trim();
    if (!text || text.includes("[LEARNING TUTOR MODE ACTIVE]")) continue;
    return { text, index: i };
  }
  return undefined;
}

function previousAssistantText(
  ctx: ExtensionContext,
  beforeIndex: number,
): string {
  const branch = ctx.sessionManager.getBranch();
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const entry: any = branch[i];
    if (entry?.type !== "message" || entry.message?.role !== "assistant")
      continue;
    const text = textFromMessage(entry.message).trim();
    if (text) return text;
  }
  return "";
}

export function userRequestedCommentEdit(ctx: ExtensionContext): boolean {
  const latest = latestUserMessage(ctx);
  if (!latest) return false;
  if (textRequestsCommentEdit(latest.text)) return true;

  // Allow a concise "yes / go ahead" if the previous assistant turn explicitly
  // offered to add explanatory comments. This keeps the exception user-driven.
  if (!AFFIRMATIVE_RE.test(latest.text)) return false;
  const previousAssistant = previousAssistantText(ctx, latest.index);
  return textRequestsCommentEdit(previousAssistant);
}

function commentSyntaxForPath(filePath: string): CommentSyntax | undefined {
  const extension = extname(filePath).toLowerCase();
  const fileName = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";

  if (TEMPLATE_COMMENT_EXTENSIONS.has(extension)) {
    return {
      line: ["//"],
      block: [
        { start: "<!--", end: "-->" },
        { start: "{/*", end: "*/}" },
        { start: "/*", end: "*/" },
      ],
      backtickStrings: true,
    };
  }

  if (C_LIKE_COMMENT_EXTENSIONS.has(extension)) {
    return {
      line: ["//"],
      block: [
        ...(extension === ".tsx" || extension === ".jsx"
          ? [{ start: "{/*", end: "*/}" }]
          : []),
        { start: "/*", end: "*/" },
      ],
      backtickStrings: true,
    };
  }

  if (CSS_COMMENT_EXTENSIONS.has(extension)) {
    return { line: [], block: [{ start: "/*", end: "*/" }] };
  }

  if (HTML_COMMENT_EXTENSIONS.has(extension)) {
    return { line: [], block: [{ start: "<!--", end: "-->" }] };
  }

  if (
    HASH_COMMENT_EXTENSIONS.has(extension) ||
    [
      "dockerfile",
      "makefile",
      "rakefile",
      "gemfile",
      ".dockerignore",
      ".env",
      ".gitignore",
    ].includes(fileName)
  ) {
    return {
      line: ["#"],
      block: extension === ".ps1" ? [{ start: "<#", end: "#>" }] : [],
    };
  }

  if (SQL_COMMENT_EXTENSIONS.has(extension)) {
    return {
      line: ["--"],
      block: [{ start: "/*", end: "*/" }],
    };
  }

  if (LUA_COMMENT_EXTENSIONS.has(extension)) {
    return {
      line: ["--"],
      block: [{ start: "--[[", end: "]]" }],
    };
  }

  if (HASKELL_COMMENT_EXTENSIONS.has(extension)) {
    return {
      line: ["--"],
      block: [{ start: "{-", end: "-}" }],
    };
  }

  return undefined;
}

function matchingLineComment(
  text: string,
  index: number,
  syntax: CommentSyntax,
): string | undefined {
  for (const marker of [...syntax.line].sort((a, b) => b.length - a.length)) {
    if (!text.startsWith(marker, index)) continue;
    if (marker === "#" && index === 0 && text[index + 1] === "!") continue;
    return marker;
  }
  return undefined;
}

function matchingBlockComment(
  text: string,
  index: number,
  syntax: CommentSyntax,
): { start: string; end: string } | undefined {
  return [...syntax.block]
    .sort((a, b) => b.start.length - a.start.length)
    .find((marker) => text.startsWith(marker.start, index));
}

function copyQuotedString(
  text: string,
  index: number,
): { value: string; nextIndex: number } {
  const quote = text[index];
  if (
    (quote === "'" || quote === '"') &&
    text.startsWith(quote.repeat(3), index)
  ) {
    const end = text.indexOf(quote.repeat(3), index + 3);
    const nextIndex = end === -1 ? text.length : end + 3;
    return { value: text.slice(index, nextIndex), nextIndex };
  }

  let nextIndex = index + 1;
  let value = quote;
  while (nextIndex < text.length) {
    const char = text[nextIndex];
    value += char;
    nextIndex++;

    if (char === "\\" && nextIndex < text.length) {
      value += text[nextIndex];
      nextIndex++;
      continue;
    }

    if (char === quote) break;
    if (quote !== "`" && (char === "\n" || char === "\r")) break;
  }
  return { value, nextIndex };
}

function stripComments(text: string, syntax: CommentSyntax): string {
  let result = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (
      char === "'" ||
      char === '"' ||
      (char === "`" && syntax.backtickStrings !== false)
    ) {
      const quoted = copyQuotedString(text, index);
      result += quoted.value;
      index = quoted.nextIndex;
      continue;
    }

    const block = matchingBlockComment(text, index, syntax);
    if (block) {
      result += " ";
      index += block.start.length;
      while (index < text.length && !text.startsWith(block.end, index)) {
        const current = text[index];
        if (current === "\r") {
          result += "\r";
          if (text[index + 1] === "\n") {
            result += "\n";
            index += 2;
          } else {
            index++;
          }
          continue;
        }
        if (current === "\n") result += "\n";
        index++;
      }
      if (text.startsWith(block.end, index)) index += block.end.length;
      result += " ";
      continue;
    }

    const line = matchingLineComment(text, index, syntax);
    if (line) {
      result += " ";
      index += line.length;
      while (
        index < text.length &&
        text[index] !== "\n" &&
        text[index] !== "\r"
      ) {
        index++;
      }
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

function normalizedExecutableText(
  text: string,
  syntax: CommentSyntax,
): string {
  return stripComments(text, syntax)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const indent = line.match(/^[ \t]*/)?.[0] ?? "";
      const body = line.slice(indent.length).replace(/[ \t]+/g, " ");
      return `${indent}${body}`;
    })
    .join("\n")
    .trim();
}

function isCommentOnlyTextChange(
  filePath: string,
  oldText: string,
  newText: string,
): boolean {
  if (oldText === newText) return true;
  const syntax = commentSyntaxForPath(filePath);
  if (!syntax) return false;
  return (
    normalizedExecutableText(oldText, syntax) ===
    normalizedExecutableText(newText, syntax)
  );
}

export function isCommentOnlyEdit(input: {
  path: string;
  edits: Array<{ oldText: string; newText: string }>;
}): boolean {
  return (
    input.edits.length > 0 &&
    input.edits.every((edit) =>
      isCommentOnlyTextChange(input.path, edit.oldText, edit.newText),
    )
  );
}

export function isCommentOnlyWrite(
  cwd: string,
  input: { path: string; content: string },
): boolean {
  try {
    const current = readFileSync(resolve(cwd, input.path), "utf8");
    return isCommentOnlyTextChange(input.path, current, input.content);
  } catch {
    return false;
  }
}
