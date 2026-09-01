import { describe, expect, it, vi } from 'vitest'

type GetCall = [string, { params: Record<string, string> }]
const getMock = vi.fn(async (..._a: unknown[]) => ({ data: {} }))
vi.mock('../src/api/http', () => ({
  api: { get: (...a: unknown[]) => getMock(...a), post: vi.fn() },
  errMsg: (e: unknown) => String(e),
}))

import { competenciesApi } from '../src/api/endpoints'

describe('API-контракт: competencies', () => {
  it('compare_sessions шлёт ТОЛЬКО ISO-даты через |', async () => {
    await competenciesApi.radar(33, 'hard', ['2026-06-18', '2026-07-16'])
    const [url, config] = getMock.mock.calls[0] as unknown as [
      string, { params: Record<string, string> },
    ]
    expect(url).toBe('/competencies/employees/33/radar')
    expect(config.params).toEqual({ kind: 'hard', compare_sessions: '2026-06-18|2026-07-16' })
  })

  it('без сравнения compare_sessions не отправляется вовсе', async () => {
    getMock.mockClear()
    await competenciesApi.radar(33, 'soft')
    const call = getMock.mock.calls[0] as unknown as [string, { params: Record<string, string> }]
    expect(call[1].params).toEqual({ kind: 'soft' })
  })
})
