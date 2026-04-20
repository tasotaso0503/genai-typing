<template>
  <div class="setup-form">
    <h2 class="form-title">練習設定</h2>

    <div class="form-row">
      <div class="form-group">
        <label for="language">言語</label>
        <select id="language" v-model="store.language" :disabled="store.isLoading">
          <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
        </select>
      </div>

      <div class="form-group">
        <label for="framework">フレームワーク</label>
        <select id="framework" v-model="store.framework" :disabled="store.isLoading">
          <option value="">なし</option>
          <option v-for="fw in frameworks" :key="fw" :value="fw">{{ fw }}</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="prompt">お題（プロンプト）</label>
      <textarea
        id="prompt"
        v-model="store.prompt"
        :disabled="store.isLoading"
        placeholder="例: 非同期処理の実装、PrismaでCRUD、認証ミドルウェア..."
        rows="3"
        maxlength="100"
      />
      <span class="char-count">{{ store.prompt.length }} / 100</span>
    </div>

    <div class="form-actions">
      <button
        class="btn btn-primary"
        :disabled="!store.prompt.trim() || store.isLoading || store.retryCountdown > 0"
        @click="store.generateCode()"
      >
        <span v-if="store.isLoading" class="spinner" />
        {{ store.isLoading ? '生成中...' : 'コードを生成' }}
      </button>
    </div>

    <p v-if="store.error" class="error">{{ store.error }}</p>
  </div>
</template>

<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()

const languages = [
  'Python', 'Go', 'TypeScript', 'JavaScript', 'Rust', 'Java',
  'C', 'C++', 'C#', 'Kotlin', 'Swift', 'Dart', 'Ruby', 'PHP',
  'Scala', 'Elixir', 'Haskell', 'Lua', 'R', 'Shell',
]

const frameworkMap: Record<string, string[]> = {
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
}

const frameworks = computed(() => frameworkMap[store.language] || [])

watch(
  () => store.language,
  () => {
    store.framework = ''
  },
)
</script>

<style scoped>
.setup-form {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem;
}

.form-title {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-group {
  flex: 1;
  margin-bottom: 1rem;
}

label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.4rem;
  font-weight: 500;
}

select,
textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

select:focus,
textarea:focus {
  outline: none;
  border-color: var(--accent);
}

textarea {
  resize: vertical;
  font-family: var(--font-sans);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background-color: var(--accent);
  color: var(--bg-primary);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--accent-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  margin-top: 0.75rem;
  padding: 0.6rem;
  background-color: rgba(248, 81, 73, 0.1);
  border: 1px solid var(--error);
  border-radius: 6px;
  color: var(--error);
  font-size: 0.85rem;
}
</style>
