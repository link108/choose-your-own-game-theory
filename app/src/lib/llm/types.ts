export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  complete(params: {
    messages: Message[];
    maxTokens: number;
    temperature?: number;
  }): Promise<string>;
}

export interface LLMConfig {
  provider: "openrouter" | "anthropic";
  model: string;
}
