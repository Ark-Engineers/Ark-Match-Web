<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { getArknightsAvatarOptions, type AvatarOption } from '@/api/arknights-avatar'
import { resolveArkAvatarUrl } from '@/api/user'

import ArknightsBindSection from './ArknightsBindSection.vue'

type ApiResponse<T> = { code: number; message: string; data: T }

type ProfileResponse = {
  userId: number
  account: string
  nickname: string
  loginEmail: string | null
  avatarUrl: string | null
  avatarCharId: string | null
  avatarCharName: string | null
  featuredRole: string | null
  signature: string | null
  region: string | null
  age: number | null
  birthday: string | null
  birthdayVisible: boolean | null
  tags: string[]
  qq: string | null
  wechat: string | null
  email: string | null
  lmdBalance: number
}

type UpdateProfileRequest = {
  featuredRole?: string | null
  signature?: string | null
  birthday?: string | null
  birthdayVisible?: boolean | null
  tags?: string[]
  avatarCharId?: string | null
  avatarCharName?: string | null
  qq?: string | null
  wechat?: string | null
  email?: string | null
}

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)

const selfUserId = computed(() => {
  const raw = authStore.session?.userId
  const n = Number(raw ?? 0)
  return Number.isFinite(n) ? n : 0
})

const targetUserId = computed(() => {
  const raw = route.params.userId
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return selfUserId.value
})

const isOwner = computed(() => targetUserId.value === selfUserId.value)
const myRole = computed(() => String(authStore.session?.role || '').toUpperCase())
const isSuperAdmin = computed(() => myRole.value === 'SUPER_ADMIN')
const isAdminRole = computed(() => myRole.value === 'ADMIN' || myRole.value === 'SUPER_ADMIN')
const canEdit = computed(() => isOwner.value && !isSuperAdmin.value)

const form = reactive({
  featuredRole: '',
  signature: '',
  birthday: '',
  birthdayVisible: false,
  tags: [] as string[],
  tagInput: '',
  qq: '',
  wechat: '',
  email: '',
})

const profile = ref<ProfileResponse | null>(null)

const security = reactive({
  nickname: '',
  nicknameSaving: false,
  loginEmail: '',
  password: '',
  confirmPassword: '',
  passwordEmailCode: '',
  passwordCodeSending: false,
  passwordCodeCooldown: 0,
  newLoginEmail: '',
  emailEmailCode: '',
  emailCodeSending: false,
  emailCodeCooldown: 0,
})

let passwordCooldownTimer: number | null = null
let emailCooldownTimer: number | null = null

function resolveErrorMessage(err: any): string {
  const msg = err?.response?.data?.message || err?.message
  return String(msg || '操作失败')
}

function startCooldown(kind: 'password' | 'email', seconds: number): void {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (kind === 'password') {
    if (passwordCooldownTimer) clearInterval(passwordCooldownTimer)
    security.passwordCodeCooldown = s
    passwordCooldownTimer = window.setInterval(() => {
      security.passwordCodeCooldown = Math.max(0, security.passwordCodeCooldown - 1)
      if (security.passwordCodeCooldown <= 0 && passwordCooldownTimer) {
        clearInterval(passwordCooldownTimer)
        passwordCooldownTimer = null
      }
    }, 1000)
    return
  }
  if (emailCooldownTimer) clearInterval(emailCooldownTimer)
  security.emailCodeCooldown = s
  emailCooldownTimer = window.setInterval(() => {
    security.emailCodeCooldown = Math.max(0, security.emailCodeCooldown - 1)
    if (security.emailCodeCooldown <= 0 && emailCooldownTimer) {
      clearInterval(emailCooldownTimer)
      emailCooldownTimer = null
    }
  }, 1000)
}

const avatarDialogOpen = ref(false)
const avatarOptionsLoading = ref(false)
const avatarOptions = ref<AvatarOption[]>([])
const avatarKeyword = ref('')
const avatarTouched = ref(false)
const avatarPage = ref(1)
const avatarPageSize = ref(60)

const selectedAvatarId = ref<string | null>(null)
const selectedAvatarName = ref<string | null>(null)
const avatarTempId = ref<string | null>(null)
const avatarTempName = ref<string | null>(null)

const currentAvatarUrl = computed(() => {
  if (avatarTouched.value) {
    return selectedAvatarId.value ? resolveArkAvatarUrl(selectedAvatarId.value, null) : null
  }
  return profile.value?.avatarUrl || null
})

const currentAvatarName = computed(() => {
  if (avatarTouched.value) return selectedAvatarName.value || ''
  return profile.value?.avatarCharName || ''
})

/** 预览头像加载失败标记；src 变化时自动重置，避免一次失败后永久显示占位 */
const previewAvatarError = ref(false)
watch(currentAvatarUrl, () => {
  previewAvatarError.value = false
})

const filteredAvatarOptions = computed(() => {
  const kw = avatarKeyword.value.trim()
  if (!kw) return avatarOptions.value
  return avatarOptions.value.filter((x) => x.name.includes(kw) || x.id.includes(kw))
})

const pagedAvatarOptions = computed(() => {
  const list = filteredAvatarOptions.value
  const size = Math.max(1, avatarPageSize.value)
  const page = Math.max(1, avatarPage.value)
  const start = (page - 1) * size
  return list.slice(start, start + size)
})

async function loadProfile(): Promise<void> {
  if (!targetUserId.value) return
  loading.value = true
  try {
    const url = isOwner.value ? '/user/profile' : `/user/profile/${targetUserId.value}`
    const res = await request<ApiResponse<ProfileResponse>>({ url, method: 'GET' })
    profile.value = res.data

    form.featuredRole = res.data.featuredRole || ''
    form.signature = res.data.signature || ''
    form.birthday = res.data.birthday || ''
    form.birthdayVisible = Boolean(res.data.birthdayVisible)
    form.tags = Array.isArray(res.data.tags) ? [...res.data.tags] : []

    avatarTouched.value = false
    selectedAvatarId.value = res.data.avatarCharId || null
    selectedAvatarName.value = res.data.avatarCharName || null

    if (isOwner.value) {
      form.qq = String(res.data.qq || '')
      form.wechat = String(res.data.wechat || '')
      form.email = String(res.data.email || '')
      security.nickname = String(res.data.nickname || '')
      security.loginEmail = String(res.data.loginEmail || '')
      security.newLoginEmail = ''
    } else {
      form.qq = ''
      form.wechat = ''
      form.email = ''
    }
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function addTag(): void {
  const text = String(form.tagInput || '').trim()
  if (!text) return
  if (form.tags.includes(text)) {
    form.tagInput = ''
    return
  }
  if (form.tags.length >= 3) return
  form.tags.push(text)
  form.tagInput = ''
}

function removeTag(tag: string): void {
  form.tags = form.tags.filter((t) => t !== tag)
}

async function ensureAvatarOptionsLoaded(): Promise<void> {
  if (avatarOptions.value.length > 0) return
  avatarOptionsLoading.value = true
  try {
    avatarOptions.value = await getArknightsAvatarOptions()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    avatarOptionsLoading.value = false
  }
}

async function openAvatarDialog(): Promise<void> {
  if (!canEdit.value) return
  avatarKeyword.value = ''
  avatarPage.value = 1
  avatarTempId.value = selectedAvatarId.value
  avatarTempName.value = selectedAvatarName.value
  avatarDialogOpen.value = true
  await ensureAvatarOptionsLoaded()
}

function selectAvatar(opt: AvatarOption): void {
  avatarTempId.value = opt.id
  avatarTempName.value = opt.name
}

function clearAvatar(): void {
  selectedAvatarId.value = null
  selectedAvatarName.value = null
  avatarTouched.value = true
}

function confirmAvatar(): void {
  selectedAvatarId.value = avatarTempId.value
  selectedAvatarName.value = avatarTempName.value
  avatarTouched.value = true
  avatarDialogOpen.value = false
}

async function save(): Promise<void> {
  if (!canEdit.value) return
  if (saving.value) return
  saving.value = true
  try {
    const payload: UpdateProfileRequest = {
      featuredRole: form.featuredRole.trim() || null,
      signature: form.signature.trim() || null,
      birthday: form.birthday.trim() || null,
      birthdayVisible: Boolean(form.birthdayVisible),
      tags: form.tags.slice(0, 3),
      qq: form.qq.trim() || '',
      avatarCharId: avatarTouched.value ? (selectedAvatarId.value || '') : undefined,
      avatarCharName: avatarTouched.value ? (selectedAvatarName.value || '') : undefined,
      wechat: form.wechat.trim() || '',
      email: form.email.trim() || '',
    }
    const res = await request<ApiResponse<ProfileResponse>>({ url: '/user/profile', method: 'PUT', data: payload })
    ElMessage.success('已保存')
    profile.value = res.data
    await router.push('/home')
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    saving.value = false
  }
}

async function saveNickname(): Promise<void> {
  if (!canEdit.value) return
  const nick = String(security.nickname || '').trim()
  if (!nick) {
    ElMessage.warning('昵称不能为空')
    return
  }
  if (nick.length > 64) {
    ElMessage.warning('昵称长度不能超过64')
    return
  }
  if (security.nicknameSaving) return
  security.nicknameSaving = true
  try {
    await request({ url: '/user/security/nickname', method: 'POST', data: { nickname: nick } })
    ElMessage.success('昵称已修改')
    await loadProfile()
    await authStore.fetchProfile()
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    security.nicknameSaving = false
  }
}

async function sendPasswordEmailCode(): Promise<void> {
  if (!canEdit.value) return
  if (security.passwordCodeCooldown > 0) return
  if (security.passwordCodeSending) return
  security.passwordCodeSending = true
  try {
    await request({ url: '/user/security/password/email-code/send', method: 'POST' })
    ElMessage.success('验证码已发送')
    startCooldown('password', 60)
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    security.passwordCodeSending = false
  }
}

async function changePassword(): Promise<void> {
  if (!canEdit.value) return
  const pwd = String(security.password || '')
  const confirmPwd = String(security.confirmPassword || '')
  const code = String(security.passwordEmailCode || '').trim()
  if (pwd.length < 6 || pwd.length > 64) {
    ElMessage.warning('密码长度需在6~64之间')
    return
  }
  if (pwd !== confirmPwd) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    ElMessage.warning('请输入6位邮箱验证码')
    return
  }
  try {
    await request({ url: '/user/security/password', method: 'POST', data: { password: pwd, emailCode: code } })
    ElMessage.success('密码已修改，请重新登录')
    authStore.clearAllClientAuthState()
    await router.push('/login')
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  }
}

async function sendEmailEmailCode(): Promise<void> {
  if (!canEdit.value) return
  if (security.emailCodeCooldown > 0) return
  if (security.emailCodeSending) return
  security.emailCodeSending = true
  try {
    await request({ url: '/user/security/email/email-code/send', method: 'POST' })
    ElMessage.success('验证码已发送')
    startCooldown('email', 60)
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    security.emailCodeSending = false
  }
}

async function changeLoginEmail(): Promise<void> {
  if (!canEdit.value) return
  const email = String(security.newLoginEmail || '').trim()
  const code = String(security.emailEmailCode || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ElMessage.warning('请输入正确的邮箱格式')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    ElMessage.warning('请输入6位邮箱验证码')
    return
  }
  try {
    await request({ url: '/user/security/email', method: 'POST', data: { email, emailCode: code } })
    ElMessage.success('登录邮箱已修改，请重新登录')
    authStore.clearAllClientAuthState()
    await router.push('/login')
  } catch (e: any) {
    ElMessage.error(resolveErrorMessage(e))
  }
}

watch(
  () => route.params.userId,
  async () => {
    await loadProfile()
  },
)

watch(
  () => avatarKeyword.value,
  () => {
    avatarPage.value = 1
  },
)

onMounted(async () => {
  await loadProfile()
})

onBeforeUnmount(() => {
  if (passwordCooldownTimer) clearInterval(passwordCooldownTimer)
  passwordCooldownTimer = null
  if (emailCooldownTimer) clearInterval(emailCooldownTimer)
  emailCooldownTimer = null
})
</script>

<template>
  <main style="padding: 16px">
    <el-card v-loading="loading" style="max-width: 720px; margin: 0 auto">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div style="font-weight: 700">个人信息</div>
            <div style="font-size: 12px; opacity: 0.7">
              <span v-if="profile">账号：{{ profile.account }} / 昵称：{{ profile.nickname }}</span>
            </div>
          </div>
          <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>

      <el-form label-position="top">
        <div
          v-if="isOwner && isAdminRole"
          style="
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--el-color-warning);
            background: var(--el-color-warning-light-9);
            margin-bottom: 14px;
          "
        >
          <div style="font-weight: 700; color: var(--el-color-warning)">管理员身份</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px">
            权限等级：{{ myRole === 'SUPER_ADMIN' ? '超级管理员' : '管理员' }}
          </div>
        </div>

        <div
          v-if="isOwner && isSuperAdmin"
          style="
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--el-color-danger);
            background: var(--el-color-danger-light-9);
            margin-bottom: 14px;
          "
        >
          <div style="font-weight: 700; color: var(--el-color-danger)">超级管理员账号禁止修改个人资料</div>
          <div style="font-size: 12px; opacity: 0.85; margin-top: 4px">昵称 / 密码 / 登录邮箱均保持系统预设状态</div>
        </div>

        <el-form-item v-if="isOwner" label="昵称">
          <div style="display: flex; gap: 10px; align-items: center; width: 100%">
            <el-input v-model="security.nickname" :disabled="!canEdit" maxlength="64" show-word-limit />
            <el-button v-if="canEdit" type="primary" :loading="security.nicknameSaving" @click="saveNickname">修改</el-button>
          </div>
        </el-form-item>

        <el-form-item label="龙门币">
          <div style="display: flex; gap: 10px; align-items: center; width: 100%">
            <el-input :model-value="String(profile?.lmdBalance ?? 0)" disabled style="flex: 1" />
            <el-button v-if="isOwner" @click="router.push('/user/lmd')">查看流水</el-button>
          </div>
        </el-form-item>

        <el-form-item label="头像">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
            <div
              style="
                width: 64px;
                height: 64px;
                border-radius: 50%;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--el-fill-color-light);
                border: 1px solid var(--el-border-color);
              "
            >
              <img
                v-if="currentAvatarUrl && !previewAvatarError"
                :src="currentAvatarUrl"
                :alt="currentAvatarName"
                referrerpolicy="no-referrer"
                loading="lazy"
                decoding="async"
                style="width: 64px; height: 64px; object-fit: cover"
                @error="previewAvatarError = true"
              />
              <span v-else style="font-weight: 700">{{ (profile?.nickname || '').slice(0, 1) }}</span>
            </div>
            <template v-if="canEdit">
              <el-button @click="openAvatarDialog">选择头像</el-button>
              <el-button :disabled="!currentAvatarUrl" @click="clearAvatar">清除</el-button>
            </template>
          </div>
        </el-form-item>

        <el-form-item label="主推角色">
          <el-input v-model="form.featuredRole" :disabled="!canEdit" placeholder="暂时占位，后续再定枚举" clearable />
        </el-form-item>

        <el-form-item label="个性签名">
          <el-input v-model="form.signature" :disabled="!canEdit" type="textarea" :rows="3" maxlength="255" show-word-limit />
        </el-form-item>

        <el-form-item label="地区（省市）">
          <el-input :model-value="profile?.region || '未知'" disabled />
        </el-form-item>

        <el-form-item label="生日">
          <el-date-picker v-model="form.birthday" :disabled="!canEdit" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>

        <el-form-item label="生日对外可见">
          <el-switch v-model="form.birthdayVisible" :disabled="!canEdit" />
        </el-form-item>

        <el-form-item label="年龄">
          <el-input :model-value="profile?.age != null ? String(profile.age) : ''" disabled />
        </el-form-item>

        <el-form-item label="Tag（最多3个）">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px">
            <el-tag v-for="t in form.tags" :key="t" :disable-transitions="true" :closable="canEdit" @close="removeTag(t)">
              {{ t }}
            </el-tag>
          </div>
          <div v-if="canEdit" style="display: flex; gap: 8px">
            <el-input v-model="form.tagInput" placeholder="输入标签后回车或点击添加" maxlength="16" @keyup.enter="addTag" />
            <el-button :disabled="form.tags.length >= 3" @click="addTag">添加</el-button>
          </div>
        </el-form-item>

        <template v-if="isOwner">
          <el-divider />
          <el-form-item label="QQ">
            <el-input v-model="form.qq" :disabled="!canEdit" clearable />
          </el-form-item>
          <el-form-item label="微信">
            <el-input v-model="form.wechat" :disabled="!canEdit" clearable />
          </el-form-item>
          <el-form-item label="联系邮箱">
            <el-input v-model="form.email" :disabled="!canEdit" clearable />
          </el-form-item>
        </template>

        <ArknightsBindSection v-if="isOwner" :editable="canEdit" />

        <template v-if="canEdit">
          <el-divider />
          <el-form-item label="修改密码（需邮箱验证码）">
            <div style="display: flex; flex-direction: column; gap: 10px; width: 100%">
              <el-input v-model="security.password" type="password" show-password placeholder="新密码（6~64位）" />
              <el-input v-model="security.confirmPassword" type="password" show-password placeholder="确认新密码" />
              <div style="display: flex; gap: 10px; align-items: center">
                <el-input v-model="security.passwordEmailCode" placeholder="邮箱验证码（6位）" maxlength="6" style="flex: 1" />
                <el-button
                  :loading="security.passwordCodeSending"
                  :disabled="security.passwordCodeCooldown > 0"
                  @click="sendPasswordEmailCode"
                >
                  {{ security.passwordCodeCooldown > 0 ? `${security.passwordCodeCooldown}s` : '获取验证码' }}
                </el-button>
              </div>
              <div>
                <el-button type="primary" @click="changePassword">提交修改</el-button>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="修改登录邮箱（需邮箱验证码）">
            <div style="display: flex; flex-direction: column; gap: 10px; width: 100%">
              <el-input :model-value="security.loginEmail" disabled />
              <el-input v-model="security.newLoginEmail" placeholder="新登录邮箱" clearable />
              <div style="display: flex; gap: 10px; align-items: center">
                <el-input v-model="security.emailEmailCode" placeholder="邮箱验证码（6位）" maxlength="6" style="flex: 1" />
                <el-button
                  :loading="security.emailCodeSending"
                  :disabled="security.emailCodeCooldown > 0"
                  @click="sendEmailEmailCode"
                >
                  {{ security.emailCodeCooldown > 0 ? `${security.emailCodeCooldown}s` : '获取验证码' }}
                </el-button>
              </div>
              <div>
                <el-button type="primary" @click="changeLoginEmail">提交修改</el-button>
              </div>
            </div>
          </el-form-item>
        </template>
      </el-form>
    </el-card>

    <el-dialog v-model="avatarDialogOpen" title="选择头像" width="860px">
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px">
        <el-input v-model="avatarKeyword" placeholder="搜索名称/ID" clearable style="max-width: 320px" />
        <div style="font-size: 12px; opacity: 0.7">共 {{ filteredAvatarOptions.length }} 个</div>
      </div>

      <div v-loading="avatarOptionsLoading">
        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
            gap: 10px;
          "
        >
          <div
            v-for="opt in pagedAvatarOptions"
            :key="opt.id"
            @click="selectAvatar(opt)"
            :style="{
              border: opt.id === avatarTempId ? '2px solid var(--el-color-primary)' : '1px solid var(--el-border-color)',
              borderRadius: '10px',
              padding: '10px 8px',
              cursor: 'pointer',
              userSelect: 'none',
            }"
          >
            <div style="display: flex; justify-content: center; margin-bottom: 6px">
              <img
                :src="opt.avatarUrl"
                :alt="opt.name"
                referrerpolicy="no-referrer"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                style="width: 56px; height: 56px; border-radius: 12px"
              />
            </div>
            <div style="font-size: 12px; font-weight: 600; text-align: center; line-height: 1.2">
              {{ opt.name }}
            </div>
            <div style="font-size: 11px; opacity: 0.7; text-align: center; margin-top: 4px">
              {{ opt.rarity != null ? `${opt.rarity + 1}★` : '' }}
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 12px">
          <el-pagination
            v-model:current-page="avatarPage"
            v-model:page-size="avatarPageSize"
            :total="filteredAvatarOptions.length"
            :page-sizes="[40, 60, 80, 120]"
            layout="sizes, prev, pager, next"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="avatarDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmAvatar">确定</el-button>
      </template>
    </el-dialog>
  </main>
</template>
