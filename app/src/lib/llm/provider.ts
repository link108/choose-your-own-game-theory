import type { LLMProvider } from "./types";
import { OpenRouterProvider } from "./openrouter";
import { AnthropicProvider } from "./anthropic";

let cachedProvider: LLMProvider | null = null;

/**
 * Get the configured LLM provider.
 * Caches the instance for reuse.
 */
export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.LLM_PROVIDER || "openrouter";

  switch (providerName) {
    case "anthropic":
      cachedProvider = new AnthropicProvider();
      break;
    case "openrouter":
    default:
      cachedProvider = new OpenRouterProvider();
      break;
  }

  return cachedProvider;
}

/**
 * Check if LLM is configured (has API key).
 */
export function isLLMConfigured(): boolean {
  const provider = process.env.LLM_PROVIDER || "openrouter";
  if (provider === "anthropic") {
    return !!process.env.ANTHROPIC_API_KEY;
  }
  return !!process.env.OPENROUTER_API_KEY;
}
