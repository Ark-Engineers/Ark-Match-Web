<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

type ProfileResponse = {
  userId: number
  account: string
  nickname: string
  avatarUrl: string | null
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
}

type UpdateProfileRequest = {
  featuredRole?: string | null
  signature?: string | null
  birthday?: string | null
  birthdayVisible?: boolean | null
  tags?: string[]
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

async function loadProfile(): Promise<void> {
  if (!targetUserId.value) return
  loading.value = true
  try {
    const url = isOwner.value ? '/user/profile' : `/user/profile/${targetUserId.value}`
    const res = await request<ApiResponse<ProfileResponse>>({ url, method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载失败')
      return
    }
    profile.value = res.data

    form.featuredRole = res.data.featuredRole || ''
    form.signature = res.data.signature || ''
    form.birthday = res.data.birthday || ''
    form.birthdayVisible = Boolean(res.data.birthdayVisible)
    form.tags = Array.isArray(res.data.tags) ? [...res.data.tags] : []

    if (isOwner.value) {
      form.qq = String(res.data.qq || '')
      form.wechat = String(res.data.wechat || '')
      form.email = String(res.data.email || '')
    } else {
      form.qq = ''
      form.wechat = ''
      form.email = ''
    }
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

async function save(): Promise<void> {
  if (!isOwner.value) return
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
      wechat: form.wechat.trim() || '',
      email: form.email.trim() || '',
    }
    const res = await request<ApiResponse<ProfileResponse>>({ url: '/user/profile', method: 'PUT', data: payload })
    if (res.code !== 0) {
      ElMessage.error(res.message || '保存失败')
      return
    }
    ElMessage.success('已保存')
    profile.value = res.data
    await router.push('/home')
  } finally {
    saving.value = false
  }
}

watch(
  () => route.params.userId,
  async () => {
    await loadProfile()
  },
)

onMounted(async () => {
  await loadProfile()
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
          <el-button v-if="isOwner" type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="主推角色">
          <el-input v-model="form.featuredRole" :disabled="!isOwner" placeholder="暂时占位，后续再定枚举" clearable />
        </el-form-item>

        <el-form-item label="个性签名">
          <el-input v-model="form.signature" :disabled="!isOwner" type="textarea" :rows="3" maxlength="255" show-word-limit />
        </el-form-item>

        <el-form-item label="地区（省市）">
          <el-input :model-value="profile?.region || '未知'" disabled />
        </el-form-item>

        <el-form-item label="生日">
          <el-date-picker v-model="form.birthday" :disabled="!isOwner" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>

        <el-form-item label="生日对外可见">
          <el-switch v-model="form.birthdayVisible" :disabled="!isOwner" />
        </el-form-item>

        <el-form-item label="年龄">
          <el-input :model-value="profile?.age != null ? String(profile.age) : ''" disabled />
        </el-form-item>

        <el-form-item label="Tag（最多3个）">
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px">
            <el-tag v-for="t in form.tags" :key="t" :disable-transitions="true" :closable="isOwner" @close="removeTag(t)">
              {{ t }}
            </el-tag>
          </div>
          <div v-if="isOwner" style="display: flex; gap: 8px">
            <el-input v-model="form.tagInput" placeholder="输入标签后回车或点击添加" maxlength="16" @keyup.enter="addTag" />
            <el-button :disabled="form.tags.length >= 3" @click="addTag">添加</el-button>
          </div>
        </el-form-item>

        <template v-if="isOwner">
          <el-divider />
          <el-form-item label="QQ（加密存储）">
            <el-input v-model="form.qq" clearable />
          </el-form-item>
          <el-form-item label="微信（加密存储）">
            <el-input v-model="form.wechat" clearable />
          </el-form-item>
          <el-form-item label="邮箱（加密存储）">
            <el-input v-model="form.email" clearable />
          </el-form-item>
        </template>
      </el-form>
    </el-card>
  </main>
</template>
