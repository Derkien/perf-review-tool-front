<template>
  <div>
    <div v-for="(a, i) in model" :key="i" class="ach">
      <div class="ach-head">
        <b>Достижение {{ i + 1 }}</b>
        <Button icon="pi pi-trash" text severity="danger" size="small"
                :disabled="locked" @click="model.splice(i, 1)" />
      </div>
      <Textarea v-model="a.text" :rows="3" class="w100" :maxlength="limits.self_max_chars"
                placeholder="Что сделал? Какой результат? Какую пользу принесло бизнесу?" />
      <div class="counter" :class="{ over: a.text.length > limits.self_max_chars }">
        {{ a.text.length }} / {{ limits.self_max_chars }}
      </div>
      <div class="self-rating">
        <span class="muted">Самооценка:</span>
        <Dropdown :model-value="a.self_rating" :options="ratingOptions" option-label="label"
                  option-value="value" filter placeholder="выберите оценку" class="rating-select"
                  :disabled="locked" @update:model-value="a.self_rating = $event" />
      </div>
    </div>
    <Button label="+ Добавить достижение" text size="small" class="add-btn"
            :disabled="locked || model.length >= limits.self_max_ach"
            @click="model.push({ text: '', self_rating: null })" />
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import Textarea from 'primevue/textarea'

const model = defineModel<any[]>({ required: true })
defineProps<{ limits: any; locked?: boolean }>()

const ratingOptions = [
  { label: 'A — Превосходит ожидания', value: 'A' },
  { label: 'B — Выше ожиданий', value: 'B' },
  { label: 'C — Соответствует ожиданиям', value: 'C' },
  { label: 'D — Ниже ожиданий', value: 'D' },
  { label: 'E — Не соответствует ожиданиям', value: 'E' },
]
</script>

<style scoped>
.ach { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.ach-head { display: flex; justify-content: space-between; align-items: center; }
.w100 { width: 100%; box-sizing: border-box; }
.counter { text-align: right; font-size: 0.75rem; color: #64748b; margin-top: 2px; }
.counter.over { color: #dc2626; font-weight: 700; }
.self-rating { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.rating-select { min-width: 280px; }
.add-btn { margin-top: 4px; }
</style>
