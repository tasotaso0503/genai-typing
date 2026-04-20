import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// --- Constants ---
const MAX_GRAPH_ITERATIONS = 3;
const MAX_CODE_LINES = 60;
const TARGET_CODE_LINES = 20;

const ALLOWED_LANGUAGES = [
  'Python', 'Go', 'TypeScript', 'JavaScript', 'Rust', 'Java',
  'C', 'C++', 'C#', 'Kotlin', 'Swift', 'Dart', 'Ruby', 'PHP',
  'Scala', 'Elixir', 'Haskell', 'Lua', 'R', 'Shell',
  'SQL', 'HCL', 'YAML', 'Dockerfile',
];

const ALLOWED_FRAMEWORKS: Record<string, string[]> = {
  Python: ['FastAPI', 'Django', 'Flask', 'Streamlit', 'SQLAlchemy', 'Celery', 'LangChain', 'LangGraph', 'LlamaIndex', 'OpenAI SDK', 'Anthropic SDK', 'Hugging Face Transformers'],
  Go: ['Gin', 'Echo', 'Fiber', 'Chi', 'GORM'],
  TypeScript: ['NestJS', 'Express', 'Hono', 'Next.js', 'Nuxt', 'Astro', 'Prisma', 'tRPC', 'LangChain.js', 'LangGraph.js', 'OpenAI SDK', 'Anthropic SDK', 'Vercel AI SDK'],
  JavaScript: ['Express', 'Hono', 'Next.js', 'React', 'Vue.js', 'Svelte', 'LangChain.js', 'OpenAI SDK'],
  Rust: ['Actix Web', 'Axum', 'Rocket', 'Tokio', 'Diesel'],
  Java: ['Spring Boot', 'Quarkus', 'Micronaut', 'Jakarta EE'],
  'C#': ['ASP.NET Core', 'Entity Framework', 'Blazor', 'MAUI'],
  Kotlin: ['Ktor', 'Spring Boot', 'Jetpack Compose', 'Exposed'],
  Swift: ['SwiftUI', 'Vapor', 'Combine'],
  Dart: ['Flutter', 'Shelf'],
  Ruby: ['Rails', 'Sinatra', 'Hanami'],
  PHP: ['Laravel', 'Symfony', 'Slim'],
  Scala: ['Akka', 'Play Framework', 'ZIO', 'Cats Effect'],
  Elixir: ['Phoenix', 'Ecto', 'LiveView'],
  SQL: ['PostgreSQL', 'MySQL', 'SQLite'],
  HCL: ['Terraform', 'Packer'],
  YAML: ['GitHub Actions', 'Docker Compose', 'Kubernetes', 'Ansible'],
};

const TAB_SIZES: Record<string, number> = {
  Python: 4,
  Go: 4,
  Rust: 4,
  Java: 4,
  Kotlin: 4,
  C: 4,
  'C++': 4,
  'C#': 4,
  Swift: 4,
  R: 2,
  TypeScript: 2,
  JavaScript: 2,
  Dart: 2,
  Ruby: 2,
  PHP: 4,
  Scala: 2,
  Elixir: 2,
  Haskell: 2,
  Lua: 2,
  Shell: 2,
  SQL: 2,
  HCL: 2,
  YAML: 2,
  Dockerfile: 4,
};

function getTabSize(language: string): number {
  return TAB_SIZES[language] || 2;
}

// --- Model Definitions ---
interface ModelDef {
  provider: 'gemini' | 'groq';
  model: string;
}

const REFINER_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'llama-3.1-8b-instant' },
  { provider: 'groq', model: 'llama-4-scout-17b-instruct' },
  { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
];

const GENERATOR_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'qwen/qwen3-32b' },
  { provider: 'groq', model: 'llama-4-scout-17b-instruct' },
  { provider: 'gemini', model: 'gemini-2.5-pro' },
];

const VALIDATOR_MODELS: ModelDef[] = [
  { provider: 'groq', model: 'llama-3.1-8b-instant' },
  { provider: 'groq', model: 'qwen/qwen3-32b' },
  { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
];

// --- Rate Limiter (Upstash Redis) ---
let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const config = useRuntimeConfig();
  const url = config.upstashRedisRestUrl as string;
  const token = config.upstashRedisRestToken as string;

  if (!url || !token) {
    console.warn('[RateLimit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set, rate limiting disabled');
    return null;
  }

  const redis = new Redis({ url, token });
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'genai-typing',
  });

  return ratelimit;
}

