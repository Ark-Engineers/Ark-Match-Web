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

const featuredRole = ref('')
const signature = ref('')
const birthday = ref('')
const birthdayVisible = ref(true)
const tags = ref<string[]>([])
const tagInput = ref('')
const qq = ref('')
const wechat = ref('')
const email = ref('')
const avatarCharId = ref<string | null>(null)
const avatarCharName = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)

// --- 头像选择 ---
const avatarOpen = ref(false)
const avatarKeyword = ref('')
const avatarLoading = ref(false)
const avatarOptions = ref<AvatarOption[]>([])
/** 今天日期（YYYY-MM-DD），用于生日最大值 */
const today = new Date().toISOString().slice(0, 10)
/** 是否用户主动改动过头像（避免普通保存时误清空头像） */
const avatarTouched = ref(false)
/** 预览头像加载失败标记；切换头像时重置，保证换图后能重新尝试渲染 */
const avatarPreviewError = ref(false)
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
    featuredRole.value = profile.featuredRole || ''
    signature.value = profile.signature || ''
    birthday.value = profile.birthday || ''
    birthdayVisible.value = profile.birthdayVisible ?? true
    tags.value = (profile.tags || []).slice(0, 3)
    qq.value = profile.qq || ''
    wechat.value = profile.wechat || ''
    email.value = profile.email || ''
    avatarCharId.value = profile.avatarCharId || null
    avatarCharName.value = profile.avatarCharName || null
    avatarUrl.value = profile.avatarUrl || null
    avatarPreviewError.value = false
  }
  loading.value = false
})

// --- 标签输入（最多 3 个） ---
function addTag(): void {
  const tag = tagInput.value.trim()
  if (!tag) { tagInput.value = ''; return }
  if (tags.value.length >= 3) { ui.showToast('最多添加 3 个标签', 'info'); return }
  if (!tags.value.includes(tag)) tags.value.push(tag)
  tagInput.value = ''
}
function removeTag(index: number): void {
  tags.value.splice(index, 1)
}

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
  avatarCharName.value = opt.name
  avatarUrl.value = opt.avatarUrl
  avatarTouched.value = true
  avatarPreviewError.value = false
  ui.showToast('已选择头像，点击保存生效', 'success')
}

async function handleSave() {
  saving.value = true
  try {
    await updateProfile({
      featuredRole: featuredRole.value.trim() || null,
      signature: signature.value.trim() || null,
      birthday: birthday.value || null,
      birthdayVisible: birthdayVisible.value,
      tags: tags.value.slice(0, 3),
      qq: qq.value.trim() || null,
      wechat: wechat.value.trim() || null,
      email: email.value.trim() || null,
      avatarCharId: avatarTouched.value ? (avatarCharId.value || '') : undefined,
      avatarCharName: avatarTouched.value ? (avatarCharName.value || '') : undefined,
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
            <div class="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl text-gray-300 shrink-0 bg-transparent">
              <img v-if="currentAvatar && !avatarPreviewError" :src="currentAvatar" alt="头像" referrerpolicy="no-referrer"
                   class="w-full h-full object-cover" @error="avatarPreviewError = true" />
              <span v-else>{{ (auth.profile?.nickname || '用').charAt(0)?.toUpperCase() || '👤' }}</span>
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
              <label class="block text-gray-400 text-xs mb-1">主打干员</label>
              <input v-model="featuredRole" placeholder="如：阿米娅"
                     class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">个人简介</label>
              <textarea v-model="signature" rows="3" maxlength="500" placeholder="介绍一下自己..."
                        class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 resize-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-gray-400 text-xs mb-1">生日</label>
                <input v-model="birthday" type="date" min="1970-01-01" :max="today"
                       class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div class="flex items-end pb-2">
                <label class="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
                  <input v-model="birthdayVisible" type="checkbox" class="accent-cyan-500" />
                  生日公开
                </label>
              </div>
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">标签（最多 3 个）</label>
              <div class="flex flex-wrap gap-2 mb-2">
                <span v-for="(tag, i) in tags" :key="tag"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
                  {{ tag }}
                  <button class="text-gray-400 hover:text-white transition cursor-pointer" @click="removeTag(i)">&times;</button>
                </span>
              </div>
              <div class="flex gap-2">
                <input v-model="tagInput" placeholder="输入后回车添加" @keyup.enter.prevent="addTag"
                       class="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
                <button class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition cursor-pointer"
                        @click="addTag">添加</button>
              </div>
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">QQ</label>
              <input v-model="qq" placeholder="选填" class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">微信</label>
              <input v-model="wechat" placeholder="选填" class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label class="block text-gray-400 text-xs mb-1">邮箱</label>
              <input v-model="email" type="email" placeholder="选填" class="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50" />
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
            <img :src="av.avatarUrl" :alt="av.name" referrerpolicy="no-referrer"
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