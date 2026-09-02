<template>
  <div ref="hostEl" class="wf-schema">
    <svg :viewBox="`0 0 ${W} ${H}`" class="wf-svg" role="img"
         aria-label="Схема стадий цикла перф-ревью">
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>

      <!-- линейная цепочка: подписи с переносом строк и белой обводкой -->
      <g v-for="e in edges" :key="e.key">
        <path :d="e.path" fill="none" :stroke="e.dim ? '#cbd5e1' : '#64748b'"
              :stroke-width="e.dim ? 1.2 : 1.6" :stroke-dasharray="e.dim ? '4 3' : undefined"
              marker-end="url(#wf-arrow)" />
        <g v-if="e.label">
          <text v-for="(line, i) in wrap(e.label)" :key="i"
                :x="e.vertical ? e.lx + 6 : e.lx" :y="e.ly + i * 12"
                :text-anchor="e.vertical ? 'start' : 'middle'"
                class="wf-edge-label wf-halo">{{ line }}</text>
          <text v-if="e.gate" :x="e.vertical ? e.lx + 6 : e.lx"
                :y="e.ly + wrap(e.label).length * 12 + 2"
                :text-anchor="e.vertical ? 'start' : 'middle'" class="wf-gate-label wf-halo"
                :class="{ 'wf-gate-on': e.gateOn }">
            ⟦{{ e.gate }}{{ e.gateOn ? '' : ' · выкл' }}⟧
          </text>
        </g>
      </g>

      <!-- cancel-шина: любая активная стадия → отменён (пунктир) -->
      <path :d="`M ${W / 2} ${ROW1 + NODE_H / 2 + 6} V ${CANC_Y - 16}`" fill="none"
            stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow)" />
      <text :x="W / 2 - 6" :y="ROW1 + NODE_H / 2 + 34"
            class="wf-edge-label wf-cancel-label wf-halo" text-anchor="end">
        <tspan v-for="(line, i) in wrap('cancel — из любой активной стадии', 24)" :key="i"
               :x="W / 2 - 6" :dy="i === 0 ? 0 : 12">{{ line }}</tspan>
      </text>
      <!-- reopen: отменён → подготовка (дуга по левому краю) -->
      <path :d="`M ${W * 0.5 - 60} ${CANC_Y - 6} C 40 ${CANC_Y - 40}, 24 ${ROW1 + 30}, 70 ${ROW1 + 10}`"
            fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow)" />
      <text :x="28" :y="CANC_Y - 60" class="wf-edge-label wf-cancel-label wf-halo"
            transform="rotate(-90 28 300)">
        reopen — вернуть в подготовку
      </text>

      <!-- узлы -->
      <g v-for="n in nodes" :key="n.name" class="wf-node" :class="{ current: n.name === current }">
        <rect :x="n.x - NODE_W / 2" :y="n.y - NODE_H / 2" :width="NODE_W" :height="NODE_H"
              rx="18" :class="n.kind" />
        <text :x="n.x" :y="n.y + 4" text-anchor="middle" class="wf-node-label">{{ n.label }}</text>
        <!-- info-кнопка: собственный поповер позиционируется точно к значку -->
        <g class="wf-info" @click.stop="openInfo($event, n)">
          <circle :cx="n.x + NODE_W / 2 - 13" :cy="n.y - NODE_H / 2 + 13" r="9" />
          <text :x="n.x + NODE_W / 2 - 13" :y="n.y - NODE_H / 2 + 16.5" text-anchor="middle"
                class="wf-info-i">i</text>
        </g>
      </g>
    </svg>

    <!-- поповер у значка: что происходит, кто что делает, условия выхода -->
    <div v-if="pop" class="wf-pop" :style="pop.style" @click.stop>
      <button class="wf-pop-x" aria-label="Закрыть" @click="pop = null">×</button>
      <div class="wf-pop-head">
        <b>{{ pop.place.label }}</b>
        <Tag v-if="pop.place.name === current" value="текущая" severity="info" />
      </div>
      <p class="wf-pop-desc">{{ pop.place.description }}</p>
      <div v-for="t in transitionsFrom(pop.place.name)" :key="t.name" class="wf-pop-tr">
        <i class="pi pi-arrow-right" />
        <div>
          <b>{{ t.label }}</b> → {{ labelOf(t.to) }}
          <div class="muted small">{{ t.description }}</div>
          <div v-if="t.gate" class="small" :class="t.gate_enabled ? 'gate-on' : 'gate-off'">
            гейт «{{ t.gate_label }}»: {{ t.gate_enabled ? 'включён' : 'выключен' }}
            <span class="muted">(настраивается в «Валидаторах переходов»)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Tag from 'primevue/tag'
