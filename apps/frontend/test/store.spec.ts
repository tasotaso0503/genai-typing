import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTypingStore } from '../stores/typing';

// サーバーが返すエラーの形($fetch が投げる FetchError 相当)
function fetchError(statusCode: number, data?: Record<string, unknown>) {
  return Object.assign(new Error('Request failed'), {
    statusCode,
    data: { statusCode, data },
  });
}

// Nuxt の $fetch はグローバルなので stubGlobal で差し替える
function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('$fetch', vi.fn(impl));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('generateCode 正常系', () => {
  it('コードと解説を保持し、空行を正規化する', async () => {
    mockFetch(async () => ({ code: 'def f():\n   \n    pass', explanation: '関数です' }));
    const store = useTypingStore();

    await store.generateCode();

    expect(store.code).toBe('def f():\n\n    pass');
    expect(store.explanation).toBe('関数です');
    expect(store.error).toBeNull();
    expect(store.isLoading).toBe(false);
  });
});

describe('generateCode エラー系', () => {
  it('429 はカウントダウンを開始し、retryAfterSec を反映する', async () => {
    mockFetch(async () => {
      throw fetchError(429, { retryAfterSec: 12 });
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.retryCountdown).toBe(12);
    expect(store.error).toBe('APIの利用制限に達しました。12秒後に再試行できます。');
  });

  it('429 で retryAfterSec が無ければ 30 秒とみなす', async () => {
    mockFetch(async () => {
      throw fetchError(429);
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.retryCountdown).toBe(30);
  });

  it('model_unavailable はカウントダウンせず専用メッセージを出す', async () => {
    // 待っても復旧しないので「しばらく待ってから」と案内してはいけない
    mockFetch(async () => {
      throw fetchError(503, { reason: 'model_unavailable' });
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.retryCountdown).toBe(0);
    expect(store.error).toBe('AIモデルが利用できなくなっています。時間をおいても解消しない場合は管理者にご連絡ください。');
    expect(store.error).not.toContain('しばらく待って');
  });

  it('401 / 403 は API キーのエラーを出す', async () => {
    for (const status of [401, 403]) {
      mockFetch(async () => {
        throw fetchError(status);
      });
      const store = useTypingStore();

      await store.generateCode();

      expect(store.error).toBe('APIキーが無効です。設定を確認してください。');
    }
  });

  it('500 は汎用のサーバーエラーを出す', async () => {
    mockFetch(async () => {
      throw fetchError(500);
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.error).toBe('サーバーでエラーが発生しました。しばらく待ってから再度お試しください。');
  });

  it('400 は生成失敗のメッセージを出す', async () => {
    mockFetch(async () => {
      throw fetchError(400);
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.error).toBe('コードの生成に失敗しました。もう一度お試しください。');
  });

  it('エラーでも isLoading を false に戻す', async () => {
    mockFetch(async () => {
      throw fetchError(500);
    });
    const store = useTypingStore();

    await store.generateCode();

    expect(store.isLoading).toBe(false);
  });
});

describe('startCountdown', () => {
  it('毎秒減り、0 になったらエラー表示を消す', () => {
    const store = useTypingStore();

    store.startCountdown(3);
    expect(store.retryCountdown).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(store.retryCountdown).toBe(2);
    expect(store.error).toBe('APIの利用制限に達しました。2秒後に再試行できます。');

    vi.advanceTimersByTime(2000);
    expect(store.retryCountdown).toBe(0);
    expect(store.error).toBeNull();
  });
});

describe('reset', () => {
  it('コード・解説・エラーを消す', () => {
    const store = useTypingStore();
    store.code = 'x';
    store.explanation = 'y';
    store.error = 'z';
    store.retryCountdown = 5;

    store.reset();

    expect(store.code).toBe('');
    expect(store.explanation).toBe('');
    expect(store.error).toBeNull();
    expect(store.retryCountdown).toBe(0);
  });
});

describe('tabSize', () => {
  it('言語ごとのインデント幅を返す', () => {
    const store = useTypingStore();
    store.language = 'Python';
    expect(store.tabSize).toBe(4);

    store.language = 'TypeScript';
    expect(store.tabSize).toBe(2);

    store.language = 'Unknown';
    expect(store.tabSize).toBe(2);
  });
});
