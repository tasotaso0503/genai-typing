<template>
  <div class="code-display">
    <div class="code-header">
      <span class="filename">{{ store.language.toLowerCase() }}_practice</span>
      <span class="stats">
        <span v-if="wpm > 0" class="stat">{{ wpm }} WPM</span>
        <span class="stat" :class="accuracyClass">{{ accuracy }}% 正確率</span>
      </span>
    </div>
    <div class="code-body" :class="{ 'code-body-scrollable': showFull }" ref="codeBodyRef">
      <div class="line-numbers">
        <span
          v-for="line in visibleLines"
          :key="line.index"
          class="line-num"
          :class="{ 'line-num-active': line.index === currentLineIndex }"
        >{{ line.index + 1 }}</span>
      </div>
      <pre class="code-content"><span
        v-for="line in visibleLines"
        :key="'line-' + line.index"
        class="code-line"
        :class="showFull ? 'line-active' : { 'line-active': line.index === currentLineIndex, 'line-done': line.index < currentLineIndex, 'line-upcoming': line.index > currentLineIndex }"
      ><span
          v-for="(char, ci) in line.chars"
          :key="ci"
          :class="charClass(line.startIdx + ci)"
        ><template v-if="char === '\n'">↵
</template><template v-else-if="char === ' ' && ci < line.indentLen"><span class="space-indent">&middot;</span></template><template v-else-if="char === ' '"> </template><template v-else>{{ char }}</template></span></span></pre>
    </div>
    <div class="line-indicator">
      行 {{ currentLineIndex + 1 }} / {{ totalLines }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()
const codeBodyRef = ref<HTMLElement>()

const VISIBLE_CONTEXT = 7 // 現在行の前後に表示する行数

const props = defineProps<{
  currentIndex: number
  typed: string[]
  wpm: number
  accuracy: number
  showFull: boolean
}>()

const codeLines = computed(() => {
  const lines: { text: string; startIdx: number; chars: string[]; indentLen: number }[] = []
  let pos = 0
  const rawLines = store.code.split('\n')
  rawLines.forEach((text, i) => {
    const withNewline = i < rawLines.length - 1 ? text + '\n' : text
    const indentMatch = text.match(/^( +)/)
    lines.push({
      text: withNewline,
      startIdx: pos,
      chars: withNewline.split(''),
      indentLen: indentMatch ? indentMatch[1].length : 0,
    })
    pos += withNewline.length
  })
  return lines
})

const totalLines = computed(() => codeLines.value.length)

const currentLineIndex = computed(() => {
  for (let i = 0; i < codeLines.value.length; i++) {
    const line = codeLines.value[i]
    if (props.currentIndex >= line.startIdx && props.currentIndex < line.startIdx + line.chars.length) {
      return i
    }
  }
  return codeLines.value.length - 1
})

const visibleLines = computed(() => {
  if (props.showFull) {
    return codeLines.value.map((line, i) => ({ ...line, index: i }))
  }
  const start = Math.max(0, currentLineIndex.value - VISIBLE_CONTEXT)
  const end = Math.min(codeLines.value.length, currentLineIndex.value + VISIBLE_CONTEXT + 1)
  return codeLines.value.slice(start, end).map((line, _, __) => ({
    ...line,
    index: codeLines.value.indexOf(line),
  }))
})

const accuracyClass = computed(() => {
  if (props.accuracy >= 95) return 'accuracy-high'
  if (props.accuracy >= 80) return 'accuracy-mid'
  return 'accuracy-low'
})

watch(() => props.currentIndex, () => {
  const container = codeBodyRef.value
  if (!container) return

  nextTick(() => {
    const cursorEl = container.querySelector('.cursor') as HTMLElement | null
    if (!cursorEl) return

    const containerRect = container.getBoundingClientRect()
    const cursorRect = cursorEl.getBoundingClientRect()
    const margin = 80

    if (cursorRect.right > containerRect.right - margin) {
      container.scrollLeft += cursorRect.right - containerRect.right + margin
    }
  })
})

watch(currentLineIndex, () => {
  if (codeBodyRef.value) {
    codeBodyRef.value.scrollLeft = 0
  }
})

function charClass(index: number) {
  if (index === props.currentIndex) return 'char cursor'
  if (index >= props.typed.length) return 'char pending'
  if (props.typed[index] === store.code[index]) return 'char correct'
  return 'char incorrect'
}
</script>

<style scoped>
.code-display {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
}

.filename {
  color: var(--text-secondary);
}

.stats {
  display: flex;
  gap: 1rem;
}

.stat {
  color: var(--text-secondary);
  font-weight: 600;
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

.code-body {
  display: flex;
  padding: 1.25rem 0;
  overflow-x: auto;
}

.code-body-scrollable {
  max-height: 70vh;
  overflow-y: auto;
}

.line-numbers {
  display: flex;
  flex-direction: column;
  padding: 0 0.75rem;
  border-right: 1px solid var(--border);
  user-select: none;
}

.line-num {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--text-muted);
  text-align: right;
  min-width: 2ch;
  transition: color 0.2s;
}

.line-num-active {
  color: var(--accent);
}

.code-content {
  padding: 0 1.25rem;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  line-height: 1.7;
  white-space: pre;
  flex: 1;
}

.code-line {
  transition: opacity 0.2s;
}

.line-active {
  opacity: 1;
}

.line-done {
  opacity: 0.4;
}

.line-upcoming {
  opacity: 0.6;
}

.char {
  position: relative;
  letter-spacing: 0.02em;
}

.space-indent {
  display: inline-block;
  width: 0.7em;
  text-align: center;
  opacity: 0.5;
}

.char.pending {
  color: var(--text-muted);
}

.char.correct {
  color: var(--success);
}

.char.incorrect {
  color: var(--error);
  background-color: rgba(248, 81, 73, 0.15);
  border-radius: 2px;
}

.char.cursor {
  color: var(--text-primary);
  background-color: rgba(88, 166, 255, 0.3);
  border-radius: 2px;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    background-color: rgba(88, 166, 255, 0.1);
  }
}

.line-indicator {
  padding: 0.4rem 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
