import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { invokeWithFallback, type LlmFactory } from '../server/utils/fallback';
import type { ModelDef } from '../server/utils/models';

const KEYS = { google: 'g-key', groq: 'q-key' };

const MODELS: ModelDef[] = [
  { provider: 'groq', model: 'model-a' },
  { provider: 'groq', model: 'model-b' },
  { provider: 'gemini', model: 'model-c' },
];

function err(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

// 呼ばれた順にレスポンス(値 or エラー)を返すスタブ。
// invoke した順序を tried に記録する
function stubFactory(responses: Array<string | Error>) {
  const tried: string[] = [];
  const factory: LlmFactory = (def) => {
    return {
      invoke: async () => {
        tried.push(def.model);
        const r = responses[tried.length - 1];
        if (r instanceof Error) throw r;
        return { content: r };
      },
    } as unknown as BaseChatModel;
  };
  return { factory, tried };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('正常系', () => {
  it('1つ目が成功したら後続を呼ばない', async () => {
    const { factory, tried } = stubFactory(['generated code']);
    const result = await invokeWithFallback('Test', MODELS, KEYS, [], factory);

    expect(result).toBe('generated code');
    expect(tried).toEqual(['model-a']);
  });
});

describe('回復可能なエラーはフォールバックする', () => {
  it('429 なら次のモデルを試す', async () => {
    const { factory, tried } = stubFactory([err(429, 'Rate limit reached'), 'ok']);
    const result = await invokeWithFallback('Test', MODELS, KEYS, [], factory);

    expect(result).toBe('ok');
    expect(tried).toEqual(['model-a', 'model-b']);
  });

  it('503 の一時的過負荷なら次のモデルを試す', async () => {
    const { factory, tried } = stubFactory([err(503, 'This model is currently experiencing high demand.'), 'ok']);
    const result = await invokeWithFallback('Test', MODELS, KEYS, [], factory);

    expect(result).toBe('ok');
    expect(tried).toEqual(['model-a', 'model-b']);
  });

  it('404 モデル不在なら次のモデルを試し、error ログを残す', async () => {
    const { factory, tried } = stubFactory([err(404, 'model_not_found'), 'ok']);
    const result = await invokeWithFallback('Test', MODELS, KEYS, [], factory);

    expect(result).toBe('ok');
    expect(tried).toEqual(['model-a', 'model-b']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('MODEL UNAVAILABLE'));
  });

  it('定義順に試す', async () => {
    const { factory, tried } = stubFactory([err(429, 'rate limit'), err(429, 'rate limit'), 'ok']);
    await invokeWithFallback('Test', MODELS, KEYS, [], factory);

    expect(tried).toEqual(['model-a', 'model-b', 'model-c']);
  });
});

describe('全滅時のエラーの区別', () => {
  it('全てモデル不在なら MODEL_UNAVAILABLE を投げる', async () => {
    // 2026-09 の障害の再現: Groq の全モデルが提供終了していたケース
    const { factory } = stubFactory([err(404, 'model_not_found'), err(404, 'model_not_found'), err(404, 'model_not_found')]);

    await expect(invokeWithFallback('Generator', MODELS, KEYS, [], factory)).rejects.toThrow(
      '[Generator] MODEL_UNAVAILABLE: groq/model-a, groq/model-b, gemini/model-c',
    );
  });

  it('モデル不在と 429 が混在するなら All models exhausted を投げる', async () => {
    // 429 が絡む以上は待てば回復しうるので、設定ミス扱い(503)にしてはいけない
    const { factory } = stubFactory([err(404, 'model_not_found'), err(429, 'rate limit'), err(404, 'model_not_found')]);

    await expect(invokeWithFallback('Generator', MODELS, KEYS, [], factory)).rejects.toThrow(
      '[Generator] All models exhausted',
    );
  });

  it('全て 429 なら All models exhausted を投げる', async () => {
    const { factory } = stubFactory([err(429, 'rate limit'), err(429, 'rate limit'), err(429, 'rate limit')]);

    await expect(invokeWithFallback('Refiner', MODELS, KEYS, [], factory)).rejects.toThrow(
      '[Refiner] All models exhausted',
    );
  });
});

describe('回復不能なエラーは即座に投げる', () => {
  it('401 ならフォールバックせず throw する', async () => {
    const { factory, tried } = stubFactory([err(401, 'Invalid API Key'), 'ok']);

    await expect(invokeWithFallback('Test', MODELS, KEYS, [], factory)).rejects.toThrow('Invalid API Key');
    expect(tried).toEqual(['model-a']);
  });

  it('想定外の 500 系もフォールバックしない', async () => {
    const { factory, tried } = stubFactory([err(500, 'Internal Server Error'), 'ok']);

    await expect(invokeWithFallback('Test', MODELS, KEYS, [], factory)).rejects.toThrow('Internal Server Error');
    expect(tried).toEqual(['model-a']);
  });
});

describe('API キーによる絞り込み', () => {
  it('キーが無い provider はスキップする', async () => {
    const { factory, tried } = stubFactory(['ok']);
    const result = await invokeWithFallback('Test', MODELS, { google: 'g-key', groq: '' }, [], factory);

    expect(result).toBe('ok');
    expect(tried).toEqual(['model-c']);
  });

  it('候補が一つも無ければ All models exhausted を投げる', async () => {
    const { factory, tried } = stubFactory(['ok']);

    await expect(
      invokeWithFallback('Test', MODELS, { google: '', groq: '' }, [], factory),
    ).rejects.toThrow('[Test] All models exhausted');
    expect(tried).toEqual([]);
  });
});
