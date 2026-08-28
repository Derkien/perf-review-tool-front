<template>
  <Toast />
  <router-view />
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--p-surface-100, #f4f4f5);
}
h1 { font-size: 1.35rem; margin: 0 0 12px; }
h2 { font-size: 1.05rem; margin: 16px 0 8px; }
.page { padding: 16px 20px 40px; }
.muted { color: var(--p-text-muted-color, #6b7280); font-size: 0.85rem; }
.p-card { border-radius: 10px; }
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
function onApiError(e: Event) {
  const { message, url } = (e as CustomEvent).detail || {}
  toast.add({
    severity: 'error',
    summary: 'Ошибка запроса' + (url ? ` (${url})` : ''),
    detail: String(message || '').slice(0, 300),
    life: 8000,
  })
}
onMounted(() => {
  document.getElementById('fatal-error')?.remove()
  window.addEventListener('prtool:api-error', onApiError)
})
onBeforeUnmount(() => window.removeEventListener('prtool:api-error', onApiError))
</script>
