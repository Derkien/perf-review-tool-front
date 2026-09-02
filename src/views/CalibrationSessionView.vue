<template>
  <div class="page" v-if="session">
    <AppBreadcrumbs :items="[{ label: 'Калибровки', to: '/calibration' }, { label: session.title }]" />
    <div class="head">
      <h1 style="margin:0">{{ session.title }}</h1>
      <Tag :value="({ voting: 'голосование', finalizing: 'финализация', closed: 'закрыта' } as Record<string,string>)[session.status] || session.status" />
      <div style="flex:1"></div>
      <Dropdown v-if="isHost || auth.can('ROLE_U_CALIBRATION_HOST_ANY')" v-model="newHost" :options="participants" option-label="full_name"
                option-value="id" placeholder="Передать ведущему" size="small" @change="transferHost" />
      <Button v-if="(isHost || auth.can('ROLE_U_CALIBRATION_HOST_ANY')) && session.status === 'voting'" label="Аналитика голосований"
              severity="secondary" size="small" @click="loadAnalytics" />
      <Button v-if="(isHost || auth.can('ROLE_U_CALIBRATION_HOST_ANY')) && session.status === 'voting'" label="Завершить и перенести в решения"
              severity="success" size="small" :loading="busy" @click="closeSession" />
      <Button v-if="(isHost || auth.can('ROLE_U_CALIBRATION_HOST_ANY')) && session.status !== 'closed'" label="Отменить сессию"
              severity="danger" size="small" outlined :loading="busy"
              :disabled="session.status === 'cancelled'" @click="cancelSession" />
    </div>
    <Message v-if="session.status === 'closed'" severity="success" :sticky="true">
      Сессия завершена {{ session.closed_at ? new Date(session.closed_at).toLocaleString('ru') : '' }} —
      {{ session.close_summary || 'результаты перенесены в раздел «Решения»' }}
    </Message>
    <Message v-if="session.status === 'cancelled'" severity="warn" :sticky="true">
      Сессия отменена — результаты не переносятся в решения.
    </Message>
    <Card v-if="analytics" style="margin-bottom: 14px">
      <template #title>Аналитика голосований</template>
      <template #content>
        <DataTable :value="analytics.by_voter" size="small">
          <Column field="voter" header="Голосующий" />
          <Column field="voter_group" header="Направление" />
          <Column field="votes" header="Голосов" />
          <Column field="flips" header="Смен после вскрытия">
            <template #body="{ data: v }">
              <Tag :value="String(v.flips)" :severity="v.flips > 0 ? 'warn' : 'success'" />
            </template>
          </Column>
          <Column field="own_avg" header="Средняя «своим»">
            <template #body="{ data: v }">{{ v.own_avg ?? '—' }}</template>
          </Column>
          <Column field="others_avg" header="Средняя «чужим»">
            <template #body="{ data: v }">{{ v.others_avg ?? '—' }}</template>
          </Column>
          <Column field="bias" header="Перекос">
            <template #body="{ data: v }">
              <Tag v-if="v.bias != null" :value="(v.bias > 0 ? '+' : '') + v.bias"
                   :severity="Math.abs(v.bias) >= 0.8 ? 'danger' : Math.abs(v.bias) >= 0.4 ? 'warn' : 'success'"
                   v-tooltip.top="'Положительный перекос: своим ставит выше, чем чужим'" />
              <span v-else class="muted">—</span>
            </template>
          </Column>
        </DataTable>
        <p class="muted">Перекос ≥ 0.8 — подозрение на занижение «чужим» относительно «своих». Смены после вскрытия видны в аудит-логе и журнале голосов.</p>
      </template>
    </Card>
    <div class="grid">
      <Card>
        <template #title>Очередь (от младших к старшим)</template>
        <template #content>
          <div v-for="it in session.items" :key="it.item_id"
               class="queue-row" :class="{ active: it.item_id === currentItem?.item_id }"
               @click="openPack(it)">
            <span>{{ it.employee }}</span>
            <span class="muted">{{ it.grade }}</span>
            <Tag v-if="it.status === 'final'" :value="it.final_letter + (it.borderline_flag || '')"
                 severity="success" />
            <Tag v-else-if="it.status === 'revealed'" value="вскрыто" severity="warn" />
            <i v-if="it.my_vote" class="pi pi-check-circle" style="color:#16a34a" v-tooltip="'ваш голос'" />
          </div>
        </template>
      </Card>
      <div v-if="pack" class="pack">
        <Card>
          <template #title>{{ pack.employee.full_name }} · {{ pack.employee.grade }}</template>
          <template #subtitle>{{ pack.employee.position }} · {{ pack.employee.team }}</template>
          <template #content>
            <div class="insights">
              <div class="ins-card">
                <h2>Рекомендация системы</h2>
                <div class="big-letter" :style="{ color: letterColor(pack.rule_recommendation.letter) }">
                  {{ pack.rule_recommendation.letter }}{{ pack.rule_recommendation.borderline || '' }}
                </div>
                <div v-for="c in pack.rule_recommendation.components" :key="c.name" class="comp">
                  <span>{{ compNames[c.name] || c.name }}</span>
                  <div class="comp-bar"><div v-if="c.value != null" :style="{ width: c.value * 100 + '%' }" /></div>
                  <span class="muted">{{ c.value != null ? Math.round(c.value * 100) + '%' : 'нет' }}</span>
                </div>
              </div>
              <div class="ins-card" v-if="pack.ai_predictions?.length">
                <h2>AI-предсказания</h2>
                <div v-for="(ai, i) in pack.ai_predictions" :key="i">
                  <b :style="{ color: letterColor(ai.letter) }">{{ ai.letter }}</b>
                  <span class="muted"> · {{ ai.provider }}/{{ ai.model }}</span>
                  <p class="muted">{{ ai.rationale }}</p>
                </div>
              </div>
              <div class="ins-card">
                <h2>Пиры</h2>
                <template v-if="pack.peer_stats">
                  <div class="kv"><span>Ответов</span><b>{{ pack.peer_stats.num_of_answers }}/{{ pack.peer_stats.num_of_peers }}</b></div>
                  <div class="kv"><span>Средняя</span>
                    <b :style="{ color: letterColor(pack.peer_stats.avg_rating) }">
                      {{ pack.peer_stats.avg_rating }} ({{ pack.peer_stats.avg_rating_num }})</b></div>
                </template>
                <p v-else class="muted">нет данных</p>
              </div>
              <div class="ins-card">
                <h2>Оценки руклей</h2>
                <div v-for="m in pack.manager_reviews" :key="m.role" class="kv">
                  <span>{{ m.role === 'line-manager' ? 'Линейный' : 'Функциональный' }}</span>
                  <b>{{ m.ratings ? letterOf(m.ratings) : '—' }} {{ m.submitted ? '' : '(черновик)' }}</b>
                </div>
                <p v-if="!pack.manager_reviews?.length" class="muted">нет</p>
              </div>
              <div class="ins-card">
                <h2>Эффективность / светофор</h2>
                <SparkLine v-if="pack.efficiency?.length" :points="pack.efficiency.map((e: any) => ({ label: e.month, value: e.value }))" :height="40" />
                <SparkLine v-if="pack.traffic?.length" color="#f59e0b" :points="pack.traffic.map((e: any) => ({ label: e.month, value: e.value }))" :height="40" />
                <p v-if="!pack.efficiency?.length && !pack.traffic?.length" class="muted">нет данных</p>
              </div>
            </div>
            <h2>Достижения</h2>
            <div v-for="(a, i) in pack.achievements" :key="i" class="ach">
              <b class="muted">#{{ i + 1 }}</b>
              <p>{{ a.text }}</p>
            </div>
            <h2>Радар компетенций</h2>
            <RadarChart v-if="pack.competency_radar?.axis?.length"
                        :axis="pack.competency_radar.axis" :current="pack.competency_radar.current"
                        :prev="pack.competency_radar.prev ?? []" :norm="pack.competency_radar.norm" />
            <p v-else class="muted">нет разметок</p>
          </template>
        </Card>
        <Card style="margin-top: 12px">
          <template #title>Мой голос</template>
          <template #content>
            <div v-if="currentItem?.status === 'pending' && session.status === 'voting'" class="vote-row">
              <SelectButton v-model="myVote" :options="['A','B','C','D','E']" />
              <InputText v-model="myComment" placeholder="Комментарий (опционально)" size="small" />
              <Button label="Проголосовать" :disabled="!myVote" :loading="busy" @click="vote" />
            </div>
            <Message v-else-if="currentItem?.status === 'revealed'">
              <div v-for="v in revealed?.votes" :key="v.voter" class="kv">
                <span>{{ v.voter }}</span><b>{{ v.letter }}</b> <span class="muted">{{ v.comment }}</span>
              </div>
              <div class="revote-row">
                <span class="muted">Передумали после вскрытия?</span>
                <SelectButton v-model="revoteLetter" :options="['A','B','C','D','E']" />
                <InputText v-model="revoteComment" placeholder="Почему меняете решение (обязательно)" size="small" />
                <Button label="Изменить голос" size="small" severity="warn"
                        :disabled="!revoteLetter || !revoteComment.trim()" :loading="busy" @click="revote" />
                <span class="muted">Смена фиксируется: старая оценка сохраняется в истории.</span>
              </div>
            </Message>
            <Message v-else-if="currentItem?.status === 'final'" severity="success">
              Итог: <b>{{ currentItem.final_letter }}{{ currentItem.borderline_flag || '' }}</b>
              — {{ currentItem.comment }}
            </Message>
            <div v-if="(isHost || auth.can('ROLE_U_CALIBRATION_HOST_ANY')) && session.status === 'voting'" style="margin-top: 12px" class="host-actions">
              <template v-if="currentItem?.status === 'pending'">
                <Button label="Вскрыть голоса" severity="warn" :loading="busy" @click="reveal()" />
              </template>
              <template v-if="currentItem?.status !== 'final'">
                <SelectButton v-model="finalLetter" :options="['A','B','C','D','E']" />
                <InputText v-model="finalBorderline" placeholder="Погран. метка: B-, C+…" size="small" />
                <InputText v-model="finalComment" placeholder="Комментарий калибровки" size="small" />
                <Button label="Финализировать" :disabled="!finalLetter" :loading="busy" @click="finalize" />
              </template>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'
