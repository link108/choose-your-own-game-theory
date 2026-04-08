import OpenAI from "openai";
import type { LLMProvider, Message } from "./types";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.client.chat.completions.create as any)({
      model: this.model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
      // Disable extended thinking for reasoning models so tokens go to content
      reasoning: { effort: "none" },
    });

    const choice = response.choices?.[0];
    const content = choice?.message?.content;

    if (content) {
      return content;
    }

    // Fallback: some models put output in reasoning field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = choice?.message as any;
    const reasoning = raw?.reasoning;
    if (reasoning && typeof reasoning === "string") {
      // Try to extract JSON from the reasoning text
      const jsonMatch = reasoning.match(/(\{[\s\S]*\})/);
      if (jsonMatch) return jsonMatch[1];
      return reasoning;
    }

    console.error("Empty LLM response. Model:", this.model, "Finish reason:", choice?.finish_reason, "Raw:", JSON.stringify(choice?.message));
    throw new Error(`No content in LLM response from ${this.model}`);
  }
}
