<script setup lang="ts">
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header admin-animate-in" style="--delay: 0ms">
      <div>
        <div class="admin-title">后台首页</div>
      </div>
      <div class="admin-header-actions">
        <el-button type="primary" plain @click="router.push('/admin/notice')">公告管理</el-button>
        <el-button type="primary" plain @click="router.push('/admin/ban')">封禁管理</el-button>
        <el-button type="primary" plain @click="router.push('/admin/m/1')">用户管理</el-button>
      </div>
    </div>

    <el-row :gutter="12" class="admin-animate-in" style="--delay: 60ms">
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="admin-card admin-animate-in" body-style="padding: 18px" style="--delay: 80ms">
          <div style="opacity: 0.75">
            当前用户：{{ String(authStore.session?.role ?? '').toUpperCase() === 'SUPER_ADMIN' ? '超级管理员' : '管理员' }}
            （ID：{{ authStore.session?.userId ?? '-' }}）
          </div>
          <el-divider />
          <div style="display: flex; gap: 10px; flex-wrap: wrap">
            <el-button type="primary" @click="router.push('/admin/notice')">进入公告管理</el-button>
            <el-button type="primary" @click="router.push('/admin/m/1')">进入用户管理</el-button>
            <el-button type="primary" @click="router.push('/admin/ban')">进入封禁管理</el-button>
            <el-button
              v-if="String(authStore.session?.role ?? '').toUpperCase() === 'SUPER_ADMIN'"
              type="success"
              @click="router.push('/admin/permission')"
            >
              进入权限管理
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="admin-card admin-animate-in" body-style="padding: 18px" style="--delay: 120ms">
          <div style="font-weight: 700; margin-bottom: 10px; color: #173b6c">快捷入口</div>
          <el-space direction="vertical" alignment="stretch" style="width: 100%">
            <el-button plain @click="router.push('/admin/notice')" style="justify-content: flex-start">公告管理</el-button>
            <el-button plain @click="router.push('/admin/m/1')" style="justify-content: flex-start">用户管理</el-button>
            <el-button plain @click="router.push('/admin/ban')" style="justify-content: flex-start">封禁管理</el-button>
            <el-button plain @click="router.push('/admin/settings')" style="justify-content: flex-start">系统设置</el-button>
          </el-space>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
