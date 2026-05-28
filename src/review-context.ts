import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  withFileMutationQueue,
  type ExecResult,
  type ExtensionAPI,
  type ExtensionContext,
  type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { LearningState } from "./types.js";

const COMMAND_TIMEOUT_MS = 10_000;
const MAX_SNIPPET_FILES = 8;
const MAX_TEXT_FILE_BYTES = 160_000;
const TEXT_SNIPPET_LINES = 160;
const NOTEBOOK_SNIPPET_CELLS = 8;
const NOTEBOOK_CELL_LINES = 40;

const REVIEW_CONTEXT_PARAMS = Type.Object({
  focus: Type.Optional(
    Type.String({
      description:
        "Optional learner attempt, file, notebook, or concept to emphasize while gathering review context.",
    }),
  ),
});

type CommandSummary = {
  code: number;
  killed: boolean;
  stderr?: string;
};

type StatusPath = {
  status: string;
  path: string;
};

type ReviewContextDetails = {
  active: boolean;
  focus?: string;
  cwd: string;
  gitRoot?: string;
  changedFiles: string[];
  sampledFiles: string[];
  commands: Record<string, CommandSummary>;
  truncation?: TruncationResult;
  fullOutputPath?: string;
};

function cleanFocus(focus: string | undefined): string | undefined {
  const cleaned = focus?.trim().replace(/\s+/g, " ").slice(0, 300);
  return cleaned || undefined;
}

function summarizeCommand(result: ExecResult): CommandSummary {
  const stderr = result.stderr.trim();
  return {
    code: result.code,
    killed: result.killed,
    ...(stderr ? { stderr: stderr.slice(0, 600) } : {}),
  };
}

async function runGit(
  pi: ExtensionAPI,
  args: string[],
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  cwd = ctx.cwd,
): Promise<ExecResult> {
  try {
    return await pi.exec("git", args, {
      cwd,
      signal,
      timeout: COMMAND_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      code: -1,
      killed: false,
    };
  }
}

function fenced(text: string, info = "text"): string {
  return `\`\`\`\`${info}\n${text}\n\`\`\`\``;
}

function commandSection(
  title: string,
  result: ExecResult | undefined,
  emptyText: string,
): string {
  if (!result) return `## ${title}\n\n${emptyText}`;

  const stdout = result.stdout.trimEnd();
  const stderr = result.stderr.trimEnd();
  const body = stdout || stderr || emptyText;
  const suffix =
    result.code === 0
      ? ""
      : `\n\nExit code: ${result.code}${result.killed ? " (killed)" : ""}`;
  const stderrNote = stdout && stderr ? `\n\nstderr:\n${fenced(stderr)}` : "";
  return `## ${title}\n\n${fenced(body || emptyText)}${suffix}${stderrNote}`;
}

function parseStatusPaths(status: string): StatusPath[] {
  return status
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2).trim() || line.slice(0, 2);
      let filePath = line.length > 3 ? line.slice(3).trim() : line.trim();
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").pop() ?? filePath;
      }
      filePath = filePath.replace(/^"|"$/g, "");
      return { status: statusCode, path: filePath };
    })
    .filter((item) => item.path.length > 0);
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isInside(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n… (${lines.length - maxLines} more lines omitted)`;
}

function normalizeCellSource(source: unknown): string {
  if (Array.isArray(source)) return source.map(String).join("");
  if (typeof source === "string") return source;
  return "";
}

function normalizeOutputText(output: any): string {
  if (!output || typeof output !== "object") return "";
  if (Array.isArray(output.text)) return output.text.map(String).join("");
  if (typeof output.text === "string") return output.text;
  const plain = output.data?.["text/plain"];
  if (Array.isArray(plain)) return plain.map(String).join("");
  if (typeof plain === "string") return plain;
  if (output.ename || output.evalue) {
    return [output.ename, output.evalue].filter(Boolean).join(": ");
  }
  return "";
}

function notebookSummary(text: string): string {
  try {
    const notebook = JSON.parse(text) as { cells?: any[] };
    const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
    if (cells.length === 0) return "Notebook has no cells or an unsupported shape.";

    const sections = [`Notebook cells: ${cells.length}`];
    for (const [index, cell] of cells.slice(0, NOTEBOOK_SNIPPET_CELLS).entries()) {
      const cellType = typeof cell?.cell_type === "string" ? cell.cell_type : "unknown";
      const source = truncateLines(
        normalizeCellSource(cell?.source).trim() || "(empty source)",
        NOTEBOOK_CELL_LINES,
      );
      sections.push(`--- cell ${index + 1} (${cellType}) ---\n${source}`);

      if (cellType === "code" && Array.isArray(cell?.outputs)) {
        const outputText = cell.outputs
          .map(normalizeOutputText)
          .filter(Boolean)
          .join("\n")
          .trim();
        if (outputText) {
          sections.push(
            `outputs:\n${truncateLines(outputText, Math.floor(NOTEBOOK_CELL_LINES / 2))}`,
          );
        }
      }
    }

    if (cells.length > NOTEBOOK_SNIPPET_CELLS) {
      sections.push(`… (${cells.length - NOTEBOOK_SNIPPET_CELLS} more cells omitted)`);
    }
    return sections.join("\n\n");
  } catch (error) {
    return `Could not parse notebook JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 8_000)).includes(0);
}

