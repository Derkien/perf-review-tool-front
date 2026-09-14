<template>
  <div class="row-actions">
    <Button icon="pi pi-user" size="small" text outlined rounded
            v-tooltip.top="'Профиль сотрудника'" @click.stop="$emit('profile')" />
    <Button icon="pi pi-users" size="small" text outlined rounded severity="success"
            v-tooltip.top="'Пиры сотрудника'" @click.stop="$emit('peers')" />
    <Button v-if="canBroadcast" icon="pi pi-megaphone" size="small" text outlined rounded
            severity="info" v-tooltip.top="'Уведомить'" @click.stop="$emit('notify')" />
    <Button v-if="canSend && sendWindow" icon="pi pi-send" size="small" text outlined rounded
            severity="warn" v-tooltip.top="sendTooltip" @click.stop="$emit('send')" />
    <!-- исключить/вернуть: иконка меняется по актуальному состоянию в цикле -->
    <Button v-if="canToggleCycle" :icon="excluded ? 'pi pi-user-plus' : 'pi pi-ban'"
            size="small" text outlined rounded
            :severity="excluded ? 'success' : 'danger'"
            v-tooltip.top="excluded ? 'Вернуть в цикл' : 'Исключить из цикла'"
            @click.stop="$emit('toggle-cycle')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'

const props = defineProps<{
  excluded: boolean
  canToggleCycle: boolean
  canBroadcast: boolean
  canSend: boolean
  sendWindow: boolean
  stageLabel?: string
}>()

defineEmits<{ (e: 'profile'): void; (e: 'peers'): void; (e: 'notify'): void
  (e: 'send'): void; (e: 'toggle-cycle'): void }>()

const sendTooltip = computed(() =>
  props.sendWindow ? 'Отправить задания на оценку этому сотруднику'
    : `Окно стадий закрыто (${props.stageLabel || '—'})`)
</script>

<style scoped>
.row-actions { display: flex; gap: 6px; align-items: center; }
</style>
