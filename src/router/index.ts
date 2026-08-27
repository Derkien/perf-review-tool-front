import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '../stores/auth'

const Login = () => import('../views/LoginView.vue')
const Layout = () => import('../layouts/AppLayout.vue')

const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('../views/CycleDashboardView.vue') },
      { path: 'staff', component: () => import('../views/StaffListView.vue') },
      { path: 'staff/:id', component: () => import('../views/EmployeeCardView.vue') },
      { path: 'my-review', component: () => import('../views/MyReviewView.vue') },
      { path: 'peer-review', component: () => import('../views/PeerReviewView.vue') },
      { path: 'peer-validation', component: () => import('../views/PeerValidationView.vue') },
      { path: 'calibration', component: () => import('../views/CalibrationListView.vue') },
      { path: 'calibration/:id', component: () => import('../views/CalibrationSessionView.vue') },
      { path: 'decisions', component: () => import('../views/DecisionsView.vue') },
      { path: 'nominations', component: () => import('../views/NominationsView.vue') },
      { path: 'imports', component: () => import('../views/ImportsView.vue') },
      { path: 'admin', component: () => import('../views/AdminView.vue') },
      { path: 'notifications', component: () => import('../views/NotificationsView.vue') },
    ],
  },
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuth()
  if (to.path !== '/login' && !auth.isAuthed) return '/login'
  if (to.path === '/login' && auth.isAuthed) return '/dashboard'
})

export default router
