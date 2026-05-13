import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function textFromMessage(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function recentConversationSnippet(
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
