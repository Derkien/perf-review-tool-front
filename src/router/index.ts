import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '../stores/auth'

const Login = () => import('../views/LoginView.vue')
const Layout = () => import('../layouts/AppLayout.vue')

// доступ к разделу по пермишену (fixes5): мета.role больше не используется;
// эндпоинты без пермишена доступны любому аутентифицированному (свои данные)
const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('../views/CycleDashboardView.vue'),
        meta: { perm: 'ROLE_R_DASHBOARD' } },
      { path: 'staff', component: () => import('../views/StaffListView.vue'),
        meta: { perm: 'ROLE_R_STAFF' } },
      { path: 'staff/:id', component: () => import('../views/EmployeeCardView.vue') },
      { path: 'my-review', component: () => import('../views/MyReviewView.vue') },
      { path: 'peer-review', component: () => import('../views/PeerReviewView.vue') },
      { path: 'peer-validation', component: () => import('../views/PeerValidationView.vue'),
        meta: { perm: 'ROLE_C_PEER_ASSIGNMENT' } },
      { path: 'calibration', component: () => import('../views/CalibrationListView.vue'),
        meta: { perm: 'ROLE_V_REVIEW_RESULT' } },
      { path: 'calibration/:id', component: () => import('../views/CalibrationSessionView.vue'),
        meta: { perm: 'ROLE_V_REVIEW_RESULT' } },
      { path: 'decisions', component: () => import('../views/DecisionsView.vue'),
        meta: { perm: 'ROLE_R_DECISION_ANY' } },
      { path: 'nominations', component: () => import('../views/NominationsView.vue'),
        meta: { perm: 'ROLE_R_NOMINATION' } },
      { path: 'imports', component: () => import('../views/ImportsView.vue'),
        meta: { perm: 'ROLE_C_IMPORT' } },
      { path: 'admin', component: () => import('../views/AdminView.vue'),
        meta: { perm: 'ROLE_U_SETTINGS' } },
      { path: 'notifications', component: () => import('../views/NotificationsView.vue') },
    ],
  },
]

const router = createRouter({ history: createWebHashHistory(), routes })

// куда попадает пользователь после логина (dashboard — только с правом ROLE_R_DASHBOARD)
export function homeForAuth(can: (code: string) => boolean): string {
  return can('ROLE_R_DASHBOARD') ? '/dashboard' : '/my-review'
}

// трек навигации для админ-аналитики (тихий, не блокирует и не ломает выход)
router.afterEach((to) => {
  document.getElementById('fatal-error')?.remove()
  const token = localStorage.getItem('token')
  if (!token) return
  import('../api/endpoints').then(({ postActivity }) =>
    postActivity({ type: 'page-view', section: to.path, detail: { to: to.fullPath } }),
  )
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (to.path !== '/login' && !auth.isAuthed) return '/login'
  // старая сессия без пермишенов — обновляем me (там теперь список прав)
  if (auth.isAuthed && !Array.isArray(auth.me?.permissions)) await auth.ensurePermissions()
  if (to.path === '/login' && auth.isAuthed) return homeForAuth(auth.can)
  // раздел закрыт без пермишена → домашняя страница (никаких красных экранов)
  const perm = to.meta?.perm as string | undefined
  if (perm && !auth.can(perm)) return homeForAuth(auth.can)
})

export default router
