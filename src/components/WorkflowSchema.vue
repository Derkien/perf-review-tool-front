<template>
  <div ref="hostEl" class="wf-schema">
    <svg :viewBox="`0 0 ${W} ${H}`" class="wf-svg" role="img"
         aria-label="Схема стадий цикла перф-ревью">
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
        <marker id="wf-arrow-cancel" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
      </defs>

      <!-- линейная цепочка: подписи с переносом; о переходе — info-значок -->
      <g v-for="e in edges" :key="e.key">
        <path :d="e.path" fill="none" :stroke="e.dim ? '#cbd5e1' : '#64748b'"
              :stroke-width="e.dim ? 1.2 : 1.6" :stroke-dasharray="e.dim ? '4 3' : undefined"
              marker-end="url(#wf-arrow)" />
        <g v-if="e.label">
          <text v-for="(line, i) in e.lines" :key="i"
                :x="e.vertical ? e.lx + 8 : e.lx" :y="e.ly + i * 12"
                :text-anchor="e.vertical ? 'start' : 'middle'"
                class="wf-edge-label wf-halo">{{ line }}</text>
          <!-- info о переходе: описание и гейт — в попапе, схему не перегружаем -->
          <g class="wf-info" @click.stop="openTransition($event, e)">
            <circle :cx="e.infoX" :cy="e.ly + (e.lines.length - 1) * 12 - 3" r="7" />
            <text :x="e.infoX" :y="e.ly + (e.lines.length - 1) * 12"
                  text-anchor="middle" class="wf-info-i">i</text>
          </g>
        </g>
      </g>

      <!-- cancel: в правый бок «отменён» (справа больше места) -->
      <path :d="`M ${R_NODE_X + NODE_W / 2} ${ROW1 + 6} H ${W - 26} V ${CANC_Y} H ${R_NODE_X + NODE_W / 2 + 6}`"
            fill="none" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow-cancel)" />
      <text :x="W - 20" :y="ROW1 + 90" class="wf-edge-label wf-cancel-label wf-halo"
            transform="rotate(90 980 154)">cancel — из любой активной стадии</text>

      <!-- reopen: отменён → подготовка по нижней дуге -->
      <path :d="`M ${R_NODE_X - NODE_W / 2} ${CANC_Y} C 520 ${CANC_Y + 46}, 240 ${CANC_Y + 46}, 132 ${ROW1 + NODE_H / 2 + 12}`"
            fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4"
            marker-end="url(#wf-arrow-cancel)" />
      <text x="470" :y="CANC_Y + 44" class="wf-edge-label wf-cancel-label wf-halo"
            text-anchor="middle">reopen — вернуть в подготовку</text>

      <!-- узлы: названия с переносом строк -->
      <g v-for="n in nodes" :key="n.name" class="wf-node" :class="{ current: n.name === current }">
        <rect :x="n.x - NODE_W / 2" :y="n.y - NODE_H / 2" :width="NODE_W" :height="NODE_H"
              rx="20" :class="n.kind" />
        <text v-for="(line, i) in n.lines" :key="i" :x="n.x"
              :y="n.y - (n.lines.length - 1) * 7 + i * 14 + 4" text-anchor="middle"
              class="wf-node-label">{{ line }}</text>
        <!-- info о стадии -->
        <g class="wf-info" @click.stop="openInfo($event, n)">
          <circle :cx="n.x + NODE_W / 2 - 13" :cy="n.y - NODE_H / 2 + 13" r="9" />
          <text :x="n.x + NODE_W / 2 - 13" :y="n.y - NODE_H / 2 + 16.5" text-anchor="middle"
                class="wf-info-i">i</text>
        </g>
      </g>
    </svg>

    <!-- поповер у значка -->
    <div v-if="pop" class="wf-pop" :style="pop.style" @click.stop>
      <button class="wf-pop-x" aria-label="Закрыть" @click="pop = null">×</button>

      <!-- стадия -->
      <template v-if="pop.kind === 'place' && pop.place">
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
      </template>

      <!-- переход -->
      <template v-else-if="pop.transition">
        <div class="wf-pop-head">
          <b>{{ pop.transition.label }}</b>
          <Tag :value="pop.transition.gate_enabled ? 'гейт включён' : 'без гейта'"
               :severity="pop.transition.gate_enabled ? 'warn' : 'secondary'" />
        </div>
        <p class="wf-pop-desc muted">
          {{ labelOf(pop.transition.from[0]) }} → {{ labelOf(pop.transition.to) }}
        </p>
        <p class="wf-pop-desc">{{ pop.transition.description }}</p>
        <div v-if="pop.transition.gate" class="small"
             :class="pop.transition.gate_enabled ? 'gate-on' : 'gate-off'">
          Гейт «{{ pop.transition.gate_label }}»
          {{ pop.transition.gate_enabled
            ? 'включён: переход заблокирован, пока условие не выполнено'
            : 'выключен: условие не проверяется' }}
          <span class="muted">(настраивается в «Валидаторах переходов» ниже)</span>
        </div>
      </template>
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
const NODE_H = 50
const ROW1 = 66
const ROW2 = 216
const CANC_Y = 332
const H = 400
const R_NODE_X = 879 // правая колонка (leader-assessment / calibration / отменён)

