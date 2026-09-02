import { describe, expect, it, vi } from 'vitest'

type GetCall = [string, { params?: { query?: Record<string, string>; path?: Record<string, unknown> } }]
const getMock = vi.fn(async (..._a: unknown[]) => ({ data: {} }))
vi.mock('../src/api/client', () => ({
  client: { GET: (...a: unknown[]) => getMock(...a), POST: vi.fn() },
}))
vi.mock('../src/api/errors', () => ({
  ApiError: class extends Error {},
  errMsg: (e: unknown) => String(e),
  logError: vi.fn(),
  getErrorLog: () => [],
  notifyApiError: vi.fn(),
}))

import { competenciesApi } from '../src/api/endpoints'

describe('API-контракт: competencies', () => {
  it('compare_sessions шлёт ТОЛЬКО ISO-даты через |', async () => {
    await competenciesApi.radar(33, 'hard', ['2026-06-18', '2026-07-16'])
    const [url, config] = getMock.mock.calls[0] as unknown as GetCall
    expect(url).toBe('/competencies/employees/{employee_id}/radar')
    expect(config.params?.query).toMatchObject({
      kind: 'hard', compare_sessions: '2026-06-18|2026-07-16',
    })
    expect(config.params?.path).toEqual({ employee_id: 33 })
  })

  it('без сравнения compare_sessions не отправляется вовсе', async () => {
    getMock.mockClear()
    await competenciesApi.radar(33, 'soft')
    const call = getMock.mock.calls[0] as unknown as GetCall
    expect(call[1].params?.query).toEqual({ kind: 'soft', compare_sessions: undefined })
  })
})
