import { defineStore } from 'pinia'
import { authApi } from '../api/endpoints'
import type { Me } from '../api/endpoints'

export const useAuth = defineStore('auth', {
  state: () => ({
    me: JSON.parse(localStorage.getItem('me') || 'null') as Me | null,
    authMode: '' as string,
  }),
  getters: {
    isAuthed: (s) => !!s.me,
    role: (s) => s.me?.role || '',
    /** Пермишены текущего пользователя (fixes5): меню/вкладки/кнопки — только по ним. */
    permissions: (s): string[] => s.me?.permissions || [],
    can(): (code: string) => boolean {
      return (code) => this.permissions.includes(code)
    },
    canAny(): (...codes: string[]) => boolean {
      return (...cs) => cs.some((c) => this.permissions.includes(c))
    },
  },
  actions: {
    async loadAuthMode() {
      if (!this.authMode) {
        this.authMode = (await authApi.config()).auth_mode
      }
      return this.authMode
    },
    async devLogin(email: string, role: string) {
      const token = await authApi.devToken(email, role)
      localStorage.setItem('token', token)
      await this.fetchMe()
    },
    async fetchMe() {
      try {
        const me = await authApi.me()
        this.me = me
        localStorage.setItem('me', JSON.stringify(me))
      } catch {
        this.logout()
      }
    },
    /** Пермишены ещё не загружены (старый localStorage) — подтянуть с сервера. */
    async ensurePermissions() {
      if (this.isAuthed && !Array.isArray(this.me?.permissions)) {
        await this.fetchMe()
      }
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      this.me = null
    },
  },
})
