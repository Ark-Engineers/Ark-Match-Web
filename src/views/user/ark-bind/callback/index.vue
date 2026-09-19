<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  void router.replace('/user/ark-bind')
})
</script>

<template>
  <main style="padding: 16px">
    <el-card style="max-width: 640px; margin: 0 auto">
      <template #header>
        <div style="font-weight: 700">绑定明日方舟</div>
      </template>
      <div>正在跳转…</div>
    </el-card>
  </main>
</template>
