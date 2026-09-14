import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface ModelDef {
  provider: 'gemini' | 'groq';
  model: string;
}

export interface ApiKeys {
  google: string;
  groq: string;
}

// Groq の無料枠(TPM/TPD)はモデルごとに独立しているため、
// ノード間で同じモデルを使い回さず分散させる
export const REFINER_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'openai/gpt-oss-20b' },
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
];

export const GENERATOR_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'openai/gpt-oss-120b' },
  { provider: 'groq', model: 'qwen/qwen3.8-27b' },
  // 無料枠では gemini の pro 系が使えない(quota 0)。
  // flash 系は thinking で30秒前後かかり maxDuration に収まりにくいため flash-lite を使う。
  // 2.5 系より 3.1 系の方が RPD が大きい(500)ので 3.1 に寄せる
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
];

export const VALIDATOR_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'qwen/qwen3.6-27b' },
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
];

export function createLlm(def: ModelDef, keys: ApiKeys): BaseChatModel {
  if (def.provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      model: def.model,
      temperature: 0.7,
      apiKey: keys.google,
      maxRetries: 0,
    });
  }
  return new ChatGroq({
    model: def.model,
    temperature: 0.7,
    apiKey: keys.groq,
    maxRetries: 0,
  });
}
