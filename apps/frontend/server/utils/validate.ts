export const ALLOWED_LANGUAGES = [
  'Python', 'Go', 'TypeScript', 'JavaScript', 'Rust', 'Java',
  'C', 'C++', 'C#', 'Kotlin', 'Swift', 'Dart', 'Ruby', 'PHP',
  'Scala', 'Elixir', 'Haskell', 'Lua', 'R', 'Shell',
  'SQL', 'HCL', 'YAML', 'Dockerfile',
];

export const ALLOWED_FRAMEWORKS: Record<string, string[]> = {
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

export function getTabSize(language: string): number {
  return TAB_SIZES[language] || 2;
}

export interface ValidatedRequest {
  language: string;
  framework: string;
  prompt: string;
}

export interface ValidationFailure {
  statusCode: number;
  message: string;
}

// リクエストボディを検証して正規化する。
// createError に依存させないため、失敗は例外ではなく戻り値で返す。
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateRequest(
  body: unknown,
): { ok: true; value: ValidatedRequest } | { ok: false; error: ValidationFailure } {
  const input = (body ?? {}) as Record<string, unknown>;
  const language = asString(input.language).trim();
  const framework = asString(input.framework).trim();
  const prompt = asString(input.prompt).trim().slice(0, 100);

  if (!language || !prompt) {
    return { ok: false, error: { statusCode: 400, message: 'language and prompt are required' } };
  }
  if (!ALLOWED_LANGUAGES.includes(language)) {
    return { ok: false, error: { statusCode: 400, message: 'Invalid language' } };
  }
  if (framework && !(ALLOWED_FRAMEWORKS[language] || []).includes(framework)) {
    return { ok: false, error: { statusCode: 400, message: 'Invalid framework' } };
  }

  return { ok: true, value: { language, framework, prompt } };
}
