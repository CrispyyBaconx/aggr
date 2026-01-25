import { createApp } from 'vue'
import App from './App.vue'
import VueTippy from 'vue-tippy'
import './assets/sass/app.scss'
import store from './store'

import Editable from '@/components/framework/Editable.vue'
import DropdownComponent from '@/components/framework/Dropdown.vue'
import Presets from '@/components/framework/Presets.vue'
import autofocus from '@/directives/autofocusDirective'
import draggableMarket from '@/directives/draggableMarketDirective'

const app = createApp(App)

app.use(store)

app.use(VueTippy, {
  defaultProps: {
    maxWidth: '200px',
    duration: 0,
    arrow: true,
    animation: 'none',
    delay: [200, 0],
    theme: 'dark',
    distance: 24
  }
})

app.component('dropdown', DropdownComponent)
app.component('editable', Editable)
app.component('presets', Presets)
app.directive('autofocus', autofocus)
app.directive('draggable-market', draggableMarket)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base_url = import.meta.env.VITE_APP_BASE_PATH || '/'
    navigator.serviceWorker.register(`${base_url}sw.js`)
  })
}

app.mount('#app')
