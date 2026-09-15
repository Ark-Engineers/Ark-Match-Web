<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { getNewCaptcha, sendRegisterEmailCode } from '@/api/auth'
import UiModal from './UiModal.vue'
import UiButton from './UiButton.vue'

const auth = useAuthStore()
const ui = useUiStore()

const tab = ref<'login' | 'register'>('login')
// 记住密码：预填上次记住的账号
const account = ref(auth.rememberedAccount ?? '')
const password = ref('')
const email = ref('')
const confirmPassword = ref('')
const nickname = ref('')
const showPwd = ref(false)
const rememberMe = ref(false)
// 注册邮箱验证码
const emailCode = ref('')
const codeBtnLoading = ref(false)
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | null = null
// 图形验证码（一次性；登录失败后需重新获取）
const captchaId = ref('')
const captchaSvg = ref('')
const captchaText = ref('')
const captchaLoading = ref(false)

async function loadCaptcha() {
  captchaLoading.value = true
  captchaText.value = ''
  try {
    const c = await getNewCaptcha()
    captchaId.value = c.captchaId
    captchaSvg.value = c.svg
  } catch {
    captchaSvg.value = ''
    ui.showToast('验证码加载失败，请检查网络', 'error')
  } finally {
    captchaLoading.value = false
  }
}

// 打开弹窗或切到登录 tab 时刷新验证码
watch(
  () => [ui.showLoginModal, tab.value] as const,
  ([show, t]) => {
    if (show && t === 'login' && !auth.isLoggedIn) loadCaptcha()
  },
)

async function handleLogin() {
  if (!account.value || !password.value || !captchaId.value || !captchaText.value) return
  try {
    await auth.login(account.value, password.value, rememberMe.value, captchaId.value, captchaText.value)
    ui.toggleLoginModal(false)
    ui.showToast('登录成功', 'success')
    // 验证码一次性：成功后清空，下次打开再拉取
    captchaId.value = ''
    captchaSvg.value = ''
    captchaText.value = ''
  } catch {
    // 验证码一次性，无论账号密码对错都会失效，失败后强制刷新
    captchaSvg.value = ''
    loadCaptcha()
  }
}

async function sendCode() {
  const e = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    auth.error = '请输入正确的邮箱'
    return
  }
  codeBtnLoading.value = true
  auth.error = ''
  try {
    await sendRegisterEmailCode(e)
    ui.showToast('验证码已发送，请查收邮箱', 'success')
    codeCountdown.value = 60
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = setInterval(() => {
      codeCountdown.value -= 1
      if (codeCountdown.value <= 0 && codeTimer) {
        clearInterval(codeTimer)
        codeTimer = null
      }
    }, 1000)
  } catch (err: any) {
    auth.error = err.message ?? '验证码发送失败'
  } finally {
    codeBtnLoading.value = false
  }
}

async function handleRegister() {
  if (!email.value || !emailCode.value || !password.value || !confirmPassword.value) return
  if (password.value !== confirmPassword.value) {
    auth.error = '两次密码不匹配'
    return
  }
  try {
    await auth.register(
      email.value.trim(),
      emailCode.value.trim(),
      password.value,
      confirmPassword.value,
      nickname.value.trim() || '用户',
    )
    ui.showToast('注册成功，请登录', 'success')
    tab.value = 'login'
    password.value = ''
    confirmPassword.value = ''
    emailCode.value = ''
  } catch {
    // error stored in auth.error
  }
}

function switchTab(t: 'login' | 'register') {
  tab.value = t
  auth.error = ''
}
</script>

<template>
  <UiModal :show="ui.showLoginModal" @close="ui.toggleLoginModal(false)">
    <div class="p-6 md:p-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <img src="/logoD.png" alt="罗德之门" class="h-14 w-auto mx-auto mb-3" />
        <h2 class="text-xl font-bold text-white">罗德之门</h2>
        <p class="text-gray-500 text-xs mt-1">{{ tab === 'login' ? '登录你的账号' : '创建新账号' }}</p>
      </div>

      <!-- Tab switcher -->
      <div class="flex mb-6 bg-gray-800/50 rounded-lg p-0.5">
        <button
          class="flex-1 py-2 text-sm font-medium rounded-md transition cursor-pointer"
          :class="tab === 'login' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="switchTab('login')"
        >登录</button>
        <button
          class="flex-1 py-2 text-sm font-medium rounded-md transition cursor-pointer"
          :class="tab === 'register' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="switchTab('register')"
        >注册</button>
      </div>

      <!-- Login form -->
      <form v-if="tab === 'login'" class="space-y-4" @submit.prevent="handleLogin">
        <input v-model="account" type="text" placeholder="账号"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
               autocomplete="username" @keyup.enter="handleLogin" />
        <div class="relative">
          <input v-model="password" :type="showPwd ? 'text' : 'password'" placeholder="密码"
                 class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 pr-10"
                 autocomplete="current-password" @keyup.enter="handleLogin" />
          <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm cursor-pointer"
                  @click="showPwd = !showPwd">{{ showPwd ? '🙈' : '👁' }}</button>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input v-model="rememberMe" type="checkbox"
                 class="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 accent-cyan-500" />
          记住我这个账号
        </label>
        <!-- 图形验证码 -->
        <div class="flex items-center gap-2">
          <div
            class="flex-1 min-w-0 rounded-lg bg-gray-800/40 border border-gray-700 overflow-hidden [&>svg]:block [&>svg]:h-11 [&>svg]:w-full"
            :class="captchaLoading && 'opacity-50'"
            v-html="captchaSvg"
          />
          <button
            type="button"
            title="点击刷新验证码"
            class="shrink-0 px-3 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-cyan-300 hover:border-cyan-500/40 transition text-lg cursor-pointer"
            :disabled="captchaLoading"
            @click="loadCaptcha"
          >↻</button>
        </div>
        <input v-model="captchaText" type="text" placeholder="图形验证码" maxlength="8" autocomplete="off"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm tracking-widest uppercase focus:outline-none focus:border-cyan-500/50"
               @keyup.enter="handleLogin" />
        <p v-if="auth.error" class="text-red-400 text-xs">{{ auth.error }}</p>
        <UiButton type="submit" block :loading="auth.loading">登录</UiButton>
      </form>

      <!-- Register form -->
      <form v-else class="space-y-3" @submit.prevent="handleRegister">
        <div class="flex items-center gap-2">
          <input v-model="email" type="email" placeholder="邮箱" autocomplete="email"
                 class="flex-1 min-w-0 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
          <button type="button"
                  class="shrink-0 px-3 py-3 rounded-lg bg-gray-800/50 border border-gray-700 text-xs text-gray-300 hover:text-cyan-300 hover:border-cyan-500/40 transition cursor-pointer whitespace-nowrap"
                  :disabled="codeBtnLoading || codeCountdown > 0"
                  @click="sendCode">
            {{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}
          </button>
        </div>
        <input v-model="emailCode" type="text" placeholder="邮箱验证码" maxlength="6" autocomplete="one-time-code"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm tracking-widest focus:outline-none focus:border-cyan-500/50" />
        <input v-model="nickname" type="text" placeholder="昵称（将自动追加 #四位数）"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
        <input v-model="password" type="password" placeholder="密码"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
        <input v-model="confirmPassword" type="password" placeholder="确认密码"
               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
        <p v-if="auth.error" class="text-red-400 text-xs">{{ auth.error }}</p>
        <UiButton type="submit" block :loading="auth.loading">注册</UiButton>
      </form>
    </div>
  </UiModal>
</template>