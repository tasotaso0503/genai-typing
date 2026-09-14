import { describe, expect, it } from 'vitest';
import { is429, isModelUnavailable, isOverloaded } from '../server/utils/errors';

describe('is429', () => {
  it('status 429 を検出する', () => {
    expect(is429({ status: 429 })).toBe(true);
    expect(is429({ response: { status: 429 } })).toBe(true);
  });

  it('メッセージからレート制限を検出する', () => {
    expect(is429({ message: 'Rate limit reached for model' })).toBe(true);
    expect(is429({ message: '[429] Too Many Requests' })).toBe(true);
    expect(is429({ message: 'Resource exhausted' })).toBe(true);
  });

  it('無関係なエラーを誤検出しない', () => {
    expect(is429({ status: 500, message: 'Internal error' })).toBe(false);
    expect(is429({ status: 401, message: 'Invalid API Key' })).toBe(false);
  });
});

describe('isOverloaded', () => {
  it('一時的な過負荷を検出する', () => {
    expect(isOverloaded({ status: 503 })).toBe(true);
    expect(isOverloaded({ message: 'This model is currently experiencing high demand.' })).toBe(true);
    expect(isOverloaded({ message: 'The model is overloaded. Please try again later.' })).toBe(true);
  });

  it('無関係なエラーを誤検出しない', () => {
    expect(isOverloaded({ status: 400, message: 'Bad request' })).toBe(false);
  });
});

describe('isModelUnavailable', () => {
  it('Groq のモデル提供終了を検出する', () => {
    const err = {
      status: 404,
      message: '404 {"error":{"message":"The model `llama-3.1-8b-instant` does not exist or you do not have access to it.","code":"model_not_found"}}',
    };
    expect(isModelUnavailable(err)).toBe(true);
  });

  it('Gemini のモデル提供終了を検出する', () => {
    const err = {
      message: '[GoogleGenerativeAI Error]: [404 Not Found] This model models/gemini-2.5-pro is no longer available to new users.',
    };
    expect(isModelUnavailable(err)).toBe(true);
  });

  it('decommissioned / deprecated の表現を検出する', () => {
    expect(isModelUnavailable({ message: 'This model has been decommissioned' })).toBe(true);
    expect(isModelUnavailable({ message: 'This model has been deprecated' })).toBe(true);
    expect(isModelUnavailable({ message: 'models/foo is not found for API version v1beta' })).toBe(true);
  });

  it('無関係なエラーを誤検出しない', () => {
    // ここで true になると、認証ミスのたびに全モデルを無駄に試してしまう
    expect(isModelUnavailable({ status: 401, message: 'Invalid API Key' })).toBe(false);
    expect(isModelUnavailable({ status: 429, message: 'Rate limit reached' })).toBe(false);
    expect(isModelUnavailable({ status: 400, message: 'Invalid request payload' })).toBe(false);
  });
});

describe('異常な入力', () => {
  it('null / undefined / 空オブジェクトでも落ちない', () => {
    for (const fn of [is429, isOverloaded, isModelUnavailable]) {
      expect(fn(null)).toBe(false);
      expect(fn(undefined)).toBe(false);
      expect(fn({})).toBe(false);
      expect(fn({ message: null })).toBe(false);
    }
  });
});
