import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../server/utils/fallback';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('期限内に解決すれば値を返す', async () => {
    const p = withTimeout(Promise.resolve('done'), 1500);
    await expect(p).resolves.toBe('done');
  });

  it('期限を超えたら reject する', async () => {
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 1500);
    const assertion = expect(p).rejects.toThrow('timeout');

    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it('元の Promise が reject したらその理由を伝播する', async () => {
    const p = withTimeout(Promise.reject(new Error('fetch failed')), 1500);
    await expect(p).rejects.toThrow('fetch failed');
  });

  it('成功時にタイマーを解除する', async () => {
    // 解除し忘れるとサーバーレス関数の終了が遅れる
    await withTimeout(Promise.resolve('done'), 1500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('失敗時にもタイマーを解除する', async () => {
    await withTimeout(Promise.reject(new Error('boom')), 1500).catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  });
});
