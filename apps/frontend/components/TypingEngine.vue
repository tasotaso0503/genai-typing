<template>
  <div ref="engineRef" class="typing-engine" tabindex="0" @keydown="handleKeydown">
    <div v-if="store.isLoading" class="loading-overlay">
      <div class="loading-card">
        <span class="loading-spinner" />
        <p>コードを生成中...</p>
      </div>
    </div>

    <div v-if="store.explanation" class="explanation">
      <strong>解説:</strong> {{ store.explanation }}
    </div>

    <CodeDisplay
      :current-index="currentIndex"
      :typed="typed"
      :wpm="wpm"
      :accuracy="accuracy"
      :show-full="showFullCode"
    />

    <div class="controls">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="control-row">
        <span class="hint">ここをクリックしてタイピング開始</span>
        <div class="control-buttons">
          <button class="btn btn-secondary" @click="goHome">ホームに戻る</button>
          <button class="btn btn-secondary" @click="retry">やり直し</button>
          <button class="btn btn-secondary" @click="regenerate">別パターン生成</button>
          <button class="btn btn-secondary" @click="showFullCode = !showFullCode">
            {{ showFullCode ? 'フォーカス表示' : 'コード全体表示' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="store.error" class="error">{{ store.error }}</p>

    <div v-if="isComplete && showResultOverlay" class="result-overlay" @click="showResultOverlay = false">
      <div class="result-card" @click.stop>
        <h3>完了!</h3>
        <div class="result-stats">
          <div class="result-stat">
            <span class="result-value">{{ wpm }}</span>
            <span class="result-label">WPM</span>
          </div>
          <div class="result-stat">
            <span class="result-value" :class="accuracyClass">{{ accuracy }}%</span>
            <span class="result-label">正確率</span>
          </div>
          <div class="result-stat">
            <span class="result-value">{{ elapsedSeconds }}s</span>
            <span class="result-label">タイム</span>
          </div>
        </div>
        <p class="result-hint">クリックで閉じる</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()
const engineRef = ref<HTMLElement>()
const showFullCode = ref(false)
const showResultOverlay = ref(true)

const typed = ref<string[]>([])
const currentIndex = ref(0)
const startTime = ref<number | null>(null)
const endTime = ref<number | null>(null)
const correctCount = ref(0)
const totalKeystrokes = ref(0)

const isComplete = computed(() => currentIndex.value >= store.code.length && store.code.length > 0)

const elapsedSeconds = computed(() => {
  if (!startTime.value) return 0
  const end = endTime.value || Date.now()
  return Math.round((end - startTime.value) / 1000)
})

const wpm = computed(() => {
  if (!startTime.value || correctCount.value === 0) return 0
  const end = endTime.value || Date.now()
  const minutes = (end - startTime.value) / 60000
  if (minutes < 0.01) return 0
  return Math.round(correctCount.value / 5 / minutes)
})

const accuracy = computed(() => {
  if (totalKeystrokes.value === 0) return 100
  return Math.round((correctCount.value / totalKeystrokes.value) * 100)
})

const accuracyClass = computed(() => {
  if (accuracy.value >= 95) return 'accuracy-high'
  if (accuracy.value >= 80) return 'accuracy-mid'
  return 'accuracy-low'
})

const progressPercent = computed(() => {
  if (store.code.length === 0) return 0
  return Math.round((currentIndex.value / store.code.length) * 100)
})

function handleKeydown(e: KeyboardEvent) {
  if (isComplete.value) return
  if (e.ctrlKey || e.metaKey) return

  const target = store.code[currentIndex.value]
  if (!target) return

  // バックスラッシュ変換: ¥キー単体、Option+¥、Option+\ いずれも \ として入力
  const isBackslash = e.key === '¥' || e.key === '\\' || e.code === 'IntlYen'
  if (isBackslash && !e.shiftKey) {
    e.preventDefault()
    if (!startTime.value) startTime.value = Date.now()
    typed.value[currentIndex.value] = '\\'
    totalKeystrokes.value++
    if (target === '\\') correctCount.value++
    currentIndex.value++
    if (isComplete.value) endTime.value = Date.now()
    return
  }

  // パイプ変換: Shift+¥ を | として入力
  const isPipe = e.shiftKey && (e.key === '¥' || e.code === 'IntlYen')
  if (isPipe) {
    e.preventDefault()
    if (!startTime.value) startTime.value = Date.now()
    typed.value[currentIndex.value] = '|'
    totalKeystrokes.value++
    if (target === '|') correctCount.value++
    currentIndex.value++
    if (isComplete.value) endTime.value = Date.now()
    return
  }

  // altKey単体の修飾キーは無視（バックスラッシュ系は上で処理済み）
  if (e.altKey) return

  if (e.key === 'Tab') {
    e.preventDefault()
    if (!startTime.value) startTime.value = Date.now()
    const tabSpaces = store.tabSize
    for (let s = 0; s < tabSpaces; s++) {
      const t = store.code[currentIndex.value]
      if (!t) break
      typed.value[currentIndex.value] = ' '
      totalKeystrokes.value++
      if (t === ' ') correctCount.value++
      currentIndex.value++
    }
    if (isComplete.value) endTime.value = Date.now()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (target === '\n') {
      typed.value[currentIndex.value] = '\n'
      correctCount.value++
      totalKeystrokes.value++
      currentIndex.value++
      if (!startTime.value) startTime.value = Date.now()
    }
    return
  }

  if (e.key === 'Backspace') {
    e.preventDefault()
    if (currentIndex.value > 0) {
      currentIndex.value--
      if (typed.value[currentIndex.value] === store.code[currentIndex.value]) {
        correctCount.value--
      }
      totalKeystrokes.value--
      typed.value.splice(currentIndex.value, 1)
    }
    return
  }

  if (e.key.length !== 1) return
  e.preventDefault()

  if (!startTime.value) startTime.value = Date.now()

  typed.value[currentIndex.value] = e.key
  totalKeystrokes.value++

  if (e.key === target) {
    correctCount.value++
  }

  currentIndex.value++

  if (isComplete.value) {
    endTime.value = Date.now()
    showFullCode.value = true
  }
}

function retry() {
  typed.value = []
  currentIndex.value = 0
  startTime.value = null
  endTime.value = null
  correctCount.value = 0
  totalKeystrokes.value = 0
  showFullCode.value = false
  showResultOverlay.value = true
  nextTick(() => engineRef.value?.focus())
}

function regenerate() {
  retry()
  store.generateCode()
}

function goHome() {
  store.reset()
}

onMounted(() => {
  engineRef.value?.focus()
})
</script>

<style scoped>
.typing-engine {
  outline: none;
  position: relative;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  border-radius: 8px;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: #ffffff;
  font-size: 1.2rem;
  font-weight: 700;
}

.loading-spinner {
  display: inline-block;
  width: 32px;
  height: 32px;
  border: 3px solid transparent;
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.explanation {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
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

.controls {
  margin-top: 1rem;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background-color: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-fill {
  height: 100%;
  background-color: var(--accent);
  transition: width 0.15s ease;
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  cursor: pointer;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-secondary {
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background-color: var(--border);
  color: var(--text-primary);
}

.result-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  cursor: pointer;
}

.result-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem 3rem;
  text-align: center;
}

.result-card h3 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  color: var(--success);
}

.result-stats {
  display: flex;
  gap: 2rem;
  margin-bottom: 1rem;
}

.result-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.result-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.result-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.result-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 1rem;
}

.accuracy-high {
  color: var(--success) !important;
}

.accuracy-mid {
  color: var(--warning) !important;
}

.accuracy-low {
  color: var(--error) !important;
}
</style>
