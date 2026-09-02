/** Типизированный доступ к API: пути строго из сгенерированной схемы (openapi-fetch),
 *  типы из OpenAPI. Источник истины — бэкенд (docs/standards).
 *  Все обёртки бросают ApiError при ошибке ответа — видам остаётся catch + errMsg.
 *  Этот слой самодостаточен: при переносе в общую админку копируется целиком. */
import type { components } from './types'
import { client } from './client'
import { ApiError, notifyApiError } from './errors'

export type Employee = components['schemas']['EmployeeOut']
export type EmployeeCard = components['schemas']['EmployeeCardOut']
export type Me = components['schemas']['MeOut']
export type Cycle = { id: number; name: string; stage: string; stage_deadlines: Record<string, string>; is_locked?: boolean; period_start?: string | null; period_end?: string | null }
export type CycleTransition = {
  name: string; to: string; to_label: string; label: string
  permission: string; allowed: boolean; reasons: string[]
}
export type MarkSession = {
  kind: 'hard' | 'soft'
  date: string
  assessor_kind: 'self' | 'manager'
  assessor: string
  marks: number
}
export type RadarData = {
  axis: string[]
  self: (number | null)[]
  manager: (number | null)[]
  norm: number
  session_1?: (number | null)[] | null
  session_2?: (number | null)[] | null
  gaps?: { item: string; self: number; manager: number; gap: number }[]
  summary?: { overestimated: string[]; growth_zones: string[]; avg_self: number; avg_manager: number }
}
export type MatrixRow = {
  kind: string; specialty: string; item_id: number; item: string; category: string
  descriptions: Record<string, string>
  self: { level: string; weight: number; date: string } | null
  manager: { level: string; weight: number; date: string } | null
}
export type CycleResult = {
  cycle: { id: number; name: string; stage: string }
  grade_at_review: string | null
  comp_summary: { hard: number | null; soft: number | null }
  achievements_table: {
    text: string; self_rating: string | null; peer_avg: number | null; peer_letter: string | null
    manager_avg: number | null; manager_letter: string | null
  }[]
  self_review: {
    id: number; achievements: { text: string; self_rating?: string | null }[]; status: string
    edit_log: { action: string; at: string; by: string; comment?: string }[]
    can_edit: boolean; can_request_edit: boolean
  } | null
  peer_stats: { num_of_peers: number; num_of_answers: number; avg_rating_num: number | null; avg_rating: string | null } | null
  manager_reviews: { role: string; assessor: string; submitted: boolean }[]
  leader_assessments: { kind: string; grade_soft: string | null; grade_hard: string | null; rating: string | null; feedback: string; status: string }[]
  decision: {
    final_rating: string | null; decision: string; grade_up: boolean; target_grade: string | null
    target_salary: number | null; raise_pct: number | null; final_comment: string | null; status: string
  } | null
}
export type PublicSettings = {
  self_min_ach: number; self_max_ach: number; self_max_chars: number
  peers_min: number; peers_max: number; grades: string[]
  letter_words: Record<string, string>; eff_param_labels: Record<string, string>
}
export type SessionDetail = {
  id: number; cycle_id: number; group: string; title: string
  status: 'voting' | 'finalizing' | 'closed' | 'cancelled'
  host_user_id: number; participant_ids: number[]
  items: {
    item_id: number; employee_id: number; employee: string; grade: string
    order_no: number; status: 'pending' | 'revealed' | 'final'
    my_vote: string | null; votes_count: number
    final_letter: string | null; borderline_flag: string | null; comment: string
  }[]
  closed_at: string | null; close_summary: string
}
export type Nomination = {
  id: number; employee_id: number; employee: string; grade: string; salary: number
  proposed_pct: number | null; proposed_salary: number | null; target_grade: string | null
  rationale: string; status: 'submitted' | 'approved' | 'rejected' | 'deferred'
  nominator: string; warnings: string[]; decision_comment: string; created_at: string | null
}
export type PermissionDef = { code: string; title: string; group: string }
export type PermissionsCatalog = {
  roles: string[]; superuser_role: string
  permissions: PermissionDef[]; matrix: Record<string, string[]>
}
export type AdminUserRow = {
  id: number | null; email: string; full_name: string; role: string
  is_active: boolean; has_logged_in: boolean; employee_id: number | null
  position: string; team: string
}
export type ActivityRow = {
  id: number; at: string | null; user: string; type: string; section: string
  detail: Record<string, unknown>; user_agent: string; ip: string
}
export type AuditRow = {
  id: number; at: string | null; user: string; entity: string; entity_id: string
  action: string; before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** Ответ API с ошибкой → журнал + ApiError (единая точка: кнопка «Журнал ошибок»
 *  в топбаре всегда наполнена, тост уже показывают view). */
function raise<ErrorShape extends object>(error: ErrorShape, url: string): never {
  const detail = (error as { detail?: unknown }).detail
  let message = 'ошибка запроса'
  if (typeof detail === 'string') message = detail
  else if (Array.isArray(detail)) {
    message = detail.map((d: { loc?: unknown[]; msg?: string }) =>
      `${(d.loc || []).join('.')}: ${d.msg}`).join('; ')
  }
  const status = (error as { status?: number }).status
  notifyApiError(message, url, status)
  throw new ApiError(message, { status, url, detail })
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const authApi = {
  async config(): Promise<{ auth_mode: string; keycloak_server_url: string; keycloak_realm: string; keycloak_client_id: string }> {
    const { data, error } = await client.GET('/auth/config')
    if (error) raise(error, '/auth/config')
    return data as { auth_mode: string; keycloak_server_url: string; keycloak_realm: string; keycloak_client_id: string }
  },
  async devToken(email: string, role: string): Promise<string> {
    const { data, error } = await client.POST('/auth/dev-token', { body: { email, role } })
    if (error) raise(error, '/auth/dev-token')
    return data.access_token
  },
  async me(): Promise<Me> {
    const { data, error } = await client.GET('/auth/me')
    if (error) raise(error, '/auth/me')
    return data as never
  },
}

export const staffApi = {
  async listEmployees(params?: { org_unit_id?: number; grade?: string; functional_group?: string; active?: boolean; q?: string; scope?: 'mine' | 'team' | 'all' }): Promise<Employee[]> {
    const { data, error } = await client.GET('/staff/employees', { params: { query: params as never } })
    if (error) raise(error, '/staff/employees')
    return data as never
  },
  async card(id: number | string): Promise<EmployeeCard> {
    const { data, error } = await client.GET('/staff/employees/{employee_id}', {
      params: { path: { employee_id: Number(id) } },
    })
    if (error) raise(error, '/staff/employees/{employee_id}')
    return data as never
  },
  async salaryHistory(id: number | string): Promise<{ date: string; salary: number; premium_pct: number; grade: string | null; reason: string; source: string }[]> {
    const { data, error } = await client.GET('/staff/employees/{employee_id}/salary-history', {
      params: { path: { employee_id: Number(id) } },
    })
    if (error) raise(error, '/staff/employees/{employee_id}/salary-history')
    return data as never
  },
  async setTraffic(id: number | string, body: { month: string; value: number; comment: string; correction_plan?: string; dismissal_date?: string | null }): Promise<{ ok: boolean; zone: string }> {
    const { data, error } = await client.POST('/staff/employees/{employee_id}/traffic', {
      params: { path: { employee_id: Number(id) } },
      body: { correction_plan: '', ...body },
    })
    if (error) raise(error, '/staff/employees/{employee_id}/traffic')
    return data as { ok: boolean; zone: string }
  },
}

export const reviewsApi = {
  async cycles(): Promise<Cycle[]> {
    const { data, error } = await client.GET('/reviews/cycles')
    if (error) raise(error, '/reviews/cycles')
    return data as Cycle[]
  },
  async publicSettings(): Promise<PublicSettings> {
    const { data, error } = await client.GET('/admin/settings/public')
    if (error) raise(error, '/admin/settings/public')
    return data as never
  },
  async advanceStage(cycleId: number): Promise<{ id: number; stage: string; transition: string }> {
    const { data, error } = await client.POST('/reviews/cycles/{cycle_id}/advance-stage', {
      params: { path: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/advance-stage')
    return data as never
  },
  async createCycle(body: { name: string; stage?: string; stage_deadlines?: Record<string, string>; prev_cycle_id?: number | null }): Promise<{ id: number }> {
    const { data, error } = await client.POST('/reviews/cycles', {
      body: { stage: 'preparation', stage_deadlines: {}, ...body },
    })
    if (error) raise(error, 'POST /reviews/cycles')
    return data as never
  },
  async transitions(cycleId: number): Promise<{ stage: string; stage_label: string; transitions: CycleTransition[] }> {
    const { data, error } = await client.GET('/reviews/cycles/{cycle_id}/transitions', {
      params: { path: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/transitions')
    return data as never
  },
  async applyTransition(cycleId: number, name: string): Promise<{ id: number; stage: string; transition: string }> {
    const { data, error } = await client.POST('/reviews/cycles/{cycle_id}/transition/{name}', {
      params: { path: { cycle_id: cycleId, name } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/transition/{name}')
    return data as never
  },
  async cancelCycle(cycleId: number): Promise<{ id: number; stage: string; transition: string }> {
    const { data, error } = await client.POST('/reviews/cycles/{cycle_id}/cancel', {
      params: { path: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/cancel')
    return data as never
  },
  async mySelf(cycleId: number): Promise<{ id?: number; achievements: { text: string; self_rating?: string | null }[]; status: string }> {
    const { data, error } = await client.GET('/reviews/self/mine', {
      params: { query: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/self/mine')
    return data as never
  },
  async saveSelf(body: { cycle_id: number; achievements: { text: string; self_rating?: string | null }[]; submit: boolean }): Promise<{ id: number; status: string }> {
    const { data, error } = await client.POST('/reviews/self', { body })
    if (error) raise(error, '/reviews/self')
    return data as never
  },
  async peerCandidates(cycleId: number): Promise<{ mandatory: { id: number; name: string }[]; others: { id: number; name: string; team: string }[]; limits: { min: number; max: number } }> {
    const { data, error } = await client.GET('/reviews/peer-candidates', {
      params: { query: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/peer-candidates')
    return data as never
  },
  async savePeers(cycleId: number, peerIds: number[]): Promise<{ id: number; merged: { final: number[] } }> {
    const { data, error } = await client.PUT('/reviews/peer-selections', {
      body: { cycle_id: cycleId, peer_ids: peerIds },
    })
    if (error) raise(error, '/reviews/peer-selections')
    return data as never
  },
  async managerEditPeers(employeeId: number, body: { cycle_id: number; add_ids: number[]; remove_ids: number[] }): Promise<{ merged: { selected: number[]; added: number[]; removed: number[]; final: number[] } }> {
    const { data, error } = await client.PUT('/reviews/peer-selections/{employee_id}', {
      params: { path: { employee_id: employeeId } }, body,
    })
    if (error) raise(error, '/reviews/peer-selections/{employee_id}')
    return data as never
  },
  async sendAssignments(body: { cycle_id: number; employee_ids: number[] }): Promise<{ created: number; notified: number }> {
    const { data, error } = await client.POST('/reviews/peer-assignments/send', { body })
    if (error) raise(error, '/reviews/peer-assignments/send')
    return data as never
  },
  async myAssignments(cycleId: number): Promise<{ assignment_id: number; subject: string; subject_id: number; role: string; status: string; achievements: { text: string; self_rating?: string | null }[] | null }[]> {
    const { data, error } = await client.GET('/reviews/peer-assignments/mine', {
      params: { query: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/peer-assignments/mine')
    return data as never
  },
  async submitPeerReview(assignmentId: number, body: { ratings: { ach_index: number; letter: string }[]; free_text: string }): Promise<{ id: number }> {
    const { data, error } = await client.POST('/reviews/peer-reviews/{assignment_id}', {
      params: { path: { assignment_id: assignmentId } }, body: body as never,
    })
    if (error) raise(error, '/reviews/peer-reviews/{assignment_id}')
    return data as never
  },
  async requestSelfEdit(selfReviewId: number, comment: string): Promise<{ ok: boolean; status: string }> {
    const { data, error } = await client.POST('/reviews/self/{self_review_id}/edit-request', {
      params: { path: { self_review_id: selfReviewId }, query: { comment } },
    })
    if (error) raise(error, '/reviews/self/{self_review_id}/edit-request')
    return data as never
  },
  async result(cycleId: number, employeeId: number | string): Promise<CycleResult> {
    const { data, error } = await client.GET('/reviews/cycles/{cycle_id}/result', {
      params: { path: { cycle_id: cycleId }, query: { employee_id: Number(employeeId) } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/result')
    return data as CycleResult
  },
  async peerStats(cycleId: number, employeeId?: number): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.GET('/reviews/cycles/{cycle_id}/peer-stats', {
      params: { path: { cycle_id: cycleId }, query: { employee_id: employeeId } as never },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/peer-stats')
    return data as Record<string, unknown>[]
  },
  async dashboard(cycleId: number): Promise<Record<string, unknown>> {
    const { data, error } = await client.GET('/reviews/cycles/{cycle_id}/dashboard', {
      params: { path: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/reviews/cycles/{cycle_id}/dashboard')
    return data as Record<string, unknown>
  },
}

export const competenciesApi = {
  async radar(employeeId: number | string, kind: 'hard' | 'soft', compareDates?: string[]): Promise<RadarData> {
    const { data, error } = await client.GET('/competencies/employees/{employee_id}/radar', {
      params: {
        path: { employee_id: Number(employeeId) },
        query: {
          kind,
          compare_sessions: compareDates?.length ? compareDates.join('|') : undefined,
        } as never,
      },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/radar')
    return data as RadarData
  },
  async matrix(employeeId: number | string, kind: 'hard' | 'soft'): Promise<MatrixRow[]> {
    const { data, error } = await client.GET('/competencies/employees/{employee_id}/matrix', {
      params: { path: { employee_id: Number(employeeId) }, query: { kind } },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/matrix')
    return data as MatrixRow[]
  },
  async sessions(employeeId: number | string, kind?: 'hard' | 'soft'): Promise<MarkSession[]> {
    const { data, error } = await client.GET('/competencies/employees/{employee_id}/sessions', {
      params: { path: { employee_id: Number(employeeId) }, query: { kind } as never },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/sessions')
    return data as never
  },
  async dynamics(employeeId: number | string, kind?: 'hard' | 'soft'): Promise<{ date: string; avg_weight: number; items: number }[]> {
    const { data, error } = await client.GET('/competencies/employees/{employee_id}/dynamics', {
      params: { path: { employee_id: Number(employeeId) }, query: { kind } as never },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/dynamics')
    return data as never
  },
  async createMark(body: {
    employee_id: number; item_id: number; level: string
    assessed_on?: string | null; comment?: string; ipr_note?: string | null
    assessor_kind?: 'self' | 'manager'
  }): Promise<{ id: number; updated: boolean }> {
    const { data, error } = await client.POST('/competencies/marks', {
      body: { comment: '', assessor_kind: 'manager', ...body },
    })
    if (error) raise(error, '/competencies/marks')
    return data as never
  },
  async editSession(employeeId: number | string, kind: string, date: string, levels: Record<number, string>): Promise<{ ok: boolean; changed: Record<string, { before: string; after: string }> }> {
    const { data, error } = await client.PATCH('/competencies/employees/{employee_id}/sessions/{kind}/{date_str}', {
      params: { path: { employee_id: Number(employeeId), kind, date_str: date } },
      body: { levels: levels as never },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/sessions/{kind}/{date_str}')
    return data as never
  },
  async deleteSession(employeeId: number | string, kind: string, date: string, hard = false): Promise<{ ok: boolean; action: string }> {
    const { data, error } = await client.DELETE('/competencies/employees/{employee_id}/sessions/{kind}/{date_str}', {
      params: { path: { employee_id: Number(employeeId), kind, date_str: date }, query: { hard } },
    })
    if (error) raise(error, 'DELETE /competencies/employees/{employee_id}/sessions/{kind}/{date_str}')
    return data as never
  },
  async restoreSession(employeeId: number | string, kind: string, date: string): Promise<{ ok: boolean }> {
    const { data, error } = await client.POST('/competencies/employees/{employee_id}/sessions/{kind}/{date_str}/restore', {
      params: { path: { employee_id: Number(employeeId), kind, date_str: date } },
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/sessions/{kind}/{date_str}/restore')
    return data as never
  },
  /** XLSX сессии: blob через клиент с авторизацией (прямой <a href> без токена не работает). */
  async sessionXlsx(employeeId: number | string, kind: string, date: string): Promise<Blob> {
    const { data, error } = await client.GET('/competencies/employees/{employee_id}/sessions/{kind}/{date_str}/xlsx', {
      params: { path: { employee_id: Number(employeeId), kind, date_str: date } },
      parseAs: 'blob',
    })
    if (error) raise(error, '/competencies/employees/{employee_id}/sessions/{kind}/{date_str}/xlsx')
    return data as Blob
  },
}

export const calibrationApi = {
  async sessions(cycleId?: number): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.GET('/calibration/sessions', {
      params: { query: { cycle_id: cycleId } as never },
    })
    if (error) raise(error, '/calibration/sessions')
    return data as Record<string, unknown>[]
  },
  async detail(id: number | string): Promise<SessionDetail> {
    const { data, error } = await client.GET('/calibration/sessions/{session_id}', {
      params: { path: { session_id: Number(id) } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}')
    return data as SessionDetail
  },
  async createSession(body: { cycle_id: number; group: string; title?: string; host_user_id: number; participant_ids: number[] }): Promise<{ id: number; items: number }> {
    const { data, error } = await client.POST('/calibration/sessions', {
      body: { title: '', ...body },
    })
    if (error) raise(error, 'POST /calibration/sessions')
    return data as never
  },
  async pack(sessionId: number | string, employeeId: number): Promise<Record<string, unknown>> {
    const { data, error } = await client.GET('/calibration/sessions/{session_id}/pack/{employee_id}', {
      params: { path: { session_id: Number(sessionId), employee_id: employeeId } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/pack/{employee_id}')
    return data as Record<string, unknown>
  },
  async vote(sessionId: number | string, body: { item_id: number; letter: string; comment?: string }): Promise<{ ok: boolean }> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/vote', {
      params: { path: { session_id: Number(sessionId) } }, body: { comment: '', ...body },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/vote')
    return data as never
  },
  async reveal(sessionId: number | string, itemId: number): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/reveal', {
      params: { path: { session_id: Number(sessionId) }, query: { item_id: itemId } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/reveal')
    return data as Record<string, unknown>
  },
  async revote(sessionId: number | string, body: { item_id: number; letter: string; comment: string }): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/revote', {
      params: { path: { session_id: Number(sessionId) } }, body,
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/revote')
    return data as Record<string, unknown>
  },
  async finalizeItem(sessionId: number | string, body: { item_id: number; final_letter: string; borderline_flag?: string | null; comment?: string }): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/finalize-item', {
      params: { path: { session_id: Number(sessionId) } }, body: { comment: '', ...body },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/finalize-item')
    return data as Record<string, unknown>
  },
  async transferHost(sessionId: number | string, newHostUserId: number): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/transfer-host', {
      params: { path: { session_id: Number(sessionId) }, query: { new_host_user_id: newHostUserId } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/transfer-host')
    return data as Record<string, unknown>
  },
  async close(sessionId: number | string): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/close', {
      params: { path: { session_id: Number(sessionId) } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/close')
    return data as Record<string, unknown>
  },
  async cancel(sessionId: number | string): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/calibration/sessions/{session_id}/cancel', {
      params: { path: { session_id: Number(sessionId) } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/cancel')
    return data as Record<string, unknown>
  },
  async analytics(sessionId: number | string): Promise<Record<string, unknown>> {
    const { data, error } = await client.GET('/calibration/sessions/{session_id}/analytics', {
      params: { path: { session_id: Number(sessionId) } },
    })
    if (error) raise(error, '/calibration/sessions/{session_id}/analytics')
    return data as Record<string, unknown>
  },
  async aiExport(cycleId: number, group?: string): Promise<Blob> {
    const { data, error } = await client.POST('/calibration/ai/export', {
      params: { query: { cycle_id: cycleId, group } as never },
      parseAs: 'blob',
    })
    if (error) raise(error, '/calibration/ai/export')
    return data as Blob
  },
  async aiImport(file: File, provider = 'file', model = 'manual'): Promise<Record<string, unknown>> {
    const fd = new FormData()
    fd.append('file', file)
    const { data, error } = await client.POST('/calibration/ai/import', {
      params: { query: { provider, model } },
      body: fd as never,
    })
    if (error) raise(error, '/calibration/ai/import')
    return data as Record<string, unknown>
  },
}

export const decisionsApi = {
  async list(cycleId: number): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.GET('/decisions', {
      params: { query: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/decisions')
    return data as Record<string, unknown>[]
  },
  async create(cycleId: number, body: Record<string, unknown>): Promise<{ id: number }> {
    const { data, error } = await client.POST('/decisions', {
      params: { query: { cycle_id: cycleId } }, body: body as never,
    })
    if (error) raise(error, 'POST /decisions')
    return data as never
  },
  async patch(decisionId: number, body: Record<string, unknown>): Promise<{ id: number; warnings: string[] }> {
    const { data, error } = await client.PATCH('/decisions/{decision_id}', {
      params: { path: { decision_id: decisionId } }, body: body as never,
    })
    if (error) raise(error, '/decisions/{decision_id}')
    return data as never
  },
  async budget(cycleId: number): Promise<Record<string, unknown>> {
    const { data, error } = await client.GET('/decisions/budget', {
      params: { query: { cycle_id: cycleId } },
    })
    if (error) raise(error, '/decisions/budget')
    return data as Record<string, unknown>
  },
  async listNominations(status?: string): Promise<Nomination[]> {
    const { data, error } = await client.GET('/decisions/nominations', {
      params: { query: { status } as never },
    })
    if (error) raise(error, '/decisions/nominations')
    return data as Nomination[]
  },
  async createNomination(body: { employee_id: number; rationale: string; proposed_pct?: number | null; proposed_salary?: number | null; target_grade?: string | null }): Promise<{ id: number; warnings: string[] }> {
    const { data, error } = await client.POST('/decisions/nominations', { body })
    if (error) raise(error, 'POST /decisions/nominations')
    return data as never
  },
  async patchNomination(id: number, body: { status: string; decision_comment?: string }): Promise<{ id: number; status: string }> {
    const { data, error } = await client.PATCH('/decisions/nominations/{nomination_id}', {
      params: { path: { nomination_id: id } }, body: { decision_comment: '', ...body },
    })
    if (error) raise(error, '/decisions/nominations/{nomination_id}')
    return data as never
  },
  async exportDecisions(cycleId: number): Promise<Blob> {
    const { data, error } = await client.GET('/exports/decisions', {
      params: { query: { cycle_id: cycleId } }, parseAs: 'blob',
    })
    if (error) raise(error, '/exports/decisions')
    return data as Blob
  },
  async exportNominations(cycleId?: number): Promise<Blob> {
    const { data, error } = await client.GET('/exports/nominations', {
      params: { query: { cycle_id: cycleId } as never }, parseAs: 'blob',
    })
    if (error) raise(error, '/exports/nominations')
    return data as Blob
  },
}

export const adminApi = {
  async users(): Promise<AdminUserRow[]> {
    const { data, error } = await client.GET('/admin/users')
    if (error) raise(error, '/admin/users')
    return data as AdminUserRow[]
  },
  async ensureUser(email: string, role: string, fullName = ''): Promise<{ id: number; email: string; role: string }> {
    const { data, error } = await client.POST('/admin/users/by-email', {
      params: { query: { email, role, full_name: fullName } },
    })
    if (error) raise(error, '/admin/users/by-email')
    return data as never
  },
  async patchUser(userId: number, body: { role?: string; is_active?: boolean; full_name?: string }): Promise<{ ok: boolean }> {
    const { data, error } = await client.PATCH('/admin/users/{user_id}', {
      params: { path: { user_id: userId } }, body,
    })
    if (error) raise(error, '/admin/users/{user_id}')
    return data as never
  },
  async settings(): Promise<Record<string, unknown>> {
    const { data, error } = await client.GET('/admin/settings')
    if (error) raise(error, '/admin/settings')
    return data as Record<string, unknown>
  },
  async putSettings(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await client.PUT('/admin/settings', { body: { values } as never })
    if (error) raise(error, 'PUT /admin/settings')
    return data as Record<string, unknown>
  },
  async permissionsCatalog(): Promise<PermissionsCatalog> {
    const { data, error } = await client.GET('/admin/permissions')
    if (error) raise(error, '/admin/permissions')
    return data as PermissionsCatalog
  },
  async activity(limit?: number, userEmail?: string): Promise<ActivityRow[]> {
    const { data, error } = await client.GET('/admin/activity', {
      params: { query: { limit, user_email: userEmail } as never },
    })
    if (error) raise(error, '/admin/activity')
    return data as ActivityRow[]
  },
  async audit(limit?: number, entity?: string): Promise<AuditRow[]> {
    const { data, error } = await client.GET('/admin/audit', {
      params: { query: { limit, entity } as never },
    })
    if (error) raise(error, '/admin/audit')
    return data as AuditRow[]
  },
}

export const notificationsApi = {
  async mine(): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.GET('/notifications/mine')
    if (error) raise(error, '/notifications/mine')
    return data as Record<string, unknown>[]
  },
  async unreadCount(): Promise<{ count: number }> {
    const { data, error } = await client.GET('/notifications/unread-count')
    if (error) raise(error, '/notifications/unread-count')
    return data as never
  },
  async markRead(id: number): Promise<{ ok: boolean }> {
    const { data, error } = await client.POST('/notifications/{notification_id}/read', {
      params: { path: { notification_id: id } },
    })
    if (error) raise(error, '/notifications/{notification_id}/read')
    return data as never
  },
  async readAll(): Promise<{ ok: boolean }> {
    const { data, error } = await client.POST('/notifications/read-all')
    if (error) raise(error, '/notifications/read-all')
    return data as never
  },
}

export const importsApi = {
  async list(): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.GET('/imports')
    if (error) raise(error, '/imports')
    return data as Record<string, unknown>[]
  },
  async preview(importType: string, file: File, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fd = new FormData()
    fd.append('file', file)
    const { data, error } = await client.POST('/imports/{import_type}/preview', {
      params: { path: { import_type: importType }, query: params as never },
      body: fd as never,
    })
    if (error) raise(error, '/imports/{import_type}/preview')
    return data as Record<string, unknown>
  },
  async apply(batchId: number, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await client.POST('/imports/{batch_id}/apply', {
      params: { path: { batch_id: batchId }, query: params as never },
    })
    if (error) raise(error, '/imports/{batch_id}/apply')
    return data as Record<string, unknown>
  },
}

/** Тихая отправка активности (навигация) — не мешает и не ломает переходы. */
export async function postActivity(body: { type: string; section: string; detail: Record<string, unknown> }): Promise<void> {
  await client.POST('/admin/activity', { body: body as never }).catch(() => undefined)
}

export { qs }
