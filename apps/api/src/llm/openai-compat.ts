/** OpenAI-compatible chat endpoint (Ollama, vLLM, LM Studio) — the "local model on your own hardware" path of D4. */
import { MEAL_SYSTEM, MealParseResultSchema, NARRATE_SYSTEM, mealUserPrompt, type LLMProvider, type LocalizedText, type MealParseInput, type MealParseResult, type NarrateInput } from './types.js';

export class OpenAICompatProvider implements LLMProvider {
  readonly id = 'openai-compat' as const;
  readonly dataEgress: 'remote' | 'local';
  readonly capabilities = { text: true, vision: false, streaming: false };
  constructor(private readonly endpoint: string, readonly model: string, private readonly promptVersion: string) {
    const host = new URL(endpoint).hostname;
    this.dataEgress = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^[a-z0-9-]+$/.test(host) ? 'local' : 'remote';
  }
  private async chat(system: string, user: string, signal: AbortSignal): Promise<unknown> {
    const r = await fetch(`${this.endpoint.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, response_format: { type: 'json_object' }, temperature: 0, messages: [{ role: 'system', content: `${system}\nReply with JSON only.` }, { role: 'user', content: user }] }) });
    if (!r.ok) throw new Error(`openai-compat ${r.status}`);
    const j = (await r.json()) as { choices: { message: { content: string } }[] };
    return JSON.parse(j.choices[0]!.message.content);
  }
  async parseMeal(input: MealParseInput, signal: AbortSignal): Promise<MealParseResult> {
    return { ...MealParseResultSchema.parse(await this.chat(`${MEAL_SYSTEM}\nShape: {"items":[{"raw_text","food_id","canonical_name","quantity","unit","grams_est","confidence","category"}]}`, mealUserPrompt(input), signal)), model: `openai-compat:${this.model}`, prompt_version: this.promptVersion };
  }
  async parsePhoto(): Promise<MealParseResult> { return { items: [], model: 'none', prompt_version: this.promptVersion }; }
  async narrate(input: NarrateInput, signal: AbortSignal): Promise<LocalizedText> { return (await this.chat(`${NARRATE_SYSTEM}\nShape: {"en": "...", "he": "..."}`, JSON.stringify(input.payload), signal)) as LocalizedText; }
  async classifyFood() { return { tags: [] }; }
}
