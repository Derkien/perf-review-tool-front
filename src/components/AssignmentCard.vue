<template>
  <div class="card" data-testid="assignment-card">
    <div class="row">
      <i :class="icon" />
      <div class="title">
        <b>{{ title }}</b>
        <div v-if="assignment.due_date" class="muted small">
          срок: {{ assignment.due_date }}
        </div>
      </div>
      <Tag v-if="assignment.overdue" value="просрочено" severity="danger" />
      <Button label="Заполнить" size="small" text @click="$emit('open')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import type { AssignmentDto } from '../api/endpoints'

defineProps<{ assignment: AssignmentDto; title: string; icon: string }>()
defineEmits<{ (e: 'open'): void }>()
</script>

<style scoped>
.card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fff; }
.row { display: flex; gap: 10px; align-items: center; }
.title { flex: 1; }
</style>
