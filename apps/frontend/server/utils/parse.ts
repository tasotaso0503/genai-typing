// LLM 出力からコードと解説を抽出する。
// 出力ゆれに対応するため複数の戦略を順に試し、全て失敗したら null を返す。

export function parseGeneratorResponse(raw: string): { code: string; explanation: string } | null {
  // 戦略1: マークダウンコードブロック + EXPLANATION区切り
  {
    const codeMatch = raw.match(/```[\w]*\n([\s\S]*?)```/);
    const explMatch = raw.match(/EXPLANATION:\s*([\s\S]*?)$/m);
    if (codeMatch && codeMatch[1].trim()) {
      return {
        code: codeMatch[1].trimEnd(),
        explanation: explMatch ? explMatch[1].trim() : '',
      };
    }
  }

  // 戦略2: CODE_START/CODE_END 区切り
  {
    const codeMatch = raw.match(/CODE_START\n([\s\S]*?)\nCODE_END/);
    const explMatch = raw.match(/EXPLANATION:\s*([\s\S]*?)$/m);
    if (codeMatch && codeMatch[1].trim()) {
      return {
        code: codeMatch[1].trimEnd(),
        explanation: explMatch ? explMatch[1].trim() : '',
      };
    }
  }

  // 戦略3: JSON修復パーサー（従来形式のフォールバック）
  {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // 制御文字を修復してからパース
        const repaired = repairJson(jsonMatch[0]);
        const parsed = JSON.parse(repaired);
        if (typeof parsed.code === 'string' && parsed.code.trim()) {
          return {
            code: parsed.code,
            explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
          };
        }
      } catch {
        // JSON修復も失敗
      }
    }
  }

  // 戦略4: コードブロックのみ（解説なし）
  {
    const codeMatch = raw.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeMatch && codeMatch[1].trim()) {
      return {
        code: codeMatch[1].trimEnd(),
        explanation: '',
      };
    }
  }

  // 戦略5: 全体がコードっぽい場合（区切りなし）
  {
    const trimmed = raw.trim();
    const lines = trimmed.split('\n');
    // 先頭行がimport/package/from/const/func/def/class等で始まる場合はコードとみなす
    const codeIndicators = /^(import |package |from |const |let |var |func |def |class |public |private |module |use |#include|\/\/|\/\*|async |export )/;
    if (lines.length >= 3 && codeIndicators.test(lines[0])) {
      return {
        code: trimmed,
        explanation: '',
      };
    }
  }

  return null;
}

// 壊れたJSON文字列を修復する
export function repairJson(raw: string): string {
  let result = raw;

  // "code": "..." の中身にある生の改行をエスケープ
  // JSONの文字列値の中にある制御文字を置換
  result = result.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
    // 文字列値の中の制御文字をエスケープ
    return match
      .replace(/(?<!\\)\n/g, '\\n')
      .replace(/(?<!\\)\r/g, '\\r')
      .replace(/(?<!\\)\t/g, '\\t');
  });

  return result;
}

