<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }
type RegisterResponse = { userId: number; account: string; email: string; nickname: string | null }

const router = useRouter()
const authStore = useAuthStore()

const form = reactive({
  account: '',
  email: '',
  password: '',
  nickname: '',
})

const fieldErrors = reactive<{ account?: string; email?: string; password?: string; nickname?: string }>({})
const submitError = ref('')
const submitOk = ref('')
const loading = ref(false)

function resolveHomePath(role: unknown): string {
  const picked = String(role ?? '').toUpperCase()
  if (picked) return '/home'
  return '/login'
}

function validate(): boolean {
  fieldErrors.account = undefined
  fieldErrors.email = undefined
  fieldErrors.password = undefined
  fieldErrors.nickname = undefined

  const account = form.account.trim()
  if (!account) {
    fieldErrors.account = '请输入手机号/账号'
  } else if (/^\d+$/.test(account) && !/^1\d{10}$/.test(account)) {
    fieldErrors.account = '手机号格式不正确（需为11位，以1开头）'
  } else if (!/^\d+$/.test(account) && !/^[a-zA-Z0-9_]{3,32}$/.test(account)) {
    fieldErrors.account = '账号格式不正确（3-32位字母/数字/下划线）'
  }

  const email = form.email.trim()
  if (!email) {
    fieldErrors.email = '请输入邮箱'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = '邮箱格式不正确'
  }

  const password = form.password
  if (!password) {
    fieldErrors.password = '请输入密码'
  }

  const nickname = form.nickname.trim()
  if (nickname && (nickname.length < 1 || nickname.length > 32)) {
    fieldErrors.nickname = '昵称长度需为1-32位'
  }

  return !fieldErrors.account && !fieldErrors.email && !fieldErrors.password && !fieldErrors.nickname
}

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '注册失败，请稍后重试'
}

async function submit(): Promise<void> {
  submitError.value = ''
  submitOk.value = ''
  if (!validate()) return

  loading.value = true
  try {
    const res = await request<ApiResponse<RegisterResponse>>({
      url: '/auth/register',
      method: 'POST',
      data: {
        account: form.account.trim(),
        email: form.email.trim(),
        password: form.password,
        nickname: form.nickname.trim() || null,
      },
    })

    if (res.code !== 0) {
      submitError.value = res.message || '注册失败'
      return
    }

    submitOk.value = '注册成功，请登录'
    await router.replace('/login')
  } catch (err) {
    submitError.value = resolveErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await router.replace(resolveHomePath(authStore.role))
  }
})
</script>

<template>
  <main style="max-width: 420px; margin: 60px auto; padding: 24px">
    <h1 style="margin: 0 0 16px">注册</h1>

    <form @submit.prevent="submit" style="display: grid; gap: 12px">
      <label style="display: grid; gap: 6px">
        <span>手机号/账号</span>
        <input v-model.trim="form.account" autocomplete="username" />
        <span v-if="fieldErrors.account" style="color: #c00">{{ fieldErrors.account }}</span>
      </label>

      <label style="display: grid; gap: 6px">
        <span>邮箱</span>
        <input v-model.trim="form.email" autocomplete="email" />
        <span v-if="fieldErrors.email" style="color: #c00">{{ fieldErrors.email }}</span>
      </label>

      <label style="display: grid; gap: 6px">
        <span>密码</span>
        <input v-model="form.password" type="password" autocomplete="new-password" />
        <span v-if="fieldErrors.password" style="color: #c00">{{ fieldErrors.password }}</span>
      </label>

      <label style="display: grid; gap: 6px">
        <span>昵称（可选）</span>
        <input v-model.trim="form.nickname" />
        <span v-if="fieldErrors.nickname" style="color: #c00">{{ fieldErrors.nickname }}</span>
      </label>

      <button type="submit" :disabled="loading" style="padding: 10px 12px">
        {{ loading ? '注册中...' : '注册' }}
      </button>

      <div v-if="submitError" style="color: #c00">{{ submitError }}</div>
      <div v-if="submitOk" style="color: #090">{{ submitOk }}</div>

      <div>
        <RouterLink to="/login">已有账号？去登录</RouterLink>
      </div>
    </form>
  </main>
</template>

