<template>
  <div class="page">
    <SetupForm v-if="!store.code" />
    <TypingEngine v-else />
  </div>
</template>

<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
