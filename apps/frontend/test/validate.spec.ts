import { describe, expect, it } from 'vitest';
import { getTabSize, validateRequest } from '../server/utils/validate';

describe('validateRequest 正常系', () => {
  it('許可された言語とプロンプトを通す', () => {
    const result = validateRequest({ language: 'Python', prompt: 'quick sort' });
    expect(result).toEqual({ ok: true, value: { language: 'Python', framework: '', prompt: 'quick sort' } });
  });

  it('言語に対応したフレームワークを通す', () => {
    const result = validateRequest({ language: 'Python', framework: 'FastAPI', prompt: 'api' });
    expect(result.ok).toBe(true);
  });

  it('前後の空白を除去する', () => {
    const result = validateRequest({ language: '  Go  ', prompt: '  http server  ' });
    expect(result).toMatchObject({ ok: true, value: { language: 'Go', prompt: 'http server' } });
  });

  it('プロンプトを100文字に切り詰める', () => {
    const result = validateRequest({ language: 'Python', prompt: 'a'.repeat(150) });
    expect(result.ok && result.value.prompt.length).toBe(100);
  });
});

describe('validateRequest 異常系', () => {
  it('言語が無ければ 400', () => {
    expect(validateRequest({ prompt: 'x' })).toEqual({
      ok: false,
      error: { statusCode: 400, message: 'language and prompt are required' },
    });
  });

  it('プロンプトが無ければ 400', () => {
    expect(validateRequest({ language: 'Python' }).ok).toBe(false);
  });

  it('プロンプトが空白のみなら 400', () => {
    expect(validateRequest({ language: 'Python', prompt: '    ' }).ok).toBe(false);
  });

  it('許可されていない言語は 400', () => {
    expect(validateRequest({ language: 'COBOL', prompt: 'x' })).toEqual({
      ok: false,
      error: { statusCode: 400, message: 'Invalid language' },
    });
  });

  it('言語に対応しないフレームワークは 400', () => {
    // Rails は Ruby 用。Python で指定させない
    expect(validateRequest({ language: 'Python', framework: 'Rails', prompt: 'x' })).toEqual({
      ok: false,
      error: { statusCode: 400, message: 'Invalid framework' },
    });
  });

  it('フレームワーク一覧を持たない言語にフレームワークを指定したら 400', () => {
    expect(validateRequest({ language: 'Lua', framework: 'Anything', prompt: 'x' }).ok).toBe(false);
  });

  it('body が空/null でも落ちずに 400 を返す', () => {
    expect(validateRequest({}).ok).toBe(false);
    expect(validateRequest(null).ok).toBe(false);
    expect(validateRequest(undefined).ok).toBe(false);
  });
});

describe('getTabSize', () => {
  it('言語ごとのインデント幅を返す', () => {
    expect(getTabSize('Python')).toBe(4);
    expect(getTabSize('TypeScript')).toBe(2);
  });

  it('未知の言語は 2 を返す', () => {
    expect(getTabSize('Brainfuck')).toBe(2);
  });
});
