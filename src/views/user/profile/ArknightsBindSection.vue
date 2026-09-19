<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { getArknightsBindingStatus, unbindArknights, type ArknightsBindingStatus } from '@/api/user'

const props = defineProps<{
  editable: boolean
}>()

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const unbinding = ref(false)
const status = ref<ArknightsBindingStatus | null>(null)

function resolveErrorMessage(error: any): string {
  return String(error?.response?.data?.message || error?.message || '操作失败')
}

async function loadStatus(): Promise<void> {
  loading.value = true
  try {
    status.value = await getArknightsBindingStatus()
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function startBinding(): Promise<void> {
  if (!props.editable) return
  await router.push('/user/ark-bind')
}

async function unbind(): Promise<void> {
  if (!props.editable || unbinding.value) return
  try {
    await ElMessageBox.confirm('解绑后将清空已保存的明日方舟资料，是否继续？', '确认解绑', {
      type: 'warning',
      confirmButtonText: '解绑',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  unbinding.value = true
  try {
    await unbindArknights()
    status.value = {
      bound: false,
      isMinor: null,
      isAdult: null,
      hgId: null,
      uid: null,
      nickName: null,
      channelName: null,
      boundAt: null,
    }
    ElMessage.success('已解绑')
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error))
  } finally {
    unbinding.value = false
  }
}

function formatBoundAt(value: string | null): string {
  return value ? value.replace('T', ' ') : '-'
}

onMounted(loadStatus)

watch(
  () => route.query.arkRefresh,
  () => {
    void loadStatus()
  },
)
</script>

<template>
  <el-divider />
  <el-form-item label="明日方舟" v-loading="loading">
    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%">
      <template v-if="status?.bound">
        <el-tag type="success">已绑定</el-tag>
        <span>{{ status.nickName }}</span>
        <span style="font-size: 12px; opacity: 0.72">UID：{{ status.uid }}</span>
        <span style="font-size: 12px; opacity: 0.72">区服：{{ status.channelName }}</span>
        <span style="font-size: 12px; opacity: 0.72">鹰角 ID：{{ status.hgId }}</span>
        <span style="font-size: 12px; opacity: 0.72">绑定时间：{{ formatBoundAt(status.boundAt) }}</span>
        <el-tag :type="status.isAdult ? 'success' : 'warning'">
          {{ status.isAdult ? '成年' : '未成年' }}
        </el-tag>
        <el-button v-if="editable" type="danger" text :loading="unbinding" @click="unbind">解绑</el-button>
      </template>
      <template v-else>
        <span style="opacity: 0.72">未绑定</span>
        <el-button v-if="editable" type="primary" @click="startBinding">绑定</el-button>
      </template>
    </div>
  </el-form-item>
</template>
