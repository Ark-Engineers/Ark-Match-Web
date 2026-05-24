<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }
type RegisterResponse = { userId: number; account: string; email: string; nickname: string | null }

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const sendingCode = ref(false)
const error = ref('')
const formRef = ref<FormInstance>()

const form = reactive({
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
  nickname: '',
})

const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type EmailCheckState = 'idle' | 'invalid' | 'checking' | 'available' | 'exists' | 'error'
const emailCheckState = ref<EmailCheckState>('idle')
const lastEmailCheck = ref<{ email: string; available: boolean } | null>(null)

const emailCheckLabel = computed(() => {
  if (emailCheckState.value === 'checking') return '检查中...'
  if (emailCheckState.value === 'available') return '邮箱可用'
  if (emailCheckState.value === 'exists') return '邮箱已注册'
  if (emailCheckState.value === 'invalid') return '邮箱格式不正确'
  if (emailCheckState.value === 'error') return '检查失败'
  return ''
})

const emailCheckTagType = computed(() => {
  if (emailCheckState.value === 'available') return 'success'
  if (emailCheckState.value === 'exists') return 'danger'
  if (emailCheckState.value === 'invalid') return 'warning'
  if (emailCheckState.value === 'error') return 'warning'
  return 'info'
})

async function fetchEmailAvailable(email: string): Promise<boolean> {
  if (lastEmailCheck.value?.email === email) return lastEmailCheck.value.available
  emailCheckState.value = 'checking'
  try {
    const res = await request<ApiResponse<{ available: boolean }>>({
      url: '/auth/email/available',
      method: 'GET',
      params: { email },
    })
    if (res.code !== 0) {
      emailCheckState.value = 'error'
      return true
    }
    lastEmailCheck.value = { email, available: Boolean(res.data?.available) }
    emailCheckState.value = lastEmailCheck.value.available ? 'available' : 'exists'
    return lastEmailCheck.value.available
  } catch {
    emailCheckState.value = 'error'
    return true
  }
}

let emailCheckTimer: number | undefined
function scheduleEmailCheck(): void {
  if (emailCheckTimer) window.clearTimeout(emailCheckTimer)
  emailCheckTimer = window.setTimeout(() => {
    const email = form.email.trim()
    if (!email) {
      emailCheckState.value = 'idle'
      return
    }
    if (!emailReg.test(email)) {
      emailCheckState.value = 'invalid'
      return
    }
    void fetchEmailAvailable(email)
  }, 350)
}

watch(
  () => form.email,
  async () => {
    error.value = ''
    lastEmailCheck.value = null
    await nextTick()
    scheduleEmailCheck()
  },
)

const rules = computed<FormRules>(() => ({
  email: [
    { required: true, message: '请输入邮箱', trigger: ['blur', 'change'] },
    {
      validator: async (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback()
        if (!emailReg.test(text)) {
          emailCheckState.value = 'invalid'
          return callback(new Error('邮箱格式不正确'))
        }
        const ok = await fetchEmailAvailable(text)
        if (!ok) return callback(new Error('该邮箱已被注册'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  emailCode: [
    { required: true, message: '请输入邮箱验证码', trigger: ['blur', 'change'] },
    {
      validator: (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback()
        if (!/^\d{6}$/.test(text)) return callback(new Error('验证码格式不正确（6位数字）'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  password: [
    {
      validator: (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback(new Error('请输入密码'))
        if (String(form.confirmPassword ?? '').trim() && String(form.confirmPassword ?? '').trim() !== text) {
          return callback(new Error('两次密码不一致'))
        }
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  confirmPassword: [
    {
      validator: (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback(new Error('请再次输入密码'))
        if (text !== String(form.password ?? '').trim()) return callback(new Error('两次密码不一致'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  nickname: [
    {
      validator: (_rule, value: unknown, callback) => {
        const text = String(value ?? '').trim()
        if (!text) return callback(new Error('请输入名称'))
        if (text.length < 1 || text.length > 32) return callback(new Error('名称长度需为1-32位'))
        return callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
}))

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
  return '注册失败，请稍后重试'
}

async function submit(): Promise<void> {
  error.value = ''
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  if (loading.value) return

  loading.value = true
  try {
    const res = await request<ApiResponse<RegisterResponse>>({
      url: '/auth/register',
      method: 'POST',
      data: {
        email: form.email.trim(),
        emailCode: form.emailCode.trim(),
        password: form.password.trim(),
        confirmPassword: form.confirmPassword.trim(),
        nickname: form.nickname.trim(),
      },
    })

    if (res.code !== 0) {
      error.value = res.message || '注册失败'
      return
    }

    ElMessage.success('注册成功')
    await ElMessageBox.alert(
      `账号：${res.data.account}\n昵称：${res.data.nickname}`,
      '注册信息',
      { confirmButtonText: '去登录', type: 'success' },
    ).catch(() => {})
    await router.replace('/login')
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

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

async function sendEmailCode(): Promise<void> {
  if (cooldown.value > 0 || sendingCode.value) return
  sendingCode.value = true
  error.value = ''
  try {
    try {
      await formRef.value?.validateField('email')
    } catch {
      return
    }

    const email = form.email.trim()
    const res = await request<ApiResponse<unknown>>({
      url: '/auth/register/email-code/send',
      method: 'POST',
      data: { email },
    })
    if (res.code !== 0) {
      error.value = res.message || '验证码发送失败'
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
  } finally {
    sendingCode.value = false
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await router.replace(resolveHomePath(authStore.role))
  }
})

onBeforeUnmount(() => {
  if (cooldownTimer) window.clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-title">注册</div>
        <div class="auth-subtitle">账号由系统自动生成（5-10位数字且唯一），昵称为 名称#随机4位</div>
      </div>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @submit.prevent>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="name@example.com" autocomplete="email" clearable @blur="scheduleEmailCheck" @keyup.enter="submit" />
          <div v-if="emailCheckLabel" class="email-hint">
            <el-tag :type="emailCheckTagType" size="small" effect="light">{{ emailCheckLabel }}</el-tag>
          </div>
        </el-form-item>

        <el-form-item label="邮箱验证码" prop="emailCode">
          <el-input v-model="form.emailCode" placeholder="6位数字" inputmode="numeric" maxlength="6" clearable @keyup.enter="submit">
            <template #append>
              <el-button :disabled="cooldown > 0 || sendingCode" :loading="sendingCode" @click="sendEmailCode">
                {{ cooldown > 0 ? `${cooldown}s` : '发送验证码' }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" @keyup.enter="submit" />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" @keyup.enter="submit" />
        </el-form-item>

        <el-form-item label="名称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="1-32字（昵称将自动生成：名称#随机4位）" clearable @keyup.enter="submit" />
        </el-form-item>

        <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">注册</el-button>

        <div class="auth-links">
          <el-button type="primary" link @click="router.push('/login')">已有账号？去登录</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  background:
    radial-gradient(1100px 600px at 20% 10%, rgba(46, 117, 255, 0.18), transparent 60%),
    radial-gradient(900px 520px at 90% 20%, rgba(64, 158, 255, 0.14), transparent 60%),
    linear-gradient(180deg, #f7fbff 0%, #eef6ff 45%, #f8fbff 100%);
}

.auth-card {
  width: min(460px, 100%);
  border: 1px solid rgba(64, 158, 255, 0.16);
  border-radius: 14px;
  padding: 18px 18px 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 40px rgba(15, 64, 140, 0.1);
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

.auth-links {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
}

.email-hint {
  margin-top: 8px;
  line-height: 1;
}
</style>
