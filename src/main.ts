import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import Tooltip from 'primevue/tooltip'
import 'primeicons/primeicons.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('tooltip', Tooltip)
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
