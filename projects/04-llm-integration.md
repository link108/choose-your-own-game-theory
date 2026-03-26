# Project 4: LLM Integration

## Goal
Wire up LLM calls (via OpenRouter, with Anthropic direct as fallback) to power actor reasoning, consequence narration, and choice generation. Replace the stub behavior from Project 3 with real AI responses.

## Dependencies
- Project 3 (Simulation Engine) complete

## Subprojects

### 4.1 Provider Abstraction
A simple interface that both providers implement:

```typescript
interface LLMProvider {
  complete(params: {
    model: string
    messages: Message[]
    maxTokens: number
    temperature?: number
  }): Promise<string>
}
```

**OpenRouter provider** (`lib/llm/openrouter.ts`):
- Uses OpenAI SDK pointed at `https://openrouter.ai/api/v1`
- `OPENROUTER_API_KEY` env var
- Default model: pick a cheap/free model (e.g. `meta-llama/llama-3.1-8b-instruct:free` or similar)
- Fallback model config for when free models are slow/down

**Anthropic provider** (`lib/llm/anthropic.ts`):
- Uses `@anthropic-ai/sdk`
- `ANTHROPIC_API_KEY` env var
- Default model: `claude-haiku-4-5-20251001`

**Config** (`lib/llm/config.ts`):
- `LLM_PROVIDER` env var: `"openrouter"` | `"anthropic"`
- `LLM_MODEL` env var: override default model
- Factory function: `getLLMProvider() → LLMProvider`

### 4.2 Prompt Templates
All prompts live in `lib/llm/prompts/` as template functions that take state and return message arrays.

**Actor Reasoning Prompt** (`actor-reasoning.ts`):
- Input: current state, actor details, recent events, player's choice
- Output: structured JSON — what does this actor do and why?
- Format:
  ```json
  {
    "action": "description of what the actor does",
    "reasoning": "why they chose this",
    "stateChanges": [
      { "type": "resource", "target": "ActorName", "field": "gold", "delta": -50, "reason": "..." }
    ]
  }
  ```

**Consequence Narration Prompt** (`narration.ts`):
- Input: player choice, actor responses, state changes, events
- Output: narrative text (2-4 paragraphs) describing what happened

**Choice Generation Prompt** (`choices.ts`):
- Input: current state after resolution, actor positions, tensions
- Output: 3-5 choices as structured JSON
  ```json
  {
    "choices": [
      { "id": "choice_1", "text": "Short label", "description": "What this means and likely consequences" }
    ]
  }
  ```

**Initial Page Prompt** (`initial-page.ts`):
- For turn 0: generate the opening narrative and first set of choices from the scenario setup

### 4.3 Output Parsing & Validation
- Parse LLM JSON responses (handle markdown code fences, partial JSON)
- Validate against expected schemas
- Reject hallucinated actor names / resources
- If LLM output fails validation:
  1. Retry once with a correction prompt
  2. If still invalid, fall back to stub behavior and log the failure
- Rate limiting / error handling for API calls

### 4.4 Integration with Simulation Engine
Replace the stub actor behavior in the turn resolution pipeline:
1. For each non-player actor, call actor reasoning prompt
2. Collect all proposed state changes
3. Run through validation (Project 3's validation layer — this is key)
4. After resolution, call narration prompt to generate narrative
5. Call choice generation prompt for next turn's choices
6. Assemble RenderedPage

### 4.5 Cost & Performance
- Log token usage per turn (input + output tokens)
- Track cost per turn (OpenRouter reports this)
- Keep prompts tight — include only relevant state, not full history
- Context window management: summarize old events rather than including all
- Target: < 2 seconds for full turn resolution (all LLM calls)
  - Consider parallel calls where possible (actor reasoning can be parallelized)

### 4.6 Environment & Config
```env
# .env
LLM_PROVIDER=openrouter         # or "anthropic"
LLM_MODEL=                       # optional override
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...     # fallback
```

## Done When
- LLM generates actor responses that feed into the simulation engine
- Narration is coherent and reflects actual state changes
- Choices are grounded in current state and distinct
- Validation catches and rejects hallucinated entities
- Provider can be swapped via env var
- Fallback to stub works when LLM fails