import RadarChart from '../components/RadarChart.vue'
import SparkLine from '../components/SparkLine.vue'
import { calibrationApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const auth = useAuth()
const toast = useToast()
const session = ref<any>(null)
const pack = ref<any>(null)
const currentItem = ref<any>(null)
const revealed = ref<any>(null)
const myVote = ref<string | null>(null)
const myComment = ref('')
const finalLetter = ref<string | null>(null)
const finalBorderline = ref('')
const finalComment = ref('')
const newHost = ref<number | null>(null)
const busy = ref(false)
const analytics = ref<any>(null)
const revoteLetter = ref<string | null>(null)
const revoteComment = ref('')
const compNames: Record<string, string> = {
  peers: 'Пиры', line: 'Лин. рукль', functional: 'Функц. рукль',
  matrix: 'Матрица', efficiency: 'Эффективность',
}

const isHost = computed(() => auth.me?.id === session.value?.host_user_id)
const participants = computed(() => {
  const ids = session.value?.participant_ids || []
  return ids.map((id: number) => ({ id, full_name: `Участник #${id}` }))
})

function letterColor(l?: string) {
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[l || ''] || '#334155'
}
function letterOf(ratings: any[]): string {
  if (!ratings?.length) return '—'
  const vals = ratings.map((r) => 'ABCDE'.indexOf(r.letter) + 1)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return avg >= 4.5 ? 'A' : avg >= 3.5 ? 'B' : avg >= 2.5 ? 'C' : avg >= 1.5 ? 'D' : 'E'
}

onMounted(load)
async function load() {
  session.value = await calibrationApi.detail(String(route.params.id))
  const first = session.value.items.find((i: any) => i.status !== 'final')
  if (first) await openPack(first)
}

async function openPack(it: any) {
  currentItem.value = it
  myVote.value = null; myComment.value = ''
  revoteLetter.value = null; revoteComment.value = ''
  finalLetter.value = null; finalBorderline.value = ''; finalComment.value = ''
  revealed.value = null
  pack.value = await calibrationApi.pack(String(route.params.id), it.employee_id)
  if (it.status === 'revealed') await reveal(true)
}

async function vote() {
  busy.value = true
  try {
    await calibrationApi.vote(String(route.params.id),
      { item_id: currentItem.value.item_id, letter: myVote.value as string, comment: myComment.value })
    await load()
    if (currentItem.value) await openPack(currentItem.value)
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) }) }
  finally { busy.value = false }
}

