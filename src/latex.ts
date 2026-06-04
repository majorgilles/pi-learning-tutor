const MASK_OPEN = "\uE000";
const MASK_CLOSE = "\uE001";
const LITERAL_LBRACE = "\uE100";
const LITERAL_RBRACE = "\uE101";
const LITERAL_UNDERSCORE = "\uE102";
const LITERAL_CARET = "\uE103";
const LITERAL_DOLLAR = "\uE104";
const LITERAL_PERCENT = "\uE105";
const LITERAL_AMPERSAND = "\uE106";
const LITERAL_HASH = "\uE107";
const LITERAL_PIPE = "\uE108";

const COMMAND_REPLACEMENTS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  sum: "Σ",
  prod: "∏",
  int: "∫",
  iint: "∬",
  oint: "∮",
  infty: "∞",
  infinity: "∞",
  partial: "∂",
  nabla: "∇",
  pm: "±",
  mp: "∓",
  times: "×",
  cdot: "·",
  div: "÷",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  cong: "≅",
  propto: "∝",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  setminus: "∖",
  emptyset: "∅",
  forall: "∀",
  exists: "∃",
  neg: "¬",
  land: "∧",
  wedge: "∧",
  lor: "∨",
  vee: "∨",
  opplus: "⊕",
  oplus: "⊕",
  otimes: "⊗",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  mapsto: "↦",
  implies: "⇒",
  iff: "⇔",
  dots: "…",
  ldots: "…",
  cdots: "⋯",
  ell: "ℓ",
  hbar: "ℏ",
  lbrace: LITERAL_LBRACE,
  rbrace: LITERAL_RBRACE,
  lvert: "|",
  rvert: "|",
  vert: "|",
  lVert: "‖",
  rVert: "‖",
  Vert: "‖",
  log: "log",
  ln: "ln",
  exp: "exp",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  sinh: "sinh",
  cosh: "cosh",
  tanh: "tanh",
  max: "max",
  min: "min",
  sup: "sup",
  inf: "inf",
  lim: "lim",
  gcd: "gcd",
  det: "det",
  dim: "dim",
  arg: "arg",
  mod: "mod",
};

const SCRIPT_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SCRIPT_UPPER_RENDERED = [
  "𝓐",
  "𝓑",
  "𝓒",
  "𝓓",
  "𝓔",
  "𝓕",
  "𝓖",
  "𝓗",
  "𝓘",
  "𝓙",
  "𝓚",
  "𝓛",
  "𝓜",
  "𝓝",
  "𝓞",
  "𝓟",
  "𝓠",
  "𝓡",
  "𝓢",
  "𝓣",
  "𝓤",
  "𝓥",
  "𝓦",
  "𝓧",
  "𝓨",
  "𝓩",
];
const SCRIPT_LOWER = "abcdefghijklmnopqrstuvwxyz";
const SCRIPT_LOWER_RENDERED = [
  "𝓪",
  "𝓫",
  "𝓬",
  "𝓭",
  "𝓮",
  "𝓯",
  "𝓰",
  "𝓱",
  "𝓲",
  "𝓳",
  "𝓴",
  "𝓵",
  "𝓶",
  "𝓷",
  "𝓸",
  "𝓹",
  "𝓺",
  "𝓻",
  "𝓼",
  "𝓽",
  "𝓾",
  "𝓿",
  "𝔀",
  "𝔁",
  "𝔂",
  "𝔃",
];

const BLACKBOARD: Record<string, string> = {
  A: "𝔸",
  B: "𝔹",
  C: "ℂ",
  D: "𝔻",
  E: "𝔼",
  F: "𝔽",
  G: "𝔾",
  H: "ℍ",
  I: "𝕀",
  J: "𝕁",
  K: "𝕂",
  L: "𝕃",
  M: "𝕄",
  N: "ℕ",
  O: "𝕆",
  P: "ℙ",
  Q: "ℚ",
  R: "ℝ",
  S: "𝕊",
  T: "𝕋",
  U: "𝕌",
  V: "𝕍",
  W: "𝕎",
  X: "𝕏",
  Y: "𝕐",
  Z: "ℤ",
};

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
  A: "ᴬ",
  B: "ᴮ",
  D: "ᴰ",
  E: "ᴱ",
  G: "ᴳ",
  H: "ᴴ",
  I: "ᴵ",
  J: "ᴶ",
  K: "ᴷ",
  L: "ᴸ",
  M: "ᴹ",
  N: "ᴺ",
  O: "ᴼ",
  P: "ᴾ",
  R: "ᴿ",
  T: "ᵀ",
  U: "ᵁ",
  V: "ⱽ",
  W: "ᵂ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
  schwa: "ₔ",
};

type Group = {
  content: string;
  end: number;
  raw: string;
};

function protectMarkdownRegion(regions: string[], raw: string): string {
  const index = regions.push(raw) - 1;
  return `${MASK_OPEN}${index}${MASK_CLOSE}`;
}

function restoreMarkdownRegions(text: string, regions: string[]): string {
  return text.replace(
    new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, "g"),
    (match, indexText: string) => regions[Number(indexText)] ?? match,
  );
}

function maskProtectedMarkdown(markdown: string, regions: string[]): string {
  let result = markdown.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[\s\S]*?(?:\n\2\3[ \t]*(?=\n|$)|$)/g, (match) =>
    protectMarkdownRegion(regions, match),
  );

  result = result.replace(/`[^`\n]*`/g, (match) =>
    protectMarkdownRegion(regions, match),
  );

  return result;
}

function isLikelyMath(raw: string, display: boolean): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?$/.test(text)) return false;
  if (/\\[A-Za-z]+/.test(text)) return true;
  if (/[\_^=<>]|[+*/]|\b(?:sum|lim|log|sin|cos|tan)\b/i.test(text)) {
    return true;
  }
  if (/^[A-Za-z]$/.test(text)) return true;
  return display && /[A-Za-z].*[(),]/.test(text);
}

function normalizeMathWhitespace(input: string): string {
  const withLineBreaks = input.replace(/\\\\/g, "\n");
  return withLineBreaks
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function readGroup(input: string, start: number): Group | undefined {
  if (input[start] !== "{") return undefined;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const char = input[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: input.slice(start + 1, i),
          end: i + 1,
          raw: input.slice(start, i + 1),
        };
      }
    }
  }
  return undefined;
}

function readBracketGroup(input: string, start: number): Group | undefined {
  if (input[start] !== "[") return undefined;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const char = input[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: input.slice(start + 1, i),
          end: i + 1,
          raw: input.slice(start, i + 1),
        };
      }
    }
  }
  return undefined;
}

function skipSpaces(input: string, start: number): number {
  let index = start;
  while (input[index] === " ") index += 1;
  return index;
}

function matchesCommandAt(
  input: string,
  index: number,
  commands: string[],
): string | undefined {
  if (input[index] !== "\\") return undefined;
  for (const command of commands) {
    if (!input.startsWith(`\\${command}`, index)) continue;
    const next = input[index + command.length + 1] ?? "";
    if (/[A-Za-z]/.test(next)) continue;
    return command;
  }
  return undefined;
}

function replaceTwoGroupCommands(
  input: string,
  commands: string[],
  replacer: (command: string, first: string, second: string) => string,
): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const command = matchesCommandAt(input, i, commands);
    if (!command) {
      output += input[i];
      continue;
    }

    const firstStart = skipSpaces(input, i + command.length + 1);
    const first = readGroup(input, firstStart);
    if (!first) {
      output += input[i];
      continue;
    }

    const secondStart = skipSpaces(input, first.end);
    const second = readGroup(input, secondStart);
    if (!second) {
      output += input.slice(i, first.end);
      i = first.end - 1;
      continue;
    }

    output += replacer(command, first.content, second.content);
    i = second.end - 1;
  }
  return output;
}

function replaceOneGroupCommands(
  input: string,
  commands: string[],
  replacer: (command: string, content: string) => string,
): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const command = matchesCommandAt(input, i, commands);
    if (!command) {
      output += input[i];
      continue;
    }

    const groupStart = skipSpaces(input, i + command.length + 1);
    const group = readGroup(input, groupStart);
    if (!group) {
      output += input[i];
      continue;
    }

    output += replacer(command, group.content);
    i = group.end - 1;
  }
  return output;
}

function replaceSqrt(input: string, depth: number): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const command = matchesCommandAt(input, i, ["sqrt"]);
    if (!command) {
      output += input[i];
      continue;
    }

    let next = skipSpaces(input, i + command.length + 1);
    const degree = readBracketGroup(input, next);
    if (degree) next = skipSpaces(input, degree.end);
    const radicand = readGroup(input, next);
    if (!radicand) {
      output += input[i];
      continue;
    }

    const convertedRadicand = convertLatexExpression(radicand.content, depth + 1);
    const convertedDegree = degree
      ? convertLatexExpression(degree.content, depth + 1)
      : "";
    output += `${convertedDegree ? `${convertedDegree}` : ""}√(${convertedRadicand})`;
    i = radicand.end - 1;
  }
  return output;
}

function mapCharacters(
  value: string,
  source: string,
  rendered: string[],
): string {
  return Array.from(value)
    .map((char) => {
      const index = source.indexOf(char);
      return index >= 0 ? (rendered[index] ?? char) : char;
    })
    .join("");
}

function mapMathCal(value: string): string {
  const renderedUpper = mapCharacters(value, SCRIPT_UPPER, SCRIPT_UPPER_RENDERED);
  return mapCharacters(renderedUpper, SCRIPT_LOWER, SCRIPT_LOWER_RENDERED);
}

function mapMathBb(value: string): string {
  return Array.from(value)
    .map((char) => BLACKBOARD[char] ?? char)
    .join("");
}

function accent(value: string, combiningMark: string, singleMap: Record<string, string>): string {
  const compact = value.trim();
  if (compact.length === 1 && singleMap[compact]) return singleMap[compact];
  return `${compact}${combiningMark}`;
}

function formatFraction(numerator: string, denominator: string): string {
  const top = numerator.trim();
  const bottom = denominator.trim();
  const safeTop = isSimpleFractionPart(top) ? top : `(${top})`;
  const safeBottom = isSimpleFractionPart(bottom) ? bottom : `(${bottom})`;
  return `${safeTop}/${safeBottom}`;
}

function isSimpleFractionPart(value: string): boolean {
  return /^[\p{L}\p{N}𝓐-𝔃ℂℍℕℙℚℝℤ∞πθφα-ωΑ-Ω₀-₉⁰-⁹ᵃ-ᶻᴬ-ⱽ₊₋₌⁺⁻⁼⁽⁾₍₎]+$/u.test(
    value,
  );
}

function protectEscapedSpecials(input: string): string {
  return input
    .replace(/\\\{/g, LITERAL_LBRACE)
    .replace(/\\\}/g, LITERAL_RBRACE)
    .replace(/\\_/g, LITERAL_UNDERSCORE)
    .replace(/\\\^/g, LITERAL_CARET)
    .replace(/\\\$/g, LITERAL_DOLLAR)
    .replace(/\\%/g, LITERAL_PERCENT)
    .replace(/\\&/g, LITERAL_AMPERSAND)
    .replace(/\\#/g, LITERAL_HASH)
    .replace(/\\\|/g, LITERAL_PIPE);
}

function restoreEscapedSpecials(input: string): string {
  return input
    .replaceAll(LITERAL_LBRACE, "{")
    .replaceAll(LITERAL_RBRACE, "}")
    .replaceAll(LITERAL_UNDERSCORE, "_")
    .replaceAll(LITERAL_CARET, "^")
    .replaceAll(LITERAL_DOLLAR, "$")
    .replaceAll(LITERAL_PERCENT, "%")
    .replaceAll(LITERAL_AMPERSAND, "&")
    .replaceAll(LITERAL_HASH, "#")
    .replaceAll(LITERAL_PIPE, "|");
}

function replaceNamedCommands(input: string): string {
  return input.replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (match, command: string) =>
    COMMAND_REPLACEMENTS[command] ?? match,
  );
}

function readScriptOperand(input: string, start: number): Group | undefined {
  const operandStart = skipSpaces(input, start);
  const braced = readGroup(input, operandStart);
  if (braced) return braced;

  const command = /^\\[A-Za-z]+/.exec(input.slice(operandStart));
  if (command) {
    return {
      content: command[0],
      raw: command[0],
      end: operandStart + command[0].length,
    };
  }

  const char = Array.from(input.slice(operandStart))[0];
  if (!char) return undefined;
  return {
    content: char,
    raw: char,
    end: operandStart + char.length,
  };
}

function toScript(value: string, map: Record<string, string>): string | undefined {
  const compact = value.replace(/\s+/g, "");
  if (!compact) return undefined;

  let result = "";
  for (const char of Array.from(compact)) {
    const converted = map[char];
    if (!converted) return undefined;
    result += converted;
  }
  return result;
}

function convertScripts(input: string): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const marker = input[i];
    if (marker !== "^" && marker !== "_") {
      output += marker;
      continue;
    }

    const operand = readScriptOperand(input, i + 1);
    if (!operand) {
      output += marker;
      continue;
    }

    const convertedOperand = replaceNamedCommands(operand.content).replace(/[{}]/g, "");
    const script = toScript(convertedOperand, marker === "^" ? SUPERSCRIPT : SUBSCRIPT);
    if (!script) {
      output += `${marker}${operand.raw}`;
      i = operand.end - 1;
      continue;
    }

    output += script;
    i = operand.end - 1;
  }
  return output;
}

function cleanupMathText(input: string): string {
  return restoreEscapedSpecials(
    input
      .replace(/[{}]/g, "")
      .replace(/([\p{L}\p{N})⁾₎])([Σ∏∫∬∮])/gu, "$1 $2"),
  )
    .replace(/\s+([,;:)\]])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s*([=<>≤≥≈≠≡+±×÷])\s*/g, " $1 ")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function convertLatexExpression(input: string, depth = 0): string {
  if (depth > 8) return input;
  let text = normalizeMathWhitespace(input);
  if (!text) return text;

  text = protectEscapedSpecials(text);
  text = text
    .replace(/\\(?:left|right)\s*/g, "")
    .replace(/\\(?:,|:|;|!)/g, " ")
    .replace(/\\(?:quad|qquad)(?![A-Za-z])/g, " ")
    .replace(/&/g, "");

  text = replaceTwoGroupCommands(text, ["dfrac", "tfrac", "frac"], (_command, first, second) =>
    formatFraction(
      convertLatexExpression(first, depth + 1),
      convertLatexExpression(second, depth + 1),
    ),
  );

  text = replaceSqrt(text, depth);

  text = replaceOneGroupCommands(
    text,
    ["operatorname", "mathrm", "text", "textnormal"],
    (_command, content) => convertLatexExpression(content, depth + 1),
  );
  text = replaceOneGroupCommands(text, ["mathbf", "boldsymbol"], (_command, content) =>
    convertLatexExpression(content, depth + 1),
  );
  text = replaceOneGroupCommands(text, ["mathit", "emph"], (_command, content) =>
    convertLatexExpression(content, depth + 1),
  );
  text = replaceOneGroupCommands(text, ["mathbb"], (_command, content) =>
    mapMathBb(convertLatexExpression(content, depth + 1)),
  );
  text = replaceOneGroupCommands(text, ["mathcal"], (_command, content) =>
    mapMathCal(convertLatexExpression(content, depth + 1)),
  );
  text = replaceOneGroupCommands(text, ["hat", "widehat"], (_command, content) =>
    accent(convertLatexExpression(content, depth + 1), "\u0302", { y: "ŷ", x: "x̂" }),
  );
  text = replaceOneGroupCommands(text, ["bar", "overline"], (_command, content) =>
    accent(convertLatexExpression(content, depth + 1), "\u0304", {}),
  );
  text = replaceOneGroupCommands(text, ["tilde", "widetilde"], (_command, content) =>
    accent(convertLatexExpression(content, depth + 1), "\u0303", {}),
  );
  text = replaceOneGroupCommands(text, ["vec"], (_command, content) =>
    accent(convertLatexExpression(content, depth + 1), "\u20D7", {}),
  );

  text = replaceNamedCommands(text);
  text = convertScripts(text);

  return cleanupMathText(text);
}

function renderMath(raw: string): string {
  const rendered = convertLatexExpression(raw);
  return rendered || raw;
}

function markdownCodeSpan(text: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longestBacktickRun + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function mathPill(rendered: string): string {
  return markdownCodeSpan(`⟪ ${rendered} ⟫`);
}

function renderInlineMath(raw: string): string {
  return mathPill(renderMath(raw));
}

function renderDisplayMath(raw: string): string {
  const lines = renderMath(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  if (lines.length === 1) {
    return `\n> **Formula** ${mathPill(lines[0])}\n`;
  }

  return `\n> **Formula**\n${lines.map((line) => `> ${mathPill(line)}`).join("\n")}\n`;
}

function convertDelimitedMath(markdown: string): string {
  let result = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match, body: string) =>
    isLikelyMath(body, true) ? renderDisplayMath(body) : match,
  );

  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, body: string) =>
    isLikelyMath(body, true) ? renderDisplayMath(body) : match,
  );

  result = result.replace(/\\\(([^]*?)\\\)/g, (match, body: string) =>
    isLikelyMath(body, false) ? renderInlineMath(body) : match,
  );

  result = result.replace(
    /(^|[^\\$])\$(?!\$)([^$\n]{1,500})(?<!\\)\$/g,
    (match, prefix: string, body: string) => {
      if (!isLikelyMath(body, false)) return match;
      return `${prefix}${renderInlineMath(body)}`;
    },
  );

  return result;
}

export function renderTerminalLatex(markdown: string): string {
  if (!/[\\$_^]/.test(markdown)) return markdown;

  const protectedRegions: string[] = [];
  const masked = maskProtectedMarkdown(markdown, protectedRegions);
  const converted = convertDelimitedMath(masked);
  return restoreMarkdownRegions(converted, protectedRegions);
}