// --- LLM Factory ---
function createLlm(def: ModelDef, keys: { google: string; groq: string }): BaseChatModel {
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

function is429(err: any): boolean {
  const status = err?.status || err?.response?.status || 0;
  const msg = (err?.message || '').toLowerCase();
  return status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('resource exhausted');
}

async function invokeWithFallback(
  nodeName: string,
  models: ModelDef[],
  keys: { google: string; groq: string },
  messages: (SystemMessage | HumanMessage)[],
): Promise<string> {
  const available = models.filter((def) => {
    if (def.provider === 'gemini' && !keys.google) return false;
    if (def.provider === 'groq' && !keys.groq) return false;
    return true;
  });

  for (const def of available) {
    const label = `${def.provider}/${def.model}`;

    try {
      console.log(`[${nodeName}] Trying: ${label}`);
      const startTime = Date.now();
      const llm = createLlm(def, keys);
      const response = await llm.invoke(messages);
      console.log(`[${nodeName}] ${label}: Done in ${Date.now() - startTime}ms`);
      return response.content as string;
    } catch (err: any) {
      if (is429(err)) {
        console.warn(`[${nodeName}] ${label}: 429 rate limited, falling back`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[${nodeName}] All models exhausted`);
}

// --- Response Parser ---
// マークダウン区切り形式からコードと解説を抽出する
// LLMの出力ゆれに対応するため、複数の抽出戦略をフォールバックで試す
function parseGeneratorResponse(raw: string): { code: string; explanation: string } | null {
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
function repairJson(raw: string): string {
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

// --- Graph State ---
const GraphState = Annotation.Root({
  language: Annotation<string>,
  framework: Annotation<string>,
  prompt: Annotation<string>,
  refinedPrompt: Annotation<string>,
  code: Annotation<string>,
  explanation: Annotation<string>,
  isValid: Annotation<boolean>,
  retryCount: Annotation<number>,
  lastError: Annotation<string>,
});

type GraphStateType = typeof GraphState.State;

function createNodes(keys: { google: string; groq: string }) {
  async function refinerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const frameworkNote = state.framework
      ? `使用フレームワーク: ${state.framework}`
      : '';

    const content = await invokeWithFallback('Refiner', REFINER_MODELS, keys, [
      new SystemMessage(
        `あなたはプログラミング教育の専門家です。ユーザーの要望を「タイピング練習用コードスニペット」を生成するためのプロンプトに変換してください。

## 厳守事項
- 出力するプロンプトには以下の制約を必ず含めること：
  - 言語は「${state.language}」のみ。他の言語のコードは絶対に含めない。
  ${frameworkNote ? `- フレームワークは「${state.framework}」を使用する。` : '- フレームワーク指定なし。標準ライブラリのみ使用する。'}
  - コードは${TARGET_CODE_LINES}行前後（最大${MAX_CODE_LINES}行未満）。
  - コード内に日本語は含めない（変数名・コメント・文字列すべて英語）。
  - 1行は80文字以内。長い文字列や式は適切に改行すること。
  - インデントはスペース${getTabSize(state.language)}つ。
- プロンプトのみを出力し、それ以外は何も出力しないこと。`,
      ),
      new HumanMessage(
        `ユーザーの要望: ${state.prompt}`,
      ),
    ]);

    return { refinedPrompt: content };
  }

  async function generatorNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    // リトライ時は前回の失敗理由を具体的に伝える
    let retryNote = '';
    if (state.retryCount > 0 && state.lastError) {
      retryNote = `\n\n## 前回の失敗理由（${state.retryCount}回目の再生成）\n${state.lastError}\nこの問題を修正してください。`;
    }

    const content = await invokeWithFallback('Generator', GENERATOR_MODELS, keys, [
      new SystemMessage(
        `あなたは${state.language}のエキスパートです。以下のルールに厳密に従ってコードを生成してください。

## 厳守ルール（違反は不合格）
1. 言語: ${state.language}のコードのみ出力すること。他の言語は絶対に不可。
${state.framework ? `2. フレームワーク: ${state.framework}を使用すること。` : '2. フレームワーク指定なし。標準ライブラリのみ使用する。'}
3. 行数: ${TARGET_CODE_LINES}行前後（最大${MAX_CODE_LINES}行未満）。厳守。
4. コード内に日本語は絶対に含めない。変数名、コメント、文字列リテラルはすべて英語。
5. インデントはスペース${getTabSize(state.language)}つ。
6. 1行は80文字以内。長い文字列や式は適切に改行すること。
7. 実用的で学びのあるコードにする。
8. コメントは最小限。

## 出力形式（厳守）
以下の形式で出力してください。JSON形式は使わないでください。

\`\`\`${state.language.toLowerCase()}
ここにコードを書く
\`\`\`

EXPLANATION: ここにコードの解説を日本語で1〜2文で書く

上記の形式以外は一切出力しないでください。${retryNote}`,
      ),
      new HumanMessage(state.refinedPrompt),
    ]);

    console.log(`[Generator] Raw response length: ${content.length} chars`);

    const parsed = parseGeneratorResponse(content);

    if (parsed && parsed.code.trim()) {
      const lines = parsed.code.split('\n').length;
      console.log(`[Generator] Parsed successfully: ${lines} lines`);
      return {
        code: parsed.code,
        explanation: parsed.explanation || 'コードが生成されました。',
        lastError: '',
      };
    }

    // パース完全失敗
    console.error('[Generator] All parse strategies failed');
    console.error('[Generator] Raw response (first 500 chars):', content.substring(0, 500));
    return {
      code: '',
      explanation: '',
      lastError: 'レスポンスのパースに失敗しました。マークダウンのコードブロック（```で囲む形式）でコードを出力してください。',
    };
  }

  async function validatorNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const lines = state.code.split('\n').length;
    const isEmpty = state.code.trim().length === 0;
    const newRetryCount = state.retryCount + 1;

    if (isEmpty) {
      console.log(`[Validator] Rejected: empty code (attempt ${newRetryCount})`);
      return {
        isValid: false,
        retryCount: newRetryCount,
        lastError: state.lastError || 'コードが空です。コードブロック内にコードを出力してください。',
      };
    }

    if (lines >= MAX_CODE_LINES) {
      console.log(`[Validator] Rejected: ${lines} lines >= ${MAX_CODE_LINES} (attempt ${newRetryCount})`);
      return {
        isValid: false,
        retryCount: newRetryCount,
        lastError: `コードが${lines}行あり、${MAX_CODE_LINES}行の制限を超えています。${TARGET_CODE_LINES}行前後に短縮してください。`,
      };
    }

    // 日本語混入チェック（LLM不要）
    const hasJapanese = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(state.code);
    if (hasJapanese) {
      console.log(`[Validator] Rejected: Japanese characters found (attempt ${newRetryCount})`);
      return {
        isValid: false,
        retryCount: newRetryCount,
        lastError: 'コード内に日本語が含まれています。変数名・コメント・文字列リテラルはすべて英語にしてください。',
      };
    }

    // LLMで構文・言語チェック
    try {
      const content = await invokeWithFallback('Validator', VALIDATOR_MODELS, keys, [
        new SystemMessage(
          `You are a strict code validator. Check the following code and reply ONLY with a JSON object.

## Checks
1. The code must be valid ${state.language} code. If it is written in a different language, reject it.
${state.framework ? `2. The code should use the ${state.framework} framework.` : ''}
3. The code must not have obvious syntax errors.

Reply format: {"valid": true} or {"valid": false, "reason": "brief reason in English"}`,
        ),
        new HumanMessage(state.code),
      ]);

      const jsonMatch = content.trim().match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          if (result.valid === false) {
            const reason = result.reason || 'validation failed';
            console.log(`[Validator] Rejected by LLM: ${reason} (attempt ${newRetryCount})`);
            return {
              isValid: false,
              retryCount: newRetryCount,
              lastError: `コードの検証に失敗: ${reason}`,
            };
          }
        } catch {
          console.warn('[Validator] Failed to parse LLM validation response');
        }
      }
    } catch (err) {
      console.warn('[Validator] LLM check failed, falling back to basic checks only');
    }

    console.log(`[Validator] Accepted: ${lines} lines`);
    return { isValid: true, retryCount: newRetryCount, lastError: '' };
  }

  return { refinerNode, generatorNode, validatorNode };
}

