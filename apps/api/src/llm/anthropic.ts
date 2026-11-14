import Anthropic from '@anthropic-ai/sdk';
import { MEAL_JSON_SCHEMA, MEAL_SYSTEM, MealParseResultSchema, NARRATE_JSON_SCHEMA, NARRATE_SYSTEM, mealUserPrompt,
  type LLMProvider, type LocalizedText, type MealParseInput, type MealParseResult, type NarrateInput, type PhotoParseInput } from './types.js';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly dataEgress = 'remote' as const;
  readonly capabilities: { text: boolean; vision: boolean; streaming: boolean };
  private readonly client: Anthropic;
  constructor(apiKey: string, readonly model: string, private readonly visionModel: string | null, private readonly promptVersion: string, baseURL?: string) {
    // Retries are ours (the job queue); the request path must fail fast and degrade.
    this.client = new Anthropic({ apiKey, maxRetries: 0, ...(baseURL ? { baseURL } : {}) });
    this.capabilities = { text: true, vision: Boolean(visionModel), streaming: true };
  }

  private async json(model: string, system: string, content: Anthropic.MessageParam['content'], schema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const r = await this.client.messages.create({
      model, max_tokens: 4000, system,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    }, { signal });
    if (r.stop_reason === 'refusal') throw new Error('model declined the request');
    if (r.stop_reason === 'max_tokens') throw new Error('model output truncated');
    const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return JSON.parse(text);
  }

  async parseMeal(input: MealParseInput, signal: AbortSignal): Promise<MealParseResult> {
    const raw = await this.json(this.model, MEAL_SYSTEM, mealUserPrompt(input), MEAL_JSON_SCHEMA as unknown as Record<string, unknown>, signal);
    return { ...MealParseResultSchema.parse(raw), model: `anthropic:${this.model}`, prompt_version: this.promptVersion };
  }
  async parsePhoto(input: PhotoParseInput, signal: AbortSignal): Promise<MealParseResult> {
    if (!this.visionModel) return { items: [], model: 'none', prompt_version: this.promptVersion };
    const raw = await this.json(this.visionModel, MEAL_SYSTEM, [
      { type: 'image', source: { type: 'base64', media_type: input.mime as 'image/jpeg', data: input.image.toString('base64') } },
      { type: 'text', text: `List the foods visible on this plate. ${input.hint ? `The user added: <meal>${input.hint}</meal>` : ''}` },
    ], MEAL_JSON_SCHEMA as unknown as Record<string, unknown>, signal);
    return { ...MealParseResultSchema.parse(raw), model: `anthropic:${this.visionModel}`, prompt_version: this.promptVersion };
  }
  async narrate(input: NarrateInput, signal: AbortSignal): Promise<LocalizedText> {
    return (await this.json(this.model, NARRATE_SYSTEM, JSON.stringify(input.payload), NARRATE_JSON_SCHEMA as unknown as Record<string, unknown>, signal)) as LocalizedText;
  }
  async classifyFood() { return { tags: [] }; }
}