async function snippetForFile(baseDir: string, filePath: string): Promise<string> {
  const absolutePath = resolve(baseDir, filePath);
  if (!isInside(baseDir, absolutePath)) {
    return `### ${filePath}\n\nSkipped: path resolves outside the git root.`;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) return `### ${filePath}\n\nSkipped: not a regular file.`;
    if (fileStat.size > MAX_TEXT_FILE_BYTES) {
      return `### ${filePath}\n\nSkipped: file is ${formatSize(fileStat.size)}, above the ${formatSize(MAX_TEXT_FILE_BYTES)} snippet limit.`;
    }

    const buffer = await readFile(absolutePath);
    if (looksBinary(buffer)) return `### ${filePath}\n\nSkipped: binary-looking file.`;

    const text = buffer.toString("utf8");
    const body = filePath.toLowerCase().endsWith(".ipynb")
      ? notebookSummary(text)
      : truncateLines(text, TEXT_SNIPPET_LINES);
    return `### ${filePath}\n\n${fenced(body)}`;
  } catch (error) {
    return `### ${filePath}\n\nSkipped: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function writeFullOutput(output: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-learning-review-"));
  const tempFile = join(tempDir, "context.md");
  await withFileMutationQueue(tempFile, async () => {
    await writeFile(tempFile, output, "utf8");
  });
  return tempFile;
}

export function registerLearningReviewContextTool(
  pi: ExtensionAPI,
  getState: () => LearningState,
): void {
  pi.registerTool({
    name: "learning_review_context",
    label: "Learning Review Context",
    description: `Gather deterministic bounded read-only evidence for a learning review: git status, staged/unstaged diff summaries, diffs, and changed text/notebook snippets. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; if truncated, the full context is saved to a temp file.`,
    promptSnippet:
      "Gather git status/diff and changed-file snippets before a learning review.",
    promptGuidelines: [
      "Use learning_review_context before reviewing a learner readiness signal, step attempt, or /review request in learning mode; use its evidence order before adding narrow follow-up reads.",
    ],
    parameters: REVIEW_CONTEXT_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const focus = cleanFocus(params.focus);
      const state = getState();
      const commands: Record<string, CommandSummary> = {};

      const rootResult = await runGit(
        pi,
        ["rev-parse", "--show-toplevel"],
        ctx,
        signal,
      );
      commands.revParse = summarizeCommand(rootResult);
      const gitRoot = rootResult.code === 0 ? rootResult.stdout.trim() : undefined;
      const gitCwd = gitRoot || ctx.cwd;

      let status: ExecResult | undefined;
      let diffStat: ExecResult | undefined;
      let cachedDiffStat: ExecResult | undefined;
      let diffNameOnly: ExecResult | undefined;
      let cachedNameOnly: ExecResult | undefined;
      let diff: ExecResult | undefined;
      let cachedDiff: ExecResult | undefined;

      if (gitRoot) {
        status = await runGit(
          pi,
          ["status", "--short", "--untracked-files=all"],
          ctx,
          signal,
          gitCwd,
        );
        commands.status = summarizeCommand(status);
        diffStat = await runGit(
          pi,
          ["diff", "--stat", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.diffStat = summarizeCommand(diffStat);
        cachedDiffStat = await runGit(
          pi,
          ["diff", "--cached", "--stat", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.cachedDiffStat = summarizeCommand(cachedDiffStat);
        diffNameOnly = await runGit(
          pi,
          ["diff", "--name-only", "--diff-filter=ACMRTUXB", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.diffNameOnly = summarizeCommand(diffNameOnly);
        cachedNameOnly = await runGit(
          pi,
          ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.cachedNameOnly = summarizeCommand(cachedNameOnly);
        cachedDiff = await runGit(
          pi,
          ["diff", "--cached", "--no-ext-diff", "--unified=3", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.cachedDiff = summarizeCommand(cachedDiff);
        diff = await runGit(
          pi,
          ["diff", "--no-ext-diff", "--unified=3", "--"],
          ctx,
          signal,
          gitCwd,
        );
        commands.diff = summarizeCommand(diff);
      }

      const statusPaths = parseStatusPaths(status?.stdout ?? "");
      const changedFiles = uniqueInOrder([
        ...(cachedNameOnly?.stdout.split(/\r?\n/).filter(Boolean) ?? []),
        ...(diffNameOnly?.stdout.split(/\r?\n/).filter(Boolean) ?? []),
        ...statusPaths.map((item) => item.path),
      ]);
      const sampledFiles = changedFiles.slice(0, MAX_SNIPPET_FILES);
      const snippets = await Promise.all(
        sampledFiles.map((filePath) => snippetForFile(gitCwd, filePath)),
      );

      const rawOutput = [
        "# Learning review context",
        `Active learning mode: ${state.active ? "yes" : "no"}`,
        focus ? `Focus: ${focus}` : undefined,
        `CWD: ${ctx.cwd}`,
        gitRoot ? `Git root: ${gitRoot}` : "Git root: unavailable (not a git checkout or git failed)",
        "## Deterministic review sequence",
        [
          "1. Start from `git status --short --untracked-files=all`.",
          "2. Compare staged and unstaged diff stats.",
          "3. Read the staged and unstaged diffs before judging code.",
          "4. Inspect snippets from changed/untracked text or notebook files.",
          "5. If this evidence is insufficient, do one narrow follow-up read/search and say why.",
        ].join("\n"),
        commandSection(
          "git status --short --untracked-files=all",
          status,
          gitRoot ? "(clean worktree)" : "Git status unavailable.",
        ),
        commandSection(
          "git diff --cached --stat",
          cachedDiffStat,
          gitRoot ? "(no staged diff)" : "Staged diff unavailable.",
        ),
        commandSection(
          "git diff --stat",
          diffStat,
          gitRoot ? "(no unstaged diff)" : "Unstaged diff unavailable.",
        ),
        commandSection(
          "git diff --cached --no-ext-diff --unified=3",
          cachedDiff,
          gitRoot ? "(no staged diff)" : "Staged diff unavailable.",
        ),
        commandSection(
          "git diff --no-ext-diff --unified=3",
          diff,
          gitRoot ? "(no unstaged diff)" : "Unstaged diff unavailable.",
        ),
        "## Changed/untracked file snippets",
        snippets.length > 0
          ? snippets.join("\n\n")
          : "No changed or untracked text/notebook files were found from git status/diff.",
        changedFiles.length > sampledFiles.length
          ? `\nOmitted ${changedFiles.length - sampledFiles.length} additional changed file(s) from snippets: ${changedFiles
              .slice(MAX_SNIPPET_FILES)
              .join(", ")}`
          : undefined,
      ]
        .filter((section): section is string => typeof section === "string")
        .join("\n\n");

      const truncation = truncateHead(rawOutput, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
      let text = truncation.content;
      const details: ReviewContextDetails = {
        active: state.active,
        focus,
        cwd: ctx.cwd,
        gitRoot,
        changedFiles,
        sampledFiles,
        commands,
      };

      if (truncation.truncated) {
        const fullOutputPath = await writeFullOutput(rawOutput);
        details.truncation = truncation;
        details.fullOutputPath = fullOutputPath;
        text += `\n\n[Learning review context truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full context saved to: ${fullOutputPath}]`;
      }

      return {
        content: [{ type: "text", text }],
        details,
      };
    },
  });
}