export default defineEventHandler(async (event) => {
  // --- IP-based rate limiting ---
  const rl = getRatelimit();
  if (rl) {
    const forwarded = getHeader(event, 'x-forwarded-for');
    const ip = forwarded?.split(',')[0].trim() || getHeader(event, 'x-real-ip') || 'unknown';
    const { success, reset } = await rl.limit(ip);
    if (!success) {
      const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
      console.warn(`[generate] Rate limited IP: ${ip}, retry after ${retryAfterSec}s`);
      throw createError({
        statusCode: 429,
        data: { retryAfterSec },
        message: 'Too many requests',
      });
    }
  }

  const config = useRuntimeConfig();
  const keys = {
    google: config.googleApiKey as string,
    groq: config.groqApiKey as string,
  };

  if (!keys.google && !keys.groq) {
    console.error('[generate] No API keys configured (GOOGLE_API_KEY or GROQ_API_KEY)');
    throw createError({ statusCode: 500, message: 'API keys are not configured' });
  }

  const body = await readBody(event);
  const language = (body.language || '').trim();
  const framework = (body.framework || '').trim();
  const prompt = (body.prompt || '').trim().slice(0, 100);

  console.log(`[generate] Request: language=${language}, framework=${framework || 'none'}, prompt="${prompt}"`);

  if (!language || !prompt) {
    console.warn('[generate] Bad request: missing language or prompt');
    throw createError({ statusCode: 400, message: 'language and prompt are required' });
  }

  if (!ALLOWED_LANGUAGES.includes(language)) {
    console.warn(`[generate] Bad request: invalid language "${language}"`);
    throw createError({ statusCode: 400, message: 'Invalid language' });
  }

  if (framework && !(ALLOWED_FRAMEWORKS[language] || []).includes(framework)) {
    console.warn(`[generate] Bad request: invalid framework "${framework}" for ${language}`);
    throw createError({ statusCode: 400, message: 'Invalid framework' });
  }

  const totalStart = Date.now();
  const { refinerNode, generatorNode, validatorNode } = createNodes(keys);

  try {
    const graph = new StateGraph(GraphState)
      .addNode('refiner', refinerNode)
      .addNode('generator', generatorNode)
      .addNode('validator', validatorNode)
      .addEdge(START, 'refiner')
      .addEdge('refiner', 'generator')
      .addEdge('generator', 'validator')
      .addConditionalEdges('validator', (state: GraphStateType) => {
        if (state.isValid) return END;
        if (state.retryCount >= MAX_GRAPH_ITERATIONS) {
          console.warn(`[generate] Max retries (${MAX_GRAPH_ITERATIONS}) reached, accepting last result`);
          return END;
        }
        console.log(`[generate] Retry ${state.retryCount}/${MAX_GRAPH_ITERATIONS}: ${state.lastError}`);
        return 'generator';
      });

    const app = graph.compile();

    const result = await app.invoke({
      language,
      framework: framework || '',
      prompt,
      refinedPrompt: '',
      code: '',
      explanation: '',
      isValid: false,
      retryCount: 0,
      lastError: '',
    });

    // 最終防衛: 日本語が含まれていたら再生成
    const japanesePattern = /[\u3000-\u9FFF\uF900-\uFAFF]/;
    if (japanesePattern.test(result.code)) {
      console.warn('[generate] Final check: Japanese found in code, regenerating');
      const retryResult = await app.invoke({
        language,
        framework: framework || '',
        prompt,
        refinedPrompt: result.refinedPrompt,
        code: '',
        explanation: '',
        isValid: false,
        retryCount: 0,
        lastError: 'コード内に日本語が含まれていました。変数名・コメント・文字列リテラルはすべて英語にしてください。日本語のコメントも禁止です。',
      });
      console.log(`[generate] Regenerated in ${Date.now() - totalStart}ms`);
      return { code: retryResult.code, explanation: retryResult.explanation };
    }

    console.log(`[generate] Success in ${Date.now() - totalStart}ms (retries: ${result.retryCount})`);
    return { code: result.code, explanation: result.explanation };
  } catch (err: any) {
    const status = err?.status || err?.response?.status || 500;
    const message = err?.message || 'Unknown error';
    const isAllExhausted = message.includes('All models exhausted');
    console.error(`[generate] Error after ${Date.now() - totalStart}ms:`, message);

    throw createError({
      statusCode: isAllExhausted ? 429 : status,
      data: isAllExhausted ? { retryAfterSec: 30 } : undefined,
      message,
    });
  }
});
