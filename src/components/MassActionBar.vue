<template>
  <Transition name="mass-bar">
    <div v-if="count > 0" class="mass-bar" role="toolbar"
         aria-label="Действия с выбранными сотрудниками">
      <span class="mass-count">выбрано: <b>{{ count }}</b></span>
      <Button v-if="canToggleCycle" label="Исключить из цикла" size="small" severity="danger"
              text :loading="busy" @click="$emit('exclude')" />
      <Button v-if="canToggleCycle" label="Вернуть в цикл" size="small" severity="success"
              text :disabled="disabledInclude" :loading="busy" @click="$emit('include')" />
      <Button v-if="canBroadcast" label="Уведомить" size="small" severity="info" text
              :loading="busy" @click="$emit('notify')" />
      <Button v-if="canSend" label="Отправить задания на оценку" size="small"
              severity="secondary" :disabled="!sendWindow" :loading="busy"
              v-tooltip.top="sendWindow
                ? 'По итоговому набору пиров: новые задания + напоминания несдавшим'
                : `Окно стадий закрыто (${stageLabel || '—'})`"
              @click="$emit('send')" />
      <Button label="Снять выбор" size="small" text @click="$emit('clear')" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from 'primevue/button'

defineProps<{
  count: number
  busy: boolean
  canToggleCycle: boolean
  canBroadcast: boolean
  canSend: boolean
  sendWindow: boolean
  disabledInclude?: boolean
  stageLabel?: string
}>()

defineEmits<{ (e: 'exclude'): void; (e: 'include'): void; (e: 'notify'): void
  (e: 'send'): void; (e: 'clear'): void }>()
</script>

<style scoped>
/* плавающая панель над таблицей: не меняет вёрстку фильтров, без скачков */
.mass-bar {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px; z-index: 30;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: #0f172a; color: #e2e8f0; border-radius: 14px;
  padding: 10px 16px; box-shadow: 0 12px 32px rgba(15, 23, 42, .35);
  max-width: min(96vw, 860px);
}
.mass-count { font-size: 0.86rem; margin-right: 6px; white-space: nowrap; }
.mass-bar :deep(.p-button-text) { color: #e2e8f0; }
.mass-bar :deep(.p-button-text:hover) { background: #1e293b; color: #fff; }
.mass-bar :deep(.p-button.p-button-text:disabled) { color: #64748b; }
.mass-bar-enter-active, .mass-bar-leave-active { transition: all .18s ease; }
.mass-bar-enter-from, .mass-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
