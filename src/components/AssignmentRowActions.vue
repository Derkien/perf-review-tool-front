<template>
  <!-- контекстное меню: кнопки только применимые к состоянию задания (правило fixes9) -->
  <span class="row-actions" v-tooltip.top="!isOpen ? 'задание закрыто/отменено — действий нет' : undefined">
    <template v-if="isOpen">
      <Button label="Отменить" size="small" severity="danger" text
              data-testid="row-cancel" @click="$emit('cancel')" />
      <Button label="Напомнить" size="small" severity="info" text
              data-testid="row-remind" @click="$emit('remind')" />
      <!-- принудительное закрытие — только компетенционные виды, по каждой неполной схеме -->
      <Button v-for="m in incompleteMatrices" :key="m.matrix_id"
              :label="`Принудительно (${m.kind})`" size="small" severity="warn" text
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
