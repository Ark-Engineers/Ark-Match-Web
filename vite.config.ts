import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('./env', import.meta.url))
  const env = loadEnv(mode, envDir, '')

  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const buildDate = `${y}${m}${d}`

  const port = Number(env.VITE_PORT) || 5173
  const previewPort = Number(env.VITE_PREVIEW_PORT) || 4173
  const proxyPrefix = env.VITE_PROXY_PREFIX || '/api'
  const proxyTarget = env.VITE_PROXY_TARGET

  const proxy: Record<string, any> = {
    '/thirdparty/hg': {
      target: 'https://as.hypergryph.com',
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/thirdparty\/hg/, ''),
    },
    '/thirdparty/skland': {
      target: 'https://zonai.skland.com',
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/thirdparty\/skland/, ''),
    },
    '/thirdparty/fp': {
      target: 'https://fp-it.portal101.cn',
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/thirdparty\/fp/, ''),
      // 设备指纹服务按来源校验，剥离浏览器自动携带的 Origin/Referer（对齐无浏览器头的脚本行为）
      configure: (proxy: any) => {
        proxy.on('proxyReq', (proxyReq: any) => {
          proxyReq.removeHeader('origin')
          proxyReq.removeHeader('referer')
        })
      },
    },
  }
  if (proxyTarget) {
    proxy[proxyPrefix] = {
      target: proxyTarget,
      changeOrigin: true,
      ws: true,
      xfwd: true,
      rewrite: (path: string) => path.replace(new RegExp(`^${proxyPrefix}`), ''),
    }
  }

  const envLogPlugin = {
    name: 'env-log',
    configResolved() {
      const picked = {
        mode,
        VITE_APP_ENV: env.VITE_APP_ENV,
        VITE_API_BASE_URL: env.VITE_API_BASE_URL,
        VITE_PORT: env.VITE_PORT,
        VITE_PREVIEW_PORT: env.VITE_PREVIEW_PORT,
        VITE_ASSET_BASE: env.VITE_ASSET_BASE,
      }
      console.log('[env]', JSON.stringify(picked))
    },
  }

  return {
    envDir,
    base: env.VITE_ASSET_BASE || '/',
    plugins: [vue(), vueDevTools(), tailwindcss(), envLogPlugin],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port,
      proxy,
    },
    preview: {
      port: previewPort,
    },
    build: {
      sourcemap: env.VITE_SOURCEMAP === 'true',
      outDir: `dist-${buildDate}`,
    },
    esbuild:
      env.VITE_DROP_CONSOLE === 'true' ? ({ drop: ['console', 'debugger'] } as any) : undefined,
  }
})
