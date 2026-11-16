import { afterEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware, setUnauthorizedHandler } from '../src/api/client'

describe('client: протухание сессии (401)', () => {
  afterEach(() => {
    setUnauthorizedHandler(() => {})
    localStorage.clear()
  })

  it('401 от любого эндпоинта дропает сессию и зовёт onUnauthorized', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    localStorage.setItem('token', 't')
    localStorage.setItem('me', '{"id":1}')

    authMiddleware.onResponse!({ response: new Response(null, { status: 401 }) } as never)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('me')).toBeNull()
  })

  it('не-401 ответ не трогает сессию', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    localStorage.setItem('token', 't')

    authMiddleware.onResponse!({ response: new Response(null, { status: 200 }) } as never)
    expect(handler).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('t')
  })

  it('токен с истёкшим exp дропает сессию до запроса', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    localStorage.setItem('token', 'x.' + btoa(JSON.stringify({ exp: 1 })))

    expect(() =>
      authMiddleware.onRequest!({ request: new Request('http://localhost/x') } as never),
    ).toThrow('сессия истекла')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
  })
})
