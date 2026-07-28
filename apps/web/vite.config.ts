import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // 从 apps/web/.env(.local) 读取开发配置；端口私有化，避免与他人冲突
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_PORT ?? 5173)
  const serverPort = Number(env.VITE_SERVER_PORT ?? 3000)
  const backend = `http://localhost:${serverPort}`

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port,
      proxy: {
        '/api': backend,
        '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
      },
    },
  }
})
