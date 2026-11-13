// placeholder replaced in M3
export interface LLMRouter { describe(): { active: string; dataEgress: 'remote' | 'local'; chain: string[] } }
export function createLLMRouter(): LLMRouter { return { describe: () => ({ active: 'deterministic', dataEgress: 'local', chain: ['deterministic'] }) }; }
