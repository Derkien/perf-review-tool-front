/** Типизированный доступ к API: пути строго из сгенерированной схемы (openapi-fetch),
 *  типы из OpenAPI. Источник истины - бэкенд (KnowledgeBase/00-ROLE-&-MINDSET). */
import type { components } from './types'
import { client } from './client'
import { api } from './http'

export type Employee = components['schemas']['EmployeeOut']
export type EmployeeCard = components['schemas']['EmployeeCardOut']
export type Cycle = { id: number; name: string; stage: string; stage_deadlines: Record<string, string>; is_locked?: boolean }
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

export const staffApi = {
  async listEmployees(params?: { org_unit_id?: number; grade?: string; functional_group?: string; active?: boolean; q?: string }): Promise<Employee[]> {
    const { data } = await client.GET('/staff/employees', { params: params as never })
    return data as Employee[]
  },
  async card(id: number | string): Promise<EmployeeCard> {
    const { data } = await client.GET('/staff/employees/{employee_id}', {
      params: { path: { employee_id: Number(id) } },
    })
    return data as EmployeeCard
  },
  async salaryHistory(id: number | string): Promise<{ date: string; salary: number; premium_pct: number; grade: string | null; reason: string; source: string }[]> {
    const { data } = await client.GET('/staff/employees/{employee_id}/salary-history', {
      params: { path: { employee_id: Number(id) } },
    })
    return data as never
  },
  setTraffic: (id: number | string, body: { month: string; value: number; comment: string; correction_plan?: string; dismissal_date?: string | null }) =>
    api.post<{ ok: boolean; zone: string }>(`/staff/employees/${id}/traffic`, body).then((r) => r.data),
}

export const reviewsApi = {
  async cycles(): Promise<Cycle[]> {
    const { data } = await client.GET('/reviews/cycles')
    return data as Cycle[]
  },
  publicSettings: () => api.get<PublicSettings>('/admin/settings/public').then((r) => r.data),
  mySelf: (cycleId: number) =>
    api.get<{ achievements: { text: string; self_rating?: string | null }[]; status: string }>(
      '/reviews/self/mine', { params: { cycle_id: cycleId } }).then((r) => r.data),
  peerCandidates: (cycleId: number) =>
    api.get<{ mandatory: { id: number; name: string }[]; others: { id: number; name: string; team: string }[]; limits: { min: number; max: number } }>(
      '/reviews/peer-candidates', { params: { cycle_id: cycleId } }).then((r) => r.data),
  saveSelf: (body: { cycle_id: number; achievements: { text: string; self_rating?: string | null }[]; submit: boolean }) =>
    api.post<{ id: number; status: string }>('/reviews/self', body).then((r) => r.data),
  savePeers: (cycleId: number, peerIds: number[]) =>
    api.put<{ id: number; merged: { final: number[] } }>('/reviews/peer-selections',
      { cycle_id: cycleId, peer_ids: peerIds }).then((r) => r.data),
  result: (cycleId: number, employeeId: number | string) =>
    api.get<CycleResult>(`/reviews/cycles/${cycleId}/result`, { params: { employee_id: employeeId } }).then((r) => r.data),
  requestSelfEdit: (selfReviewId: number, comment: string) =>
    api.post<{ ok: boolean; status: string }>(`/reviews/self/${selfReviewId}/edit-request`, null,
      { params: { comment } }).then((r) => r.data),
}

export const competenciesApi = {
  radar: (employeeId: number | string, kind: 'hard' | 'soft', compareDates?: string[]) =>
    api.get<RadarData>(`/competencies/employees/${employeeId}/radar`, {
      params: { kind, compare_sessions: compareDates?.length ? compareDates.join('|') : undefined },
    }).then((r) => r.data),
  matrix: (employeeId: number | string, kind: 'hard' | 'soft') =>
    api.get<MatrixRow[]>(`/competencies/employees/${employeeId}/matrix`, { params: { kind } }).then((r) => r.data),
  sessions: (employeeId: number | string, kind?: 'hard' | 'soft') =>
    api.get<MarkSession[]>(`/competencies/employees/${employeeId}/sessions`, { params: { kind } }).then((r) => r.data),
  dynamics: (employeeId: number | string, kind?: 'hard' | 'soft') =>
    api.get<{ date: string; avg_weight: number; items: number }[]>(`/competencies/employees/${employeeId}/dynamics`, { params: { kind } }).then((r) => r.data),
  sessionXlsxUrl: (employeeId: number | string, kind: 'hard' | 'soft', date: string) =>
    `/api/v1/competencies/employees/${employeeId}/sessions/${kind}/${date}/xlsx`,
}

export const calibrationApi = {
  sessions: (cycleId?: number) =>
    api.get<SessionDetail[] | Record<string, unknown>[]>('/calibration/sessions', { params: { cycle_id: cycleId } }).then((r) => r.data),
  detail: (id: number | string) =>
    api.get<SessionDetail>(`/calibration/sessions/${id}`).then((r) => r.data),
}

export const nominationsApi = {
  list: () => api.get<Nomination[]>('/decisions/nominations').then((r) => r.data),
  create: (body: { employee_id: number; rationale: string; proposed_pct?: number | null; proposed_salary?: number | null; target_grade?: string | null }) =>
    api.post<{ id: number; warnings: string[] }>('/decisions/nominations', body).then((r) => r.data),
}
