import { defineStore } from 'pinia'
import { api } from '../api'

export interface Me { id: number; email: string; full_name: string; role: string }

export const useAuth = defineStore('auth', {
  state: () => ({
    me: JSON.parse(localStorage.getItem('me') || 'null') as Me | null,
    authMode: '' as string,
  }),
  getters: {
    isAuthed: (s) => !!s.me,
    role: (s) => s.me?.role || '',
    isCto: (s) => ['cto', 'admin'].includes(s.me?.role || ''),
    isManager: (s) =>
      ['cto', 'admin', 'line-manager', 'functional-manager'].includes(s.me?.role || ''),
  },
  actions: {
    async loadAuthMode() {
      if (!this.authMode) {
        const r = await api.get('/auth/config')
        this.authMode = r.data.auth_mode
      }
      return this.authMode
    },
    async devLogin(email: string, role: string) {
      const r = await api.post('/auth/dev-token', { email, role })
      localStorage.setItem('token', r.data.access_token)
      await this.fetchMe()
    },
    async fetchMe() {
      try {
        const r = await api.get('/auth/me')
        this.me = r.data
        localStorage.setItem('me', JSON.stringify(r.data))
      } catch {
        this.logout()
      }
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      this.me = null
    },
  },
})
