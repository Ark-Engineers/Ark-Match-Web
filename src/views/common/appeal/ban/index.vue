<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { request } from '@/api'

type ApiResponse<T> = { code: number; message: string; data: T }

const route = useRoute()
const router = useRouter()

const active = ref<'appeal' | 'contact'>('appeal')
const loading = ref(false)
const error = ref('')

const form = reactive({
  account: '',
  contact: '',
  content: '',
})

const title = computed(() => (active.value === 'appeal' ? '封禁申诉' : '咨询管理员'))

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '提交失败，请稍后重试'
}

async function submit(): Promise<void> {
  const account = form.account.trim()
  const content = form.content.trim()
  if (!account) {
    ElMessage.warning('请填写账号')
    return
  }
  if (!content) {
    ElMessage.warning('请填写内容')
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await request<ApiResponse<{ id: number }>>({
      url: '/appeal/ban/submit',
      method: 'POST',
      data: {
        account,
        contact: form.contact.trim() || null,
        content,
      },
    })
    if (res.code !== 0) {
      error.value = res.message || '提交失败'
      return
    }
    ElMessage.success(`已提交（单号：${res.data.id}）`)
    form.content = ''
  } catch (e) {
    error.value = resolveErrorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const tab = String(route.query.tab ?? '')
  if (tab === 'contact') active.value = 'contact'
})
</script>

<template>
  <div class="admin-page" style="max-width: 980px; margin: 0 auto">
    <div class="admin-page-header">
      <div>
        <div class="admin-title">{{ title }}</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/login')">返回登录</el-button>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 12px" />

    <el-card shadow="never" class="admin-card">
      <el-tabs v-model="active" class="admin-tabs">
        <el-tab-pane label="提交申诉" name="appeal">
          <el-form label-width="90px" class="admin-query-form" @submit.prevent>
            <el-form-item label="账号">
              <el-input v-model="form.account" placeholder="填写登录账号" clearable />
            </el-form-item>
            <el-form-item label="联系方式">
              <el-input v-model="form.contact" placeholder="邮箱/手机号/微信/QQ（可选）" clearable />
            </el-form-item>
            <el-form-item label="申诉内容">
              <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请描述申诉理由、相关说明等" />
            </el-form-item>
            <el-form-item label=" " label-width="0px">
              <el-button type="primary" :loading="loading" @click="submit" style="width: 100%">提交申诉</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="咨询管理员" name="contact">
          <el-form label-width="90px" class="admin-query-form" @submit.prevent>
            <el-form-item label="账号">
              <el-input v-model="form.account" placeholder="填写登录账号" clearable />
            </el-form-item>
            <el-form-item label="联系方式">
              <el-input v-model="form.contact" placeholder="邮箱/手机号/微信/QQ（可选）" clearable />
            </el-form-item>
            <el-form-item label="咨询内容">
              <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请描述你的问题，我们会由管理员处理" />
            </el-form-item>
            <el-form-item label=" " label-width="0px">
              <el-button type="primary" :loading="loading" @click="submit" style="width: 100%">提交咨询</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

