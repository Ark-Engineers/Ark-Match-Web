<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { updateProfile, getAvatarOptions, resolveArkAvatarUrl } from '@/api/user'
import type { AvatarOption } from '@/api/user'
import UiCard from '@/components/UiCard.vue'
import UiButton from '@/components/UiButton.vue'
import UiSpinner from '@/components/UiSpinner.vue'
import UiModal from '@/components/UiModal.vue'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const nickname = ref('')
const gender = ref('')
const bio = ref('')
const birthYear = ref<number | null>(null)
const avatarCharId = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)

// --- 头像选择 ---
const avatarOpen = ref(false)
const avatarKeyword = ref('')
const avatarLoading = ref(false)
const avatarOptions = ref<AvatarOption[]>([])
const filteredAvatars = computed(() => {
  const kw = avatarKeyword.value.trim().toLowerCase()
  if (!kw) return avatarOptions.value
  return avatarOptions.value.filter(a => a.name.toLowerCase().includes(kw))
})

// 当前展示头像：优先 CDN charId，回落后端 avatarUrl
const currentAvatar = computed(() =>
  resolveArkAvatarUrl(avatarCharId.value, avatarUrl.value),
)

onMounted(async () => {
  loading.value = true
  const profile = await auth.fetchProfile()
  if (profile) {
    nickname.value = profile.nickname || ''
    gender.value = profile.gender || ''
    bio.value = profile.bio || ''
    birthYear.value = profile.birthYear || null
    avatarCharId.value = profile.avatarCharId || null
    avatarUrl.value = profile.avatarUrl || null
  }
  loading.value = false
})

async function openAvatarPicker() {
  avatarOpen.value = true
  avatarKeyword.value = ''
  if (avatarOptions.value.length) return
  avatarLoading.value = true
  try {
    avatarOptions.value = await getAvatarOptions()
  } catch (e: any) {
    ui.showToast(e.message || '加载头像失败', 'error')
  } finally {
    avatarLoading.value = false
  }
}

function pickAvatar(opt: AvatarOption) {
  avatarCharId.value = opt.id
  avatarUrl.value = opt.avatarUrl
  ui.showToast('已选择头像，点击保存生效', 'success')
}

async function handleSave() {
  saving.value = true
  try {
    await updateProfile({
      nickname: nickname.value || undefined,
      gender: gender.value || undefined,
      bio: bio.value || undefined,
      birthYear: birthYear.value || undefined,
      avatarUrl: currentAvatar.value || undefined,
    })
    await auth.fetchProfile()
    ui.showToast('资料已保存', 'success')
    router.back()
  } catch (e: any) {
    ui.showToast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-lg mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-8">
        <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="router.back()">&larr; 返回</button>
        <h1 class="text-xl font-bold text-white">编辑资料</h1>
      </div>

      <UiSpinner v-if="loading" label="加载中..." />

      <div v-else class="space-y-6">
        <!-- Avatar -->
        <UiCard>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center text-2xl text-gray-300 shrink-0">
              <img v-if="currentAvatar" :src="currentAvatar" alt="头像" class="w-full h-full object-cover"
                   @error="(e:any) => (e.target.style.display='none')" />
              <span v-else>{{ nickname.charAt(0)?.toUpperCase() || '👤' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-white font-medium">{{ auth.profile?.nickname || '用户' }}</p>
              <button
                class="mt-1 text-xs text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                @click="openAvatarPicker"
              >更换头像 ›</button>
            </div>
          </div>
        </UiCard>

        <!-- Form fields -->
        <UiCard>
          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-xs mb-1">昵称</label>
              <input v-model="nickname"
                     class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">性别</label>
              <select v-model="gender"
                      class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none">
                <option value="">未设置</option>
                <option value="MALE">男</option>
                <option value="FEMALE">女</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">出生年份</label>
              <input v-model.number="birthYear" type="number" placeholder="如 2000"
                     class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                     min="1970" :max="new Date().getFullYear()" />
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">个人简介</label>
              <textarea v-model="bio" rows="3" maxlength="500" placeholder="介绍一下自己..."
                        class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 resize-none" />
            </div>
          </div>
        </UiCard>

        <div class="flex gap-3">
          <UiButton variant="secondary" @click="router.back()">取消</UiButton>
          <UiButton :loading="saving" @click="handleSave" block>保存</UiButton>
        </div>
      </div>
    </div>

    <!-- 头像选择对话框 -->
    <UiModal :show="avatarOpen" @close="avatarOpen = false">
      <div class="p-6">
        <h2 class="text-lg font-semibold text-white mb-4">选择头像</h2>
        <input
          v-model="avatarKeyword"
          type="text"
          placeholder="搜索干员名..."
          class="w-full px-3 py-2 mb-4 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
        />
        <div v-if="avatarLoading" class="py-10 text-center text-gray-500 text-sm">加载头像中...</div>
        <div v-else-if="filteredAvatars.length === 0" class="py-10 text-center text-gray-500 text-sm">未找到匹配头像</div>
        <div v-else class="grid grid-cols-5 gap-3 max-h-[50vh] overflow-y-auto pr-1">
          <button
            v-for="av in filteredAvatars"
            :key="av.id"
            class="group flex flex-col items-center gap-1 p-2 rounded-lg border transition cursor-pointer"
            :class="avatarCharId === av.id
              ? 'border-cyan-500/60 bg-cyan-500/10'
              : 'border-gray-800 hover:border-gray-600 bg-gray-900'"
            @click="pickAvatar(av)"
          >
            <img :src="av.avatarUrl" :alt="av.name"
                 class="w-12 h-12 rounded-lg object-cover bg-gray-800" loading="lazy" />
            <span class="text-[10px] text-gray-400 truncate w-full text-center">{{ av.name }}</span>
          </button>
        </div>
        <div class="mt-5 flex gap-3">
          <UiButton variant="secondary" block @click="avatarOpen = false">完成</UiButton>
        </div>
      </div>
    </UiModal>
  </div>
</template>