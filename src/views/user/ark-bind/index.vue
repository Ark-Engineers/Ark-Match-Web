<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { bindArknights } from '@/api/user'
import { fetchArknightsOfficialBinding, sendHgPhoneCode } from '@/api/hypergryph'

const router = useRouter()

const tab = ref<'password' | 'code'>('password')

const phone = ref('')
const password = ref('')
const code = ref('')

const sending = ref(false)
const cooldown = ref(0)
let cooldownTimer: number | null = null

const binding = ref(false)

function normalizePhone(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^0-9]/g, '')
}

function isPhoneValid(raw: string): boolean {
  return /^1\d{10}$/.test(normalizePhone(raw))
}

function startCooldown(seconds: number): void {
  if (cooldownTimer) window.clearInterval(cooldownTimer)
  cooldown.value = Math.max(0, Math.floor(seconds || 0))
  cooldownTimer = window.setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 1)
    if (cooldown.value <= 0 && cooldownTimer) {
      window.clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

function resolveErrorMessage(err: any): string {
  const msg = err?.response?.data?.message || err?.response?.data?.msg || err?.message
  return String(msg || '操作失败')
}

async function sendCode(): Promise<void> {
  if (sending.value || cooldown.value > 0) return
  const p = normalizePhone(phone.value)
  if (!isPhoneValid(p)) {
    ElMessage.error('请输入正确的手机号')
    return
  }
  sending.value = true
  try {
    await sendHgPhoneCode(p)
    ElMessage.success('验证码已发送')
    startCooldown(60)
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    sending.value = false
  }
}

async function submitBind(): Promise<void> {
  if (binding.value) return
  const p = normalizePhone(phone.value)
  if (!isPhoneValid(p)) {
    ElMessage.error('请输入正确的手机号')
    return
  }
  binding.value = true
  try {
    const { basic, accountBinding } = await fetchArknightsOfficialBinding(
      p,
      tab.value === 'password'
        ? { password: String(password.value || '') }
        : { phoneCode: String(code.value || '').trim() },
    )
    await bindArknights({ basic, accountBinding })
    ElMessage.success('绑定成功')
    await router.replace({ path: '/user/profile', query: { arkRefresh: String(Date.now()) } })
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    binding.value = false
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer) window.clearInterval(cooldownTimer)
  cooldownTimer = null
})
</script>

<template>
  <main style="padding: 16px">
    <el-card style="max-width: 640px; margin: 0 auto">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
          <div style="font-weight: 700">绑定明日方舟</div>
          <el-button text @click="router.push('/user/profile')">返回</el-button>
        </div>
      </template>

      <el-tabs v-model="tab" stretch>
        <el-tab-pane label="密码登录" name="password">
          <el-form label-width="88px">
            <el-form-item label="手机号">
              <el-input v-model="phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="password" type="password" placeholder="请输入密码" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="binding" @click="submitBind">确认绑定</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="验证码登录" name="code">
          <el-form label-width="88px">
            <el-form-item label="手机号">
              <el-input v-model="phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item label="验证码">
              <div style="display: flex; gap: 10px; width: 100%">
                <el-input v-model="code" placeholder="请输入验证码" />
                <el-button :disabled="cooldown > 0" :loading="sending" @click="sendCode">
                  {{ cooldown > 0 ? `${cooldown}s` : '获取验证码' }}
                </el-button>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="binding" @click="submitBind">确认绑定</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </main>
</template>