import { reviewsApi } from '../api/endpoints'

defineProps<{ current?: string }>()

type Place = { name: string; label: string; description: string }
type Transition = {
  name: string; from: string[]; to: string; label: string; permission: string
  description: string; gate: string | null; gate_label: string | null
  gate_enabled: boolean | null
}

const places = ref<Place[]>([])
const transitions = ref<Transition[]>([])

const W = 1000
const NODE_W = 150
const NODE_H = 44
const ROW1 = 64
const ROW2 = 210
const CANC_Y = 330
const H = 380

// раскладка: два ряда линейной цепочки + отменён под центром
const LAYOUT: { name: string; x: number; y: number; kind?: string }[] = [
  { name: 'preparation', x: 120, y: ROW1 },
  { name: 'self-review', x: 373, y: ROW1 },
  { name: 'peer-review', x: 626, y: ROW1 },
  { name: 'leader-assessment', x: 879, y: ROW1 },
  { name: 'calibration', x: 879, y: ROW2 },
  { name: 'decision', x: 626, y: ROW2 },
  { name: 'closed', x: 373, y: ROW2, kind: 'final' },
  { name: 'cancelled', x: W / 2, y: CANC_Y, kind: 'cancelled' },
]

const nodes = computed(() => LAYOUT.map((l) => ({ ...l, label: labelOf(l.name) })))

const labelOf = (name: string): string =>
  places.value.find((p) => p.name === name)?.label || name

