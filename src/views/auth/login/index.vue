<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { request } from '@/api'
import { useAuthStore, type AuthSession } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const mode = ref<'email' | 'account' | 'emailCode'>('email')
const loading = ref(false)
const sendingCode = ref(false)
const error = ref('')
const formRef = ref<FormInstance>()

const bypassCaptcha = computed(() => {
  const explicit = String(import.meta.env.VITE_BYPASS_CAPTCHA ?? '').toLowerCase() === 'true'
  const proxyTarget = String(import.meta.env.VITE_PROXY_TARGET ?? '')
  const maybeApifox = /apifox/i.test(proxyTarget)
  return Boolean(import.meta.env.DEV && (explicit || maybeApifox))
})

const form = reactive({
  identity: '',
  password: '',
  captchaText: '',
  emailCode: '',
})

const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type RememberedLogin = {
  remember: boolean
  mode: 'email' | 'account'
  identity: string
  password: string
}

const REMEMBER_KEY = 'arkmatch.remember.login'
const rememberPassword = ref(false)

const rules = computed<FormRules>(() => ({
  identity: [
    {
      required: true,
      message: mode.value === 'account' ? '请输入账号' : '请输入邮箱',
      trigger: ['blur', 'change'],
    },
    {
      validator: (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback()
        if (mode.value === 'email' || mode.value === 'emailCode') {
          if (!emailReg.test(text)) return callback(new Error('邮箱格式不正确'))
          return callback()
        }
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  password: [
    {
      validator: (_rule, value: unknown, callback) => {
        if (mode.value === 'emailCode') return callback()
        const text = String(value ?? '')
        if (!text) return callback(new Error('请输入密码'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  captchaText: [
    {
      validator: (_rule, value: unknown, callback) => {
        if (bypassCaptcha.value) return callback()
        const text = String(value ?? '').trim()
        if (!text) return callback(new Error('请输入图形验证码'))
        if (!/^[0-9A-Za-z]{4}$/.test(text)) return callback(new Error('图形验证码为4位数字/字母'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  emailCode: [
    {
      validator: (_rule, value: unknown, callback) => {
        if (mode.value !== 'emailCode') return callback()
        const text = String(value ?? '').trim()
        if (!text) return callback(new Error('请输入邮箱验证码'))
        if (!/^\d{6}$/.test(text)) return callback(new Error('验证码格式不正确（6位数字）'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
}))

watch(mode, async () => {
  error.value = ''
  if (!bypassCaptcha.value) {
    await loadCaptcha()
  }
  await nextTick()
  formRef.value?.clearValidate()
})

function resolveHomePath(role: unknown): string {
  const picked = String(role ?? '').toUpperCase()
  if (picked) return '/home'
  return '/login'
}

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '登录失败，请稍后重试'
}

function shouldRefreshCaptchaByCode(code: unknown): boolean {
  return code === 2015 || code === 2016
}

function hintCaptchaRefresh(): void {
  if (captchaLoadError.value) return
  captchaLoadError.value = '验证码已失效，请点击右侧图片刷新'
}

function pickPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function normalizeOkResponse(input: unknown): { ok: boolean; code?: number; message?: string } {
  const raw = input as any
  const message = String(raw?.message ?? raw?.msg ?? raw?.error ?? raw?.errorMessage ?? '')
  const codeLike = raw?.code ?? raw?.status ?? raw?.errcode
  const codeNum = Number(codeLike)
  const hasCode = codeLike !== undefined && codeLike !== null && String(codeLike).trim() !== ''
  const okByCode = hasCode && Number.isFinite(codeNum) ? codeNum === 0 || codeNum === 200 : undefined
  const okByFlag = typeof raw?.success === 'boolean' ? raw.success : typeof raw?.ok === 'boolean' ? raw.ok : undefined
  const ok = okByCode ?? okByFlag ?? true
  return { ok, code: Number.isFinite(codeNum) ? codeNum : undefined, message: message || undefined }
}

function normalizeAuthSession(input: unknown): AuthSession | null {
  const raw = input as any
  const token =
    raw?.accessToken ??
    raw?.token ??
    raw?.access_token ??
    raw?.jwt ??
    raw?.data?.accessToken ??
    raw?.data?.token ??
    raw?.data?.access_token ??
    raw?.data?.jwt
  const accessToken = String(token ?? '').trim()
  if (!accessToken) return null
  const tokenType =
    String(raw?.tokenType ?? raw?.token_type ?? raw?.data?.tokenType ?? raw?.data?.token_type ?? 'Bearer').trim() || 'Bearer'
  const accessExpiresIn = pickPositiveNumber(
    raw?.accessExpiresIn ??
      raw?.expiresIn ??
      raw?.expires_in ??
      raw?.data?.accessExpiresIn ??
      raw?.data?.expiresIn ??
      raw?.data?.expires_in,
    86400,
  )
  const refreshToken = String(raw?.refreshToken ?? raw?.refresh_token ?? raw?.data?.refreshToken ?? raw?.data?.refresh_token ?? '').trim()
  const refreshExpiresIn = pickPositiveNumber(
    raw?.refreshExpiresIn ?? raw?.refresh_expires_in ?? raw?.data?.refreshExpiresIn ?? raw?.data?.refresh_expires_in,
    2592000,
  )
  const userId = pickPositiveNumber(raw?.userId ?? raw?.uid ?? raw?.data?.userId ?? raw?.data?.uid ?? raw?.user?.id ?? raw?.data?.user?.id, 0)
  const role = String(raw?.role ?? raw?.data?.role ?? raw?.user?.role ?? raw?.data?.user?.role ?? 'USER')
  const weight = Number(raw?.weight ?? raw?.data?.weight ?? raw?.user?.weight ?? raw?.data?.user?.weight ?? 0) || 0
  return { tokenType, accessToken, accessExpiresIn, refreshToken, refreshExpiresIn, userId, role, weight }
}

function normalizeLoginResponse(input: unknown): { ok: boolean; code?: number; message?: string; session?: AuthSession } {
  const raw = input as any
  const message = String(raw?.message ?? raw?.msg ?? raw?.error ?? raw?.errorMessage ?? '')
  const codeLike = raw?.code ?? raw?.status ?? raw?.errcode
  const codeNum = Number(codeLike)
  const hasCode = codeLike !== undefined && codeLike !== null && String(codeLike).trim() !== ''
  const okByCode = hasCode && Number.isFinite(codeNum) ? codeNum === 0 || codeNum === 200 : undefined
  const okByFlag = typeof raw?.success === 'boolean' ? raw.success : typeof raw?.ok === 'boolean' ? raw.ok : undefined
  const session = normalizeAuthSession(raw?.data ?? raw)
  const ok = okByCode ?? okByFlag ?? Boolean(session?.accessToken)
  return { ok, code: Number.isFinite(codeNum) ? codeNum : undefined, message: message || undefined, session: session ?? undefined }
}

let submitTimer: number | undefined

const captchaId = ref('')
const captchaSvg = ref('')
const captchaImgSrc = computed(() => (captchaSvg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg.value)}` : ''))
const captchaLoading = ref(false)
const captchaLoadError = ref('')
let captchaSeq = 0
const cooldown = ref(0)
let cooldownTimer: number | undefined

function startCooldown(seconds: number): void {
  if (cooldownTimer) window.clearInterval(cooldownTimer)
  cooldown.value = Math.max(0, Math.floor(seconds))
  if (cooldown.value <= 0) return
  cooldownTimer = window.setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 1)
    if (cooldown.value <= 0 && cooldownTimer) {
      window.clearInterval(cooldownTimer)
      cooldownTimer = undefined
    }
  }, 1000)
}

async function loadCaptcha(): Promise<void> {
  if (bypassCaptcha.value) return
  const seq = ++captchaSeq
  captchaLoading.value = true
  captchaLoadError.value = ''
  captchaId.value = ''
  captchaSvg.value = ''
  try {
    const res = await request<ApiResponse<{ captchaId: string; svg: string }>>({
      url: '/auth/captcha/new',
      method: 'GET',
      params: { _t: Date.now() },
    })
    if (seq !== captchaSeq) return
    if (res.code !== 0 || !res.data?.captchaId || !res.data?.svg) {
      captchaLoadError.value = res.message || '图形验证码加载失败'
      return
    }
    captchaId.value = res.data.captchaId
    captchaSvg.value = res.data.svg
    form.captchaText = ''
  } catch (e) {
    captchaLoadError.value = resolveErrorMessage(e) || '图形验证码加载失败'
  }
  finally {
    if (seq === captchaSeq) captchaLoading.value = false
  }
}

async function sendEmailCode(): Promise<void> {
  if (cooldown.value > 0 || sendingCode.value) return
  sendingCode.value = true
  error.value = ''
  try {
    try {
      await formRef.value?.validateField('identity')
      if (!bypassCaptcha.value) {
        await formRef.value?.validateField('captchaText')
      }
    } catch {
      return
    }
    if (captchaLoading.value) return
    if (!bypassCaptcha.value && !captchaId.value) {
      await loadCaptcha()
      error.value = '请先获取图形验证码'
      return
    }

    const res = await request<ApiResponse<unknown>>({
      url: '/auth/login/email-code/send',
      method: 'POST',
      data: {
        email: form.identity.trim(),
        ...(bypassCaptcha.value
          ? {}
          : {
              captchaId: captchaId.value,
              captchaText: form.captchaText.trim().toUpperCase(),
            }),
      },
    })
    const parsed = normalizeOkResponse(res)
    if (!parsed.ok) {
      error.value = parsed.message || '验证码发送失败'
      if (typeof parsed.code === 'number' && shouldRefreshCaptchaByCode(parsed.code)) hintCaptchaRefresh()
      return
    }
    ElMessage.success('验证码已发送，请查收邮箱')
    startCooldown(60)
  } catch (e) {
    const anyErr = e as any
    const apiData = anyErr?.response?.data as any
    if (apiData?.code === 2020 && typeof apiData?.data?.remainingSeconds === 'number') {
      startCooldown(apiData.data.remainingSeconds)
    }
    error.value = resolveErrorMessage(e)
    if (shouldRefreshCaptchaByCode(apiData?.code)) {
      hintCaptchaRefresh()
    }
  } finally {
    sendingCode.value = false
  }
}

const scrollLock = {
  htmlOverflow: '',
  bodyOverflow: '',
  htmlOverscroll: '',
  bodyOverscroll: '',
}

function lockScroll(): void {
  const html = document.documentElement
  const body = document.body
  scrollLock.htmlOverflow = html.style.overflow
  scrollLock.bodyOverflow = body.style.overflow
  scrollLock.htmlOverscroll = html.style.overscrollBehavior
  scrollLock.bodyOverscroll = body.style.overscrollBehavior
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
  body.style.overscrollBehavior = 'none'
}

function unlockScroll(): void {
  const html = document.documentElement
  const body = document.body
  html.style.overflow = scrollLock.htmlOverflow
  body.style.overflow = scrollLock.bodyOverflow
  html.style.overscrollBehavior = scrollLock.htmlOverscroll
  body.style.overscrollBehavior = scrollLock.bodyOverscroll
}

async function doSubmit(): Promise<void> {
  error.value = ''
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  if (loading.value) return
  if (captchaLoading.value) return
  if (!bypassCaptcha.value && !captchaId.value) {
    await loadCaptcha()
    error.value = '请先获取图形验证码'
    return
  }

  loading.value = true
  try {
    const res =
      mode.value === 'emailCode'
        ? await request<ApiResponse<AuthSession>>({
            url: '/auth/login/email-code/verify',
            method: 'POST',
            data: {
              email: form.identity.trim(),
              emailCode: form.emailCode.trim(),
            },
          })
        : await request<ApiResponse<AuthSession>>({
            url: '/auth/login',
            method: 'POST',
            data: {
              account: form.identity.trim(),
              password: form.password,
              ...(bypassCaptcha.value
                ? {}
                : {
                    captchaId: captchaId.value,
                    captchaText: form.captchaText.trim().toUpperCase(),
                  }),
            },
          })

    const parsed = normalizeLoginResponse(res)
    if (!parsed.ok || !parsed.session?.accessToken) {
      error.value = parsed.message || '登录失败'
      if (typeof parsed.code === 'number' && shouldRefreshCaptchaByCode(parsed.code)) hintCaptchaRefresh()
      return
    }

    authStore.setSession(parsed.session)
    if (rememberPassword.value && mode.value !== 'emailCode') {
      const payload: RememberedLogin = {
        remember: true,
        mode: mode.value === 'account' ? 'account' : 'email',
        identity: form.identity,
        password: form.password,
      }
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(payload))
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    await router.replace(redirect || resolveHomePath(parsed.session.role))
  } catch (e) {
    const anyErr = e as any
    const apiData = anyErr?.response?.data as any
    error.value = resolveErrorMessage(e)
    if (shouldRefreshCaptchaByCode(apiData?.code)) {
      hintCaptchaRefresh()
    }
  } finally {
    loading.value = false
  }
}

function submit(): void {
  if (submitTimer) window.clearTimeout(submitTimer)
  submitTimer = window.setTimeout(() => {
    void doSubmit()
  }, 250)
}

onMounted(async () => {
  lockScroll()
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RememberedLogin
      if (parsed && parsed.remember && (parsed.mode === 'email' || parsed.mode === 'account')) {
        rememberPassword.value = true
        mode.value = parsed.mode
        form.identity = String(parsed.identity || '')
        form.password = String(parsed.password || '')
      }
    }
  } catch {}
  if (authStore.isAuthenticated) {
    await router.replace(resolveHomePath(authStore.role))
  }
  if (!bypassCaptcha.value) {
    await loadCaptcha()
  }
})

watch(rememberPassword, (next) => {
  if (next) return
  try {
    localStorage.removeItem(REMEMBER_KEY)
  } catch {}
})

onBeforeUnmount(() => {
  unlockScroll()
  if (cooldownTimer) window.clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-title">登录</div>
        <div class="auth-subtitle">使用邮箱或账号登录</div>
      </div>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

      <el-tabs v-model="mode" class="auth-tabs" stretch>
        <el-tab-pane label="邮箱登录" name="email" />
        <el-tab-pane label="账号登录" name="account" />
        <el-tab-pane label="邮箱验证码" name="emailCode" />
      </el-tabs>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @submit.prevent>
        <el-form-item :label="mode === 'account' ? '账号' : '邮箱'" prop="identity">
          <el-input
            v-model="form.identity"
            :placeholder="mode === 'account' ? '' : 'name@example.com'"
            :autocomplete="mode === 'account' ? 'username' : 'email'"
            clearable
            @keyup.enter="submit"
          />
        </el-form-item>

        <el-form-item v-if="mode !== 'emailCode'" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" @keyup.enter="submit" />
        </el-form-item>

        <div v-if="mode !== 'emailCode'" class="auth-remember">
          <el-checkbox v-model="rememberPassword">记住密码</el-checkbox>
        </div>

        <el-form-item label="图形验证码" prop="captchaText">
          <div class="captcha-row">
            <el-input
              v-model="form.captchaText"
              placeholder="输入图形验证码"
              maxlength="4"
              clearable
              @input="(v: string) => (form.captchaText = String(v ?? '').toUpperCase())"
              @keyup.enter="mode === 'emailCode' ? sendEmailCode() : submit()"
            />
            <div class="captcha-box" title="点击刷新" @click="loadCaptcha">
              <img v-if="captchaSvg" class="captcha-svg" :src="captchaImgSrc" alt="captcha" />
              <div v-else-if="captchaLoading" class="captcha-loading">加载中</div>
              <div v-else class="captcha-loading">{{ captchaLoadError || '点击重试' }}</div>
            </div>
          </div>
        </el-form-item>

        <template v-if="mode === 'emailCode'">
          <el-form-item label="邮箱验证码" prop="emailCode">
            <el-input v-model="form.emailCode" placeholder="6位数字" inputmode="numeric" maxlength="6" clearable @keyup.enter="submit">
              <template #append>
                <el-button :disabled="cooldown > 0 || sendingCode" :loading="sendingCode" @click="sendEmailCode">
                  {{ cooldown > 0 ? `${cooldown}s` : '发送验证码' }}
                </el-button>
              </template>
            </el-input>
          </el-form-item>
        </template>

        <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">登录</el-button>

        <div class="auth-links">
          <el-button type="primary" link @click="router.push('/register')">没有账号？去注册</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  width: 100%;
  overflow: hidden;
  background:
    radial-gradient(1100px 600px at 20% 10%, rgba(46, 117, 255, 0.18), transparent 60%),
    radial-gradient(900px 520px at 90% 20%, rgba(64, 158, 255, 0.14), transparent 60%),
    linear-gradient(180deg, #f7fbff 0%, #eef6ff 45%, #f8fbff 100%);
}

.auth-card {
  width: min(420px, 100%);
  box-sizing: border-box;
  border: 1px solid rgba(64, 158, 255, 0.16);
  border-radius: 14px;
  padding: 18px 18px 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 40px rgba(15, 64, 140, 0.1);
  max-width: 420px;
}

.auth-brand {
  margin-bottom: 10px;
}

.auth-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #0b1b3a;
}

.auth-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(11, 27, 58, 0.62);
}

.auth-tabs {
  margin: 8px 0 10px;
}

.auth-links {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
}

.auth-remember {
  margin: -6px 0 10px;
  display: flex;
  justify-content: flex-start;
}

.captcha-row {
  display: grid;
  grid-template-columns: 1fr 136px;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.captcha-box {
  height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(64, 158, 255, 0.22);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.captcha-svg {
  width: 132px;
  height: 44px;
}

.captcha-loading {
  font-size: 12px;
  color: rgba(11, 27, 58, 0.6);
}

@media (max-height: 720px) {
  .auth-shell {
    padding: 18px 14px;
  }

  .auth-card {
    padding: 14px 14px 12px;
  }

  .auth-tabs {
    margin: 6px 0 8px;
  }
}
</style>
