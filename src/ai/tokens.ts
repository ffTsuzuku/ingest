import type { TokenUsage } from "./types.js";

export function formatTokenCount(tokens?: number | null): string {
  if (tokens === undefined || tokens === null || isNaN(tokens) || tokens <= 0) {
    return "N/A";
  }
  if (tokens >= 1_000_000) {
    return (tokens / 1_000_000).toFixed(1) + "M";
  }
  if (tokens >= 1_000) {
    return (tokens / 1_000).toFixed(1) + "k";
  }
  return tokens.toLocaleString();
}

export function parseTokenUsageFromMarkdown(markdown: string): TokenUsage | null {
  if (!markdown) return null;

  // Match token footer: e.g. "• 14,104 tokens" or "• ~4,820 tokens"
  const tokenMatch = markdown.match(/•\s*~?([0-9,]+)\s*tokens/i);
  if (tokenMatch && tokenMatch[1]) {
    const totalTokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(totalTokens) && totalTokens > 0) {
      return {
        totalTokens,
      };
    }
  }

  return null;
}
