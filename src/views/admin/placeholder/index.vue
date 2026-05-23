<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta?.title ?? '功能页面'))
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <div>
        <div class="admin-title">{{ title }}</div>
      </div>
    </div>
    <el-card shadow="never" class="admin-card" body-style="padding: 18px">
      <el-empty description="功能开发中" />
    </el-card>
  </div>
</template>