// раскладка: два ряда линейной цепочки; «отменён» — справа под правой колонкой
const LAYOUT: { name: string; x: number; y: number; kind?: string }[] = [
  { name: 'preparation', x: 120, y: ROW1 },
  { name: 'self-review', x: 373, y: ROW1 },
  { name: 'peer-review', x: 626, y: ROW1 },
  { name: 'leader-assessment', x: R_NODE_X, y: ROW1 },
  { name: 'calibration', x: R_NODE_X, y: ROW2 },
  { name: 'decision', x: 626, y: ROW2 },
  { name: 'closed', x: 373, y: ROW2, kind: 'final' },
  { name: 'cancelled', x: R_NODE_X, y: CANC_Y, kind: 'cancelled' },
]

/** Перенос по словам: строки не длиннее maxChars. */
function wrapText(text: string, maxChars: number): string[] {
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

const labelOf = (name: string): string =>
  places.value.find((p) => p.name === name)?.label || name

// узлы с разбитыми на строки названиями (влезают в овал)
const nodes = computed(() => LAYOUT.map((l) => ({
  ...l,
  lines: wrapText(labelOf(l.name), 14),
})))

// рёбра цепочки: подпись с переносом + info-значок о переходе (гейты — в попапе)
const edges = computed(() => {
  const out: {
    key: string; path: string; label?: string; lines: string[]
    lx: number; ly: number; infoX: number; vertical?: boolean; dim?: boolean
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
    const lines = wrapText(tr?.label || '', 16)
    const lx = vertical ? a.x : (a.x + b.x) / 2
    const ly = vertical ? (a.y + b.y) / 2 - ((lines.length - 1) * 12) / 2
      : a.y - 10 - (lines.length - 1) * 12
    // info-значок — под последней строкой подписи, по центру
    out.push({
      key: `${from}-${to}`, path, label: tr?.label, lines, lx, ly,
      infoX: lx + (vertical ? 60 : 0),
      vertical, dim: tr?.gate_enabled === false,
    })
  }
  return out
})

function transitionsFrom(place: string): Transition[] {
  return transitions.value.filter((t) => t.from.includes(place))
}

// --- поповер: позиция точно у значка (координаты схемы → пиксели контейнера) ---
type PopState = {
  kind: 'place' | 'transition'
  style: Record<string, string>
  place?: Place
  transition?: Transition
}
const hostEl = ref<HTMLElement | null>(null)
const pop = ref<PopState | null>(null)

function closeOnOutside() { pop.value = null }

function placePop(ev: Event, svgX: number, svgY: number, body: Omit<PopState, 'style'>) {
  if (!hostEl.value) return
  const svg = (ev.currentTarget as Element).closest('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const host = hostEl.value.getBoundingClientRect()
  const scale = rect.width / W
  const px = svgX * scale + (rect.left - host.left)
  const py = svgY * scale + (rect.top - host.top)
  const POP_W = 400
  const left = svgX > W * 0.6
    ? Math.max(8, px - POP_W - 14)
    : Math.min(host.width - POP_W - 8, px + 14)
  const top = Math.max(4, Math.min(host.height - 240, py - 40))
  pop.value = { ...body, style: { left: `${left}px`, top: `${top}px`, width: `${POP_W}px` } }
}

function openInfo(ev: Event, n: { name: string; x: number; y: number }) {
  const place = places.value.find((p) => p.name === n.name)
  if (!place) return
  placePop(ev, n.x + NODE_W / 2 - 13, n.y - NODE_H / 2 + 13,
           { kind: 'place', place })
}

function openTransition(
  ev: Event,
  e: { key: string; lx: number; ly: number; lines: string[]; vertical?: boolean },
) {
  const [from, to] = e.key.split('-')
  const tr = transitions.value.find((t) => t.from.includes(from) && t.to === to
    && !['cancel', 'reopen'].includes(t.name))
  if (!tr) return
  placePop(ev, e.lx + (e.vertical ? 60 : 0), e.ly + (e.lines.length - 1) * 12 - 3,
           { kind: 'transition', transition: tr })
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
.wf-node-label { font-size: 12px; fill: #1e293b; font-weight: 600; }
.wf-info { cursor: pointer; }
.wf-info circle { fill: #e2e8f0; stroke: #94a3b8; stroke-width: 1; }
.wf-info:hover circle { fill: #cbd5e1; }
.wf-info-i { font-size: 10px; font-weight: 700; fill: #334155; font-family: Georgia, serif; font-style: italic; }
.wf-edge-label { font-size: 10.5px; fill: #475569; }
.wf-cancel-label { fill: #b45309; }
/* белая обводка текста: читается поверх линий и узлов */
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
.wf-pop-head { display: flex; align-items: center; gap: 8px; padding-right: 20px; flex-wrap: wrap; }
.wf-pop-desc { margin: 0; font-size: 0.85rem; white-space: pre-wrap; }
.wf-pop-tr { display: flex; gap: 8px; font-size: 0.84rem; align-items: flex-start; }
.wf-pop-tr > i { color: #2563eb; margin-top: 3px; }
.gate-on { color: #b45309; }
.gate-off { color: #64748b; }
.small { font-size: 0.78rem; }
</style>
