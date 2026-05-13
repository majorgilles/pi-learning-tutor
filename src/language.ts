import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { LanguageHint } from "./types.js";

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

export function detectCurrentLanguage(cwd: string): LanguageHint {
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
