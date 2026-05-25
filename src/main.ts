import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './assets/main.css'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.config.errorHandler = (err) => {
  console.error(err)
}

const auth = useAuthStore(pinia)
auth.ensureSessionValid()

let authExpireTimer: number | null = null
function resetAuthExpireTimer(): void {
  if (authExpireTimer != null) {
    window.clearTimeout(authExpireTimer)
    authExpireTimer = null
  }
  const exp = auth.sessionExpireAt
  if (!auth.isAuthenticated || !exp) return
  const ms = exp - Date.now()
  if (ms <= 0) {
    auth.clearAllClientAuthState()
    router.replace('/login')
    return
  }
  authExpireTimer = window.setTimeout(() => {
    auth.clearAllClientAuthState()
    router.replace('/login')
  }, ms)
}

resetAuthExpireTimer()
watch(
  () => auth.sessionExpireAt,
  () => resetAuthExpireTimer(),
)
watch(
  () => auth.isAuthenticated,
  () => resetAuthExpireTimer(),
)

app.mount('#app')
