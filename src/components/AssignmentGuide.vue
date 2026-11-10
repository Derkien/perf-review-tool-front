<template>
  <div class="guide" data-testid="assignment-guide">
    <button class="guide-head" type="button" @click="open = !open">
      <i class="pi pi-info-circle" />
      <span>Как это работает: задания</span>
      <i :class="open ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="chev" />
    </button>
    <div v-if="open" class="guide-body">
      <div class="steps">
        <div v-for="(s, i) in steps" :key="i" class="step">
          <div class="step-dot">{{ i + 1 }}</div>
          <div class="step-text"><b>{{ s.title }}</b><div class="muted small">{{ s.text }}</div></div>
        </div>
      </div>
      <div class="branches">
        <div v-for="b in branches" :key="b.title" class="branch">
          <i :class="b.icon" /> <b>{{ b.title }}</b>
          <div class="muted small">{{ b.text }}</div>
        </div>
      </div>
      <div class="types">
        <div class="muted small">Типы заданий:</div>
        <div v-for="t in types" :key="t.name" class="type">
          <Tag :value="t.name" severity="info" /> <span class="small">{{ t.desc }}</span>
        </div>
        <div class="type"><Tag value="Обратная связь" severity="secondary" />
          <span class="small muted">скоро — сущности в системе пока нет</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Tag from 'primevue/tag'

const open = ref(false)

const steps = [
  { title: 'Появляется', text: 'система сама ставит задание: запуск переоценки, старт стадии ревью или назначение пиров' },
  { title: 'Уведомляет', text: 'вам приходит уведомление со ссылкой — клик ведёт прямо в этот раздел' },
  { title: 'Заполняется', text: 'задание выполняется там, где живут данные: карточка, разметка, оценка коллеги' },
  { title: 'Закрывается само', text: 'как только заполнено полностью — задание исчезает из очереди, счётчик уменьшается' },
]
const branches = [
  { icon: 'pi pi-bell', title: 'Напоминания', text: 'о незаполненных заданиях — раз в день, не бесконечно: после потолка напоминаний уходит эскалация руководителю' },
  { icon: 'pi pi-clock', title: 'Просрочено', text: 'задание с истёкшим сроком помечается «просрочено» — оно всё ещё можно и нужно заполнить' },
  { icon: 'pi pi-ban', title: 'Отмена', text: 'оператор может отменить задание (например, сотрудник ушёл) — оно исчезает из очереди' },
]
const types = [
  { name: 'Самооценка', desc: 'разметить свои компетенции по активной схеме' },
  { name: 'Оценка подчинённых', desc: 'руководитель размечает компетенции своей команды' },
  { name: 'Селф-ревью', desc: 'заполнить карточку достижений цикла' },
  { name: 'Оценка коллеги', desc: 'буквы A–E по достижениям и отзыв' },
]
</script>

<style scoped>
.guide { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 14px; background: #f8fafc; }
.guide-head { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: center;
  padding: 10px 14px; font-weight: 600; width: 100%; box-sizing: border-box; }
.guide-head .chev { margin-left: auto; }
.guide-body { padding: 0 14px 14px; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-bottom: 10px; }
.step { display: flex; gap: 8px; align-items: flex-start; }
.step-dot { flex: none; width: 22px; height: 22px; border-radius: 50%;
  background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: .8rem; font-weight: 700; }
.branches { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 10px; }
.branch { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px 10px; }
.types { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
.type { display: flex; gap: 6px; align-items: center; }
.small { font-size: .82rem; }
</style>
