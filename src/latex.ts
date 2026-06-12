const LATEX_COMMANDS: Array<[RegExp, string]> = [
  [/\\theta\b/g, "θ"],
  [/\\Theta\b/g, "Θ"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"],
  [/\\epsilon\b/g, "ε"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\pi\b/g, "π"],
  [/\\sigma\b/g, "σ"],
  [/\\phi\b/g, "φ"],
  [/\\omega\b/g, "ω"],
  [/\\int\b/g, "∫"],
  [/\\sum\b/g, "Σ"],
  [/\\prod\b/g, "Π"],
  [/\\infty\b/g, "∞"],
  [/\\mid\b/g, "|"],
  [/\\times\b/g, "×"],
  [/\\cdot\b/g, "·"],
  [/\\leq?\b/g, "≤"],
  [/\\geq?\b/g, "≥"],
  [/\\neq\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\rightarrow\b/g, "→"],
  [/\\to\b/g, "→"],
  [/\\left\b/g, ""],
  [/\\right\b/g, ""],
];

function replaceFractions(text: string): string {
  return text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
}

function latexToTerminalText(source: string): string {
  let text = source.trim().replace(/\s*\n\s*/g, " ");
  text = replaceFractions(text);

  for (const [pattern, replacement] of LATEX_COMMANDS) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\[ \t]+/g, " ")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/_\{([α-ωΑ-Ω])\}/g, "$1")
    .replace(/_([α-ωΑ-Ω])/g, "$1")
    .replace(/\{([^{}]+)\}/g, "$1")
    .replace(/,\s*d([A-Za-z])/g, " d$1")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeInlineCode(text: string): string {
  return text.replace(/`/g, "ˋ");
}

function formatDisplayFormula(formula: string): string {
  const text = escapeInlineCode(latexToTerminalText(formula));
  if (!text) return "";
  return `\n> **Formula**\n> \`${text}\`\n`;
}

function formatInlineFormula(formula: string): string {
  const text = escapeInlineCode(latexToTerminalText(formula));
  return text ? `\`${text}\`` : "";
}

function sanitizeMathInMarkdownText(text: string): string {
  return text
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, formula: string) =>
      formatDisplayFormula(formula),
    )
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, formula: string) =>
      formatDisplayFormula(formula),
    )
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, formula: string) =>
      formatInlineFormula(formula),
    );
}

export function sanitizeLatexForTerminalMarkdown(text: string): string {
  const segments = text.split(/(^\s*(?:```|~~~~).*?$)/gm);
  let inFence = false;

  const sanitized = segments
    .map((segment) => {
      if (/^\s*(?:```|~~~~)/.test(segment)) {
        inFence = !inFence;
        return segment;
      }
      return inFence ? segment : sanitizeMathInMarkdownText(segment);
    })
    .join("");

  return sanitized.replace(/\n{3,}/g, "\n\n");
}
