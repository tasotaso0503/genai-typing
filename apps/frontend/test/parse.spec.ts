import { describe, expect, it } from 'vitest';
import { parseGeneratorResponse } from '../server/utils/parse';

describe('マークダウンコードブロック', () => {
  it('コードと解説を抽出する', () => {
    const raw = [
      '```python',
      'def hello():',
      '    print("hi")',
      '```',
      '',
      'EXPLANATION: 挨拶を出力する関数です。',
    ].join('\n');

    const result = parseGeneratorResponse(raw);
    expect(result).toEqual({
      code: 'def hello():\n    print("hi")',
      explanation: '挨拶を出力する関数です。',
    });
  });

  it('言語指定が無いコードブロックも扱える', () => {
    const raw = '```\nconst a = 1\n```\nEXPLANATION: 定数定義。';
    expect(parseGeneratorResponse(raw)?.code).toBe('const a = 1');
  });

  it('解説が無ければ explanation は空文字になる', () => {
    const raw = '```go\npackage main\n```';
    expect(parseGeneratorResponse(raw)).toEqual({ code: 'package main', explanation: '' });
  });

  it('コードブロックの前後に余計な文章があっても抽出できる', () => {
    const raw = 'はい、作成しました。\n\n```ts\nlet x = 1\n```\n\nEXPLANATION: 変数宣言。';
    expect(parseGeneratorResponse(raw)?.code).toBe('let x = 1');
  });
});

describe('CODE_START / CODE_END 形式', () => {
  it('抽出できる', () => {
    const raw = 'CODE_START\nfn main() {}\nCODE_END\nEXPLANATION: エントリポイント。';
    expect(parseGeneratorResponse(raw)).toEqual({
      code: 'fn main() {}',
      explanation: 'エントリポイント。',
    });
  });
});

describe('JSON 形式へのフォールバック', () => {
  it('正しい JSON から抽出できる', () => {
    const raw = '{"code": "print(1)", "explanation": "出力する"}';
    expect(parseGeneratorResponse(raw)).toEqual({ code: 'print(1)', explanation: '出力する' });
  });

  it('文字列内に生の改行がある壊れた JSON も修復して読む', () => {
    const raw = '{"code": "line1\nline2", "explanation": "2行"}';
    expect(parseGeneratorResponse(raw)?.code).toBe('line1\nline2');
  });

  it('explanation が無くても code があれば通す', () => {
    const raw = '{"code": "print(1)"}';
    expect(parseGeneratorResponse(raw)).toEqual({ code: 'print(1)', explanation: '' });
  });
});

describe('区切りが無い生のコード', () => {
  it('コードらしい書き出しなら受け入れる', () => {
    const raw = 'import os\n\ndef main():\n    pass';
    expect(parseGeneratorResponse(raw)?.code).toBe(raw);
  });
});

describe('抽出できない場合', () => {
  it('例外ではなく null を返す', () => {
    // 呼び出し側は null を見てリトライするため、throw させてはいけない
    expect(parseGeneratorResponse('すみません、生成できませんでした。')).toBeNull();
    expect(parseGeneratorResponse('')).toBeNull();
    expect(parseGeneratorResponse('   \n  \n ')).toBeNull();
  });

  it('コードブロックが空なら null を返す', () => {
    expect(parseGeneratorResponse('```python\n\n```')).toBeNull();
  });

  it('JSON の code が空文字なら null を返す', () => {
    expect(parseGeneratorResponse('{"code": "", "explanation": "何もない"}')).toBeNull();
  });

  it('短すぎる平文はコードとみなさない', () => {
    expect(parseGeneratorResponse('import os')).toBeNull();
  });
});