/** Перенос подписи по словам: строки не длиннее maxChars (по умолчанию 16). */
function wrap(text: string, maxChars = 16): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur)
      cur = w
    } else {
      cur = cur ? `${cur} ${w}` : w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// рёбра цепочки: подписи над стрелками с переносом; вертикальное — справа от линии
const edges = computed(() => {
  const out: {
    key: string; path: string; label?: string; gate?: string; gateOn?: boolean
    lx: number; ly: number; vertical?: boolean; dim?: boolean
  }[] = []
  const chain: [string, string][] = [
    ['preparation', 'self-review'], ['self-review', 'peer-review'],
    ['peer-review', 'leader-assessment'], ['leader-assessment', 'calibration'],
    ['calibration', 'decision'], ['decision', 'closed'],
  ]
  for (const [from, to] of chain) {
    const a = LAYOUT.find((l) => l.name === from)!
    const b = LAYOUT.find((l) => l.name === to)!
    const tr = transitions.value.find((t) => t.from.includes(from) && t.to === to
      && !['cancel', 'reopen'].includes(t.name))
    const vertical = a.y !== b.y
    let path: string
    if (!vertical) {
      const dir = a.x < b.x ? 1 : -1
      path = `M ${a.x + dir * NODE_W / 2} ${a.y} H ${b.x - dir * (NODE_W / 2 + 4)}`
    } else {
      path = `M ${a.x} ${a.y + NODE_H / 2} V ${b.y - NODE_H / 2 - 4}`
    }
    const lines = wrap(tr?.label || '')
    out.push({
      key: `${from}-${to}`, path, label: tr?.label, gate: tr?.gate_label || undefined,
      gateOn: tr?.gate_enabled ?? false,
      lx: vertical ? a.x : (a.x + b.x) / 2,
      // первая строка подписи — выше линии с учётом переноса строк
      ly: vertical ? (a.y + b.y) / 2 - ((lines.length - 1) * 12) / 2
        : a.y - 10 - (lines.length - 1) * 12,
      vertical, dim: tr?.gate_enabled === false,
    })
  }
  return out
})

function transitionsFrom(place: string): Transition[] {
  return transitions.value.filter((t) => t.from.includes(place))
}

// --- собственный поповер: позиция считается от значка i, не «в потолок» ---
const hostEl = ref<HTMLElement | null>(null)
const pop = ref<{ place: Place; style: Record<string, string> } | null>(null)

function closeOnOutside() { pop.value = null }

function openInfo(ev: Event, node: { name: string; x: number; y: number }) {
  const place = places.value.find((p) => p.name === node.name)
  if (!place || !hostEl.value) return
  const svg = (ev.currentTarget as Element).closest('svg')
  if (!svg) return
  // координаты значка (правый верх узла) в пикселях контейнера
  const rect = svg.getBoundingClientRect()
  const host = hostEl.value.getBoundingClientRect()
  const scale = rect.width / W
  const iconX = (node.x + NODE_W / 2 - 13) * scale + (rect.left - host.left)
  const iconY = (node.y - NODE_H / 2 + 13) * scale + (rect.top - host.top)
  const POP_W = 400
  // правые узлы — поповер слева от значка, остальные — справа; по вертикали — у значка
  const left = node.x > W * 0.6
    ? Math.max(8, iconX - POP_W - 14)
    : Math.min(host.width - POP_W - 8, iconX + 14)
  const top = Math.max(4, Math.min(host.height - 220, iconY - 40))
  pop.value = { place, style: { left: `${left}px`, top: `${top}px`, width: `${POP_W}px` } }
}

onMounted(() => window.addEventListener('click', closeOnOutside))
onBeforeUnmount(() => window.removeEventListener('click', closeOnOutside))

reviewsApi.workflowSchema().then((s) => {
  places.value = s.places
  transitions.value = s.transitions
}).catch(() => undefined)
</script>

<style scoped>
.wf-schema { position: relative; }
.wf-svg { width: 100%; height: auto; }
.wf-node rect { fill: #eff6ff; stroke: #3b82f6; stroke-width: 1.5; }
.wf-node rect.final { fill: #f0fdf4; stroke: #16a34a; }
.wf-node rect.cancelled { fill: #fffbeb; stroke: #f59e0b; }
.wf-node.current rect { stroke: #1d4ed8; stroke-width: 3; }
.wf-node-label { font-size: 12.5px; fill: #1e293b; font-weight: 600; }
.wf-info { cursor: pointer; }
.wf-info circle { fill: #e2e8f0; stroke: #94a3b8; stroke-width: 1; }
.wf-info:hover circle { fill: #cbd5e1; }
.wf-info-i { font-size: 11px; font-weight: 700; fill: #334155; font-family: Georgia, serif; font-style: italic; }
.wf-edge-label { font-size: 10.5px; fill: #475569; }
.wf-gate-label { font-size: 9.5px; fill: #94a3b8; }
.wf-gate-label.wf-gate-on { fill: #b45309; font-weight: 600; }
.wf-cancel-label { fill: #b45309; }
/* белая обводка текста: подписи читаются и поверх линий/узлов */
.wf-halo { paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round; }
/* поповер у значка */
.wf-pop {
  position: absolute; z-index: 20; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 10px; box-shadow: 0 8px 24px rgba(15, 23, 42, .16);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
}
.wf-pop-x {
  position: absolute; top: 6px; right: 8px; border: none; background: none;
  font-size: 18px; line-height: 1; color: #94a3b8; cursor: pointer;
}
.wf-pop-x:hover { color: #475569; }
.wf-pop-head { display: flex; align-items: center; gap: 8px; padding-right: 20px; }
.wf-pop-desc { margin: 0; font-size: 0.85rem; white-space: pre-wrap; }
.wf-pop-tr { display: flex; gap: 8px; font-size: 0.84rem; align-items: flex-start; }
.wf-pop-tr > i { color: #2563eb; margin-top: 3px; }
.gate-on { color: #b45309; }
.gate-off { color: #64748b; }
.small { font-size: 0.78rem; }
</style>
