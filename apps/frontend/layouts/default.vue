<template>
  <div class="layout">
    <header class="header">
      <div class="header-inner">
        <div class="header-left">
          <h1 class="logo" style="cursor: pointer;" @click="goHome">
            GenAI Typing
          </h1>
          <p class="tagline">AIが生成するコードでタイピング練習</p>
        </div>
        <div class="header-right">
          <select v-model="currentTheme" class="theme-select" @change="setTheme(currentTheme)">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="solarized">Solarized</option>
            <option value="monokai">Monokai</option>
          </select>
        </div>
      </div>
    </header>
    <main class="main">
      <slot />
    </main>
    <footer class="footer">
      <p class="disclaimer">本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を負いません。すべて自己責任でご利用ください。</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()
const currentTheme = ref('dark')

function goHome() {
  store.reset()
}

function setTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('genai-typing-theme', theme)
}

onMounted(() => {
  const saved = localStorage.getItem('genai-typing-theme')
  if (saved) {
    currentTheme.value = saved
    setTheme(saved)
  }
})
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  border-bottom: 1px solid var(--border);
  background-color: var(--bg-secondary);
  padding: 1rem 2rem;
  transition: background-color 0.2s, border-color 0.2s;
}

.header-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  font-size: 1.5rem;
}

.tagline {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.theme-select {
  padding: 0.35rem 0.6rem;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}

.theme-select:focus {
  outline: none;
  border-color: var(--accent);
}

.main {
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  padding: 2rem;
}

.footer {
  border-top: 1px solid var(--border);
  padding: 0.75rem 2rem;
  text-align: center;
}

.disclaimer {
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
