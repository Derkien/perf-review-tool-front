import { createApp } from 'vue'

// Sentry (включается VITE_SENTRY_DSN; без DSN — выключен)
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (SENTRY_DSN) {
  import('@sentry/vue').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      integrations: [Sentry.browserTracingIntegration({ router: undefined })],
      tracesSampleRate: 0.2,
    })
  })
}

import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import Tooltip from 'primevue/tooltip'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

// Никаких белых экранов: любая ошибка рендера видна на странице и в консоли
app.config.errorHandler = (err, _instance, info) => {
  console.error('[vue]', info, err)
  import('./api').then(({ logError }) =>
    logError({ kind: 'render', message: `${info}: ${err instanceof Error ? err.message : String(err)}` }),
  )
  showFatalError(`${info}: ${err instanceof Error ? err.message : String(err)}`)
}
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
})
window.addEventListener('error', (e) => {
  console.error('[window]', e.message)
})

function showFatalError(message: string) {
  let el = document.getElementById('fatal-error')
  if (!el) {
    el = document.createElement('div')
    el.id = 'fatal-error'
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;padding:24px;background:#fef2f2;' +
      'color:#7f1d1d;font:14px/1.5 monospace;overflow:auto;white-space:pre-wrap'
    document.body.appendChild(el)
  }
  el.textContent = 'Ошибка приложения: ' + message
}

app.use(createPinia())
app.use(router)
app.directive('tooltip', Tooltip)
app.use(ToastService)
app.use(PrimeVue, { theme: { preset: Aura }, locale: {
  accept: 'Ок', reject: 'Отмена', choose: 'Выбрать', upload: 'Загрузить', cancel: 'Отмена',
  dayNames: ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'],
  dayNamesShort: ['вс','пн','вт','ср','чт','пт','сб'],
  dayNamesMin: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
  monthNames: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
  monthNamesShort: ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'],
  today: 'Сегодня', clear: 'Очистить', emptyMessage: 'Нет данных', searchMessage: 'Поиск',
} })
app.mount('#app')
