<template>
  <!-- контекстное меню: кнопки только применимые к состоянию задания (правило fixes9) -->
  <span class="row-actions" v-tooltip.top="!isOpen ? 'задание закрыто/отменено — действий нет' : undefined">
    <template v-if="isOpen">
      <Button icon="pi pi-ban" text rounded size="small" severity="danger" aria-label="Отменить"
      v-tooltip.top="'Отменить задание'"
              data-testid="row-cancel" @click="$emit('cancel')" />
      <Button icon="pi pi-bell" text rounded size="small" severity="info" aria-label="Напомнить"
      v-tooltip.top="'Отправить напоминание'"
              data-testid="row-remind" @click="$emit('remind')" />
      <!-- принудительное закрытие — только компетенционные виды, по каждой неполной схеме -->
      <Button v-for="m in incompleteMatrices" :key="m.matrix_id"
              icon="pi pi-lock" text rounded size="small" severity="warn"
              :aria-label="`Принудительно закрыть ${m.type_code}`"
              v-tooltip.top="`Закрыть принудительно: ${m.type_code} — непокрытое по норме грейда`"
              data-testid="row-force-close" @click="$emit('force-close', m)" />
    </template>
    <span v-else class="muted small">—</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import type { AssignmentDto, AssignmentProgressMatrix } from '../api/endpoints'

const props = defineProps<{ assignment: AssignmentDto }>()
defineEmits<{ (e: 'cancel'): void; (e: 'remind'): void
             (e: 'force-close', matrix: AssignmentProgressMatrix): void }>()

const isOpen = computed(() => ['pending', 'notified'].includes(props.assignment.status))
const incompleteMatrices = computed(() =>
  (props.assignment.progress?.matrices || []).filter((m) => !m.complete))
</script>
