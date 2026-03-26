import OpenAI from "openai";
import type { LLMProvider, Message } from "./types";

const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

export class OpenRouterProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(model?: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });
    this.model = model || process.env.LLM_MODEL || DEFAULT_MODEL;
  }

  async complete(params: {
    messages: Message[];
    maxTokens: number;
    temperature?: number;
  }): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in LLM response");
    }

    return content;
  }
}
