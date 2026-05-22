<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <main style="padding: 16px; max-width: 900px; margin: 0 auto">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
      <div>
        <h1 style="margin: 0 0 4px">申诉入口</h1>
        <div style="opacity: 0.75">/user/appeal</div>
      </div>
      <button @click="router.back()" style="padding: 10px 12px">返回</button>
    </header>

    <section style="margin-top: 16px; line-height: 1.7">
      <div style="border: 1px solid #eee; border-radius: 12px; padding: 14px">
        <div style="font-weight: 600">申诉说明</div>
        <div style="margin-top: 8px; opacity: 0.85">
          如你认为封禁存在误判，请准备对应的封禁记录ID与相关证明材料，通过管理员渠道提交申诉。
        </div>
      </div>
    </section>
  </main>
</template>