async function reveal(silent = false) {
  revealed.value = await calibrationApi.reveal(String(route.params.id), currentItem.value.item_id)
  if (!silent) await load()
}

async function finalize() {
  busy.value = true
  try {
    await calibrationApi.finalizeItem(String(route.params.id), {
      item_id: currentItem.value.item_id, final_letter: finalLetter.value as string,
      borderline_flag: finalBorderline.value || null, comment: finalComment.value,
    })
    toast.add({ severity: 'success', summary: 'Итог зафиксирован' })
    await load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) }) }
  finally { busy.value = false }
}

async function loadAnalytics() {
  analytics.value = await calibrationApi.analytics(String(route.params.id))
}

async function closeSession() {
  busy.value = true
  try {
    const r = await calibrationApi.close(String(route.params.id))
    toast.add({
      severity: 'success', summary: 'Сессия завершена',
      detail: String(r.summary || ''), life: 8000,
    })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось завершить', detail: errMsg(e), life: 10000 })
  } finally { busy.value = false }
}

async function cancelSession() {
  busy.value = true
  try {
    await calibrationApi.cancel(String(route.params.id))
    toast.add({ severity: 'warn', summary: 'Сессия отменена' })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function revote() {
  busy.value = true
  try {
    const r = await calibrationApi.revote(String(route.params.id), {
      item_id: currentItem.value.item_id, letter: revoteLetter.value as string,
      comment: revoteComment.value,
    })
    toast.add({
      severity: 'warn', summary: `Голос изменён: ${r.changed_from} → ${r.letter}`,
      detail: 'Смена зафиксирована в истории', life: 6000,
    })
    revoteLetter.value = null
    revoteComment.value = ''
    await load()
    if (currentItem.value) await openPack(currentItem.value)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function transferHost() {
  if (!newHost.value) return
  await calibrationApi.transferHost(String(route.params.id), newHost.value as number)
  await load()
  toast.add({ severity: 'success', summary: 'Ведущий передан' })
}
</script>

<style scoped>
.head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: 320px 1fr; gap: 14px; align-items: start; }
.queue-row { display: flex; gap: 8px; align-items: center; padding: 7px 8px; border-radius: 6px; cursor: pointer; justify-content: space-between; }
.queue-row:hover, .queue-row.active { background: #f1f5f9; }
.queue-row > span:first-child { flex: 1; }
.insights { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.ins-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
.big-letter { font-size: 2.2rem; font-weight: 800; }
.comp { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 0.8rem; }
.comp > span:first-child { width: 100px; }
.comp-bar { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; }
.comp-bar > div { height: 100%; background: #3b82f6; border-radius: 4px; }
.kv { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.ach { border-left: 3px solid #cbd5e1; padding: 4px 10px; margin: 8px 0; }
.ach p { margin: 4px 0; }
.vote-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.revote-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
.host-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 10px; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
