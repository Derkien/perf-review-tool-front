/** Домен цикла перф-ревью: единый источник названий стадий и правил для фронта
 *  (устраняет дублирование в StaffList / PeerEditDialog / Dashboard / EmployeeCard). */

export const CYCLE_STAGE_NAMES: Record<string, string> = {
  'self-review': 'сбор ачивок',
  'peer-review': 'оценки пиров',
  'leader-assessment': 'предоценки',
  calibration: 'калибровки',
  decision: 'решения',
  closed: 'закрыт',
  preparation: 'подготовка',
  cancelled: 'отменён',
  imported: 'импорт',
}

/** Стадии, в которых разрешена рассылка заданий на оценку (окно оценок). */
export const SEND_ASSIGNMENT_STAGES = ['self-review', 'peer-review', 'leader-assessment']

/** Стадии, на которых цикл считается активным. */
export const INACTIVE_STAGES = ['closed', 'imported', 'cancelled']

export function stageLabel(stage: string | null | undefined): string {
  return CYCLE_STAGE_NAMES[stage || ''] || stage || '—'
}

export function isActiveCycle(stage: string | null | undefined): boolean {
  return !!stage && !INACTIVE_STAGES.includes(stage)
}

export function isSendWindow(stage: string | null | undefined): boolean {
  return !!stage && SEND_ASSIGNMENT_STAGES.includes(stage)
}
