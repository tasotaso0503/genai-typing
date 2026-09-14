// LLM 呼び出しのエラーを「次のモデルに退避すべきか」で分類する。
// どれにも該当しないエラー(401 など)はフォールバックせず即座に投げる。

interface ErrorLike {
  status?: number;
  response?: { status?: number };
  message?: unknown;
}

function statusOf(err: unknown): number {
  const e = err as ErrorLike | null | undefined;
  return e?.status || e?.response?.status || 0;
}

function messageOf(err: unknown): string {
  const message = (err as ErrorLike | null | undefined)?.message;
  return typeof message === 'string' ? message.toLowerCase() : '';
}

// レート制限。待てば回復する
export function is429(err: unknown): boolean {
  const msg = messageOf(err);
  return (
    statusOf(err) === 429 ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('resource exhausted')
  );
}

// 一時的な過負荷(503 overloaded / high demand)。待てば回復する
export function isOverloaded(err: unknown): boolean {
  const msg = messageOf(err);
  return statusOf(err) === 503 || msg.includes('high demand') || msg.includes('overloaded');
}

// ベンダー側でモデルが提供終了/ID変更された場合。待っても回復しない
// (Groq: 404 model_not_found / Gemini: 404 "models/xxx is not found")
export function isModelUnavailable(err: unknown): boolean {
  const msg = messageOf(err);
  return (
    statusOf(err) === 404 ||
    msg.includes('model_not_found') ||
    msg.includes('does not exist') ||
    msg.includes('is not found') ||
    msg.includes('decommissioned') ||
    msg.includes('has been deprecated') ||
    // SDK が status を立てずメッセージにしか情報が無い場合がある
    msg.includes('404 not found') ||
    msg.includes('no longer available')
  );
}
