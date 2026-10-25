import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue()],
  server: { port: 5310, fs: { allow: [resolve(import.meta.dirname, '..')] } },
})
