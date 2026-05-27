import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

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

  const proxy = proxyTarget
    ? {
        [proxyPrefix]: {
          target: proxyTarget,
          changeOrigin: true,
          xfwd: true,
          rewrite: (path: string) => path.replace(new RegExp(`^${proxyPrefix}`), ''),
        },
      }
    : undefined

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
    plugins: [vue(), vueDevTools(), envLogPlugin],
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
