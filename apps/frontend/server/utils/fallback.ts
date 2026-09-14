import type { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLlm, type ApiKeys, type ModelDef } from './models';
import { is429, isModelUnavailable, isOverloaded } from './errors';

// Promise が返ってこないケースを打ち切る(タイムアウトは例外として呼び出し側で処理)
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export type LlmFactory = (def: ModelDef, keys: ApiKeys) => BaseChatModel;

// 定義順にモデルを試し、回復可能なエラーなら次のモデルに退避する。
// llmFactory はテストから差し替えるための注入ポイント。
export async function invokeWithFallback(
  nodeName: string,
  models: ModelDef[],
  keys: ApiKeys,
  messages: (SystemMessage | HumanMessage)[],
  llmFactory: LlmFactory = createLlm,
): Promise<string> {
  const available = models.filter((def) => {
    if (def.provider === 'gemini' && !keys.google) return false;
    if (def.provider === 'groq' && !keys.groq) return false;
    return true;
  });

  const unavailable: string[] = [];
  let sawTransient = false;

  for (const def of available) {
    const label = `${def.provider}/${def.model}`;

    try {
      console.log(`[${nodeName}] Trying: ${label}`);
      const startTime = Date.now();
      const llm = llmFactory(def, keys);
      const response = await llm.invoke(messages);
      console.log(`[${nodeName}] ${label}: Done in ${Date.now() - startTime}ms`);
      return response.content as string;
    } catch (err: unknown) {
      if (isModelUnavailable(err)) {
        // モデルIDが無効。設定を更新するまで復旧しないので警告ではなくエラーで残す
        unavailable.push(label);
        console.error(`[${nodeName}] ${label}: MODEL UNAVAILABLE (提供終了/ID変更の可能性), falling back: ${(err as Error)?.message}`);
        continue;
      }
      if (is429(err)) {
        sawTransient = true;
        console.warn(`[${nodeName}] ${label}: 429 rate limited, falling back`);
        continue;
      }
      if (isOverloaded(err)) {
        sawTransient = true;
        console.warn(`[${nodeName}] ${label}: overloaded, falling back`);
        continue;
      }
      throw err;
    }
  }

  // 429 や一時的過負荷が絡む場合は待てば回復するので従来通り。
  // 全滅の原因がモデル不在だけなら待っても無駄なので区別して投げる
  if (unavailable.length > 0 && !sawTransient) {
    throw new Error(`[${nodeName}] MODEL_UNAVAILABLE: ${unavailable.join(', ')}`);
  }
  throw new Error(`[${nodeName}] All models exhausted`);
}
