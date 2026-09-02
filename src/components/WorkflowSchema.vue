<template>
  <div class="wf-schema">
    <svg :viewBox="`0 0 ${W} ${H}`" class="wf-svg" role="img"
         aria-label="Схема стадий цикла перф-ревью">
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
        <marker id="wf-arrow-dim" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
        </marker>
      </defs>

      <!-- линейная цепочка: два ряда -->
      <g v-for="e in edges" :key="e.key">
        <path :d="e.path" fill="none" :stroke="e.dim ? '#cbd5e1' : '#64748b'"
              :stroke-width="e.dim ? 1.2 : 1.6" :stroke-dasharray="e.dim ? '4 3' : undefined"
              :marker-end="`url(#${e.dim ? 'wf-arrow-dim' : 'wf-arrow'})`" />
        <text v-if="e.label" :x="e.lx" :y="e.ly" class="wf-edge-label" text-anchor="middle">
          {{ e.label }}
        </text>
        <text v-if="e.gate" :x="e.lx" :y="e.ly + 11" class="wf-gate-label"
              :class="{ 'wf-gate-on': e.gateOn }" text-anchor="middle">
          ⟦{{ e.gate }}{{ e.gateOn ? '' : ' · выкл' }}⟧
        </text>
      </g>

      <!-- cancel-шина: любая активная стадия → отменён (пунктир) -->
      <path :d="`M ${W / 2} ${ROW1 + NODE_H / 2 + 6} V ${CANC_Y - 16}`" fill="none"
            stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow)" />
      <text :x="W / 2 + 8" :y="ROW1 + NODE_H / 2 + 40" class="wf-edge-label wf-cancel-label">
        cancel — из любой активной стадии
      </text>
      <!-- reopen: отменён → подготовка (дуга по левому краю) -->
      <path :d="`M ${W * 0.5 - 60} ${CANC_Y - 6} C 40 ${CANC_Y - 40}, 24 ${ROW1 + 30}, 70 ${ROW1 + 10}`"
            fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow)" />
      <text x="30" :y="CANC_Y - 70" class="wf-edge-label wf-cancel-label" transform="rotate(-90 30 300)">
        reopen — вернуть в подготовку
      </text>

      <!-- узлы -->
      <g v-for="n in nodes" :key="n.name" class="wf-node" :class="{ current: n.name === current }">
        <rect :x="n.x - NODE_W / 2" :y="n.y - NODE_H / 2" :width="NODE_W" :height="NODE_H"
              rx="18" :class="n.kind" />
        <text :x="n.x" :y="n.y + 4" text-anchor="middle" class="wf-node-label">{{ n.label }}</text>
        <!-- info-кнопка: описание стадии -->
        <g class="wf-info" @click.stop="toggle($event, n.name)">
          <circle :cx="n.x + NODE_W / 2 - 13" :cy="n.y - NODE_H / 2 + 13" r="9" />
          <text :x="n.x + NODE_W / 2 - 13" :y="n.y - NODE_H / 2 + 16.5" text-anchor="middle"
                class="wf-info-i">i</text>
        </g>
      </g>
    </svg>

    <!-- попап описания стадии: что происходит, кто что делает, условия выхода -->
    <Popover ref="op" append-to="body" style="max-width: 460px">
      <div v-if="active" class="wf-pop">
        <div class="wf-pop-head">
          <b>{{ active.label }}</b>
          <Tag v-if="active.name === current" value="текущая" severity="info" />
        </div>
        <p class="wf-pop-desc">{{ active.description }}</p>
        <div v-for="t in transitionsFrom(active.name)" :key="t.name" class="wf-pop-tr">
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
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Popover from 'primevue/popover'
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
const ROW1 = 60
const ROW2 = 200
const CANC_Y = 320
const H = 370

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

const nodes = computed(() =>
  LAYOUT.map((l) => ({ ...l, label: labelOf(l.name) })))

const labelOf = (name: string): string =>
  places.value.find((p) => p.name === name)?.label || name

// рёбра линейной цепочки с подписями переходов и гейтов
const edges = computed(() => {
  const out: { key: string; path: string; label?: string; gate?: string
    gateOn?: boolean; lx: number; ly: number; dim?: boolean }[] = []
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
    let path: string
    if (a.y === b.y) {
      const dir = a.x < b.x ? 1 : -1
      path = `M ${a.x + dir * NODE_W / 2} ${a.y} H ${b.x - dir * (NODE_W / 2 + 4)}`
    } else {
      // leader-assessment → calibration: вниз
      path = `M ${a.x} ${a.y + NODE_H / 2} V ${b.y - NODE_H / 2 - 4}`
    }
    const midX = a.y === b.y ? (a.x + b.x) / 2 : a.x + 20
    const midY = a.y === b.y ? a.y - 14 : (a.y + b.y) / 2
    out.push({
      key: `${from}-${to}`, path,
      label: tr?.label, gate: tr?.gate_label || undefined,
      gateOn: tr?.gate_enabled ?? false, lx: midX, ly: midY,
      dim: tr?.gate_enabled === false,
    })
  }
  return out
})

function transitionsFrom(place: string): Transition[] {
  return transitions.value.filter((t) => t.from.includes(place))
}

const op = ref()
const activeName = ref('')
const active = computed(() => places.value.find((p) => p.name === activeName.value))

function toggle(ev: Event, name: string) {
  activeName.value = name
  op.value.toggle(ev)
}

reviewsApi.workflowSchema().then((s) => {
  places.value = s.places
  transitions.value = s.transitions
}).catch(() => undefined)
</script>

<style scoped>
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
.wf-pop { display: flex; flex-direction: column; gap: 8px; }
.wf-pop-head { display: flex; align-items: center; gap: 8px; }
.wf-pop-desc { margin: 0; font-size: 0.85rem; white-space: pre-wrap; }
.wf-pop-tr { display: flex; gap: 8px; font-size: 0.84rem; align-items: flex-start; }
.wf-pop-tr > i { color: #2563eb; margin-top: 3px; }
.gate-on { color: #b45309; }
.gate-off { color: #64748b; }
.small { font-size: 0.78rem; }
</style>
