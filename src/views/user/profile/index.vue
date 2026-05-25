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

type AvatarOption = {
  id: string
  name: string
  rarity: number | null
  avatarUrl: string
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

function buildAvatarUrl(id: string): string {
  return `https://web.hycdn.cn/arknights/game/assets/char/avatar/${id}.png`
}

const currentAvatarUrl = computed(() => {
  if (avatarTouched.value) {
    return selectedAvatarId.value ? buildAvatarUrl(selectedAvatarId.value) : null
  }
  return profile.value?.avatarUrl || null
})

const currentAvatarName = computed(() => {
  if (avatarTouched.value) return selectedAvatarName.value || ''
  return profile.value?.avatarCharName || ''
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

    avatarTouched.value = false
    selectedAvatarId.value = res.data.avatarCharId || null
    selectedAvatarName.value = res.data.avatarCharName || null

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

async function ensureAvatarOptionsLoaded(): Promise<void> {
  if (avatarOptions.value.length > 0) return
  avatarOptionsLoading.value = true
  try {
    const res = await request<ApiResponse<AvatarOption[]>>({ url: '/user/profile/avatar-options', method: 'GET' })
    if (res.code !== 0) {
      ElMessage.error(res.message || '加载头像列表失败')
      return
    }
    avatarOptions.value = Array.isArray(res.data) ? res.data : []
  } finally {
    avatarOptionsLoading.value = false
  }
}

async function openAvatarDialog(): Promise<void> {
  if (!isOwner.value) return
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
      avatarCharId: avatarTouched.value ? (selectedAvatarId.value || '') : undefined,
      avatarCharName: avatarTouched.value ? (selectedAvatarName.value || '') : undefined,
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

watch(
  () => avatarKeyword.value,
  () => {
    avatarPage.value = 1
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
                v-if="currentAvatarUrl"
                :src="currentAvatarUrl"
                :alt="currentAvatarName"
                referrerpolicy="no-referrer"
                loading="lazy"
                decoding="async"
                style="width: 64px; height: 64px; object-fit: cover"
              />
              <span v-else style="font-weight: 700">{{ (profile?.nickname || '').slice(0, 1) }}</span>
            </div>
            <template v-if="isOwner">
              <el-button @click="openAvatarDialog">选择头像</el-button>
              <el-button :disabled="!currentAvatarUrl" @click="clearAvatar">清除</el-button>
            </template>
          </div>
        </el-form-item>

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
          <el-form-item label="QQ">
            <el-input v-model="form.qq" clearable />
          </el-form-item>
          <el-form-item label="微信">
            <el-input v-model="form.wechat" clearable />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" clearable />
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
