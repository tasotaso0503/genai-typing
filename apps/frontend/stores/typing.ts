import { defineStore } from 'pinia'

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
}

const DEFAULT_TAB_SIZE = 2

export interface TypingState {
  language: string
  framework: string
  prompt: string
  code: string
  explanation: string
  isLoading: boolean
  error: string | null
  retryCountdown: number
}

export const useTypingStore = defineStore('typing', {
  state: (): TypingState => ({
    language: 'Python',
    framework: '',
    prompt: '',
    code: '',
    explanation: '',
    isLoading: false,
    error: null,
    retryCountdown: 0,
  }),

  getters: {
    tabSize(): number {
      return TAB_SIZES[this.language] || DEFAULT_TAB_SIZE
    },
  },

  actions: {
    async generateCode() {
      this.isLoading = true
      this.error = null
      this.retryCountdown = 0

      try {
        const response = await $fetch<{ code: string; explanation: string }>(
          '/api/generate',
          {
            method: 'POST',
            body: {
              language: this.language,
              framework: this.framework,
              prompt: this.prompt,
            },
          },
        )

        this.code = response.code
        this.explanation = response.explanation
      } catch (e: any) {
        const status = e.statusCode || e.status || 0
        const retryAfterSec = e.data?.data?.retryAfterSec || 0

        if (status === 429) {
          this.startCountdown(retryAfterSec || 30)
        } else if (status === 401 || status === 403) {
          this.error = 'APIキーが無効です。設定を確認してください。'
        } else if (status >= 500) {
          this.error = 'サーバーでエラーが発生しました。しばらく待ってから再度お試しください。'
        } else {
          this.error = 'コードの生成に失敗しました。もう一度お試しください。'
        }
      } finally {
        this.isLoading = false
      }
    },

    startCountdown(seconds: number) {
      this.retryCountdown = seconds
      this.error = `APIの利用制限に達しました。${seconds}秒後に再試行できます。`

      const timer = setInterval(() => {
        this.retryCountdown--
        if (this.retryCountdown <= 0) {
          clearInterval(timer)
          this.retryCountdown = 0
          this.error = null
        } else {
          this.error = `APIの利用制限に達しました。${this.retryCountdown}秒後に再試行できます。`
        }
      }, 1000)
    },

    reset() {
      this.code = ''
      this.explanation = ''
      this.error = null
      this.retryCountdown = 0
    },
  },
})
