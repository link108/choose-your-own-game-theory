import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message } from "./types";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(model?: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    this.client = new Anthropic({ apiKey });
    this.model = model || process.env.LLM_MODEL || DEFAULT_MODEL;
  }

  async complete(params: {
    messages: Message[];
    maxTokens: number;
    temperature?: number;
  }): Promise<string> {
    // Anthropic separates system messages from the conversation
    const systemMessage = params.messages.find((m) => m.role === "system");
    const conversationMessages = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: conversationMessages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Anthropic response");
    }

    return textBlock.text;
  }
}
