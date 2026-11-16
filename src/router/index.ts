import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '../stores/auth'
import { setUnauthorizedHandler } from '../api/client'

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
      // хаб заданий (переоценка, селф-ревью, оценка коллег); старый адрес — редирект
      { path: 'assessments', component: () => import('../views/AssessmentsView.vue') },
      { path: 'peer-review', redirect: '/assessments' },
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
      { path: 'admin/:section?',
        // подразделы админки — URL-роуты (/admin/dictionaries…): рефреш сохраняет
        // раздел; вкладки имеют собственные права, вход — по любому из списка
        component: () => import('../views/AdminView.vue'),
        meta: { perm: ['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX',
                       'ROLE_U_COMPETENCY_REASSESSMENT', 'ROLE_U_ASSIGNMENTS',
                       'ROLE_R_DELIVERY_LOG'] } },
      { path: 'notifications', component: () => import('../views/NotificationsView.vue') },
    ],
  },
]

const router = createRouter({ history: createWebHashHistory(), routes })

// протухший токен/сброс авторизации — клиент дропает localStorage, здесь чистится
// pinia-стор и происходит переход; без хендлера пользователь оставался на странице
// с уведомлениями вместо редиректа (guard пускает на /login только при !isAuthed)
setUnauthorizedHandler(() => {
  useAuth().logout()
  void router.push('/login')
})

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
  // раздел закрыт без пермишена → домашняя страница (никаких красных экранов);
  // perm может быть массивом — доступ при любом из списка (вкладки /admin)
  const perm = to.meta?.perm as string | string[] | undefined
  const required = Array.isArray(perm) ? perm : perm ? [perm] : []
  if (required.length && !required.some((p) => auth.can(p))) return homeForAuth(auth.can)
})

export default router
