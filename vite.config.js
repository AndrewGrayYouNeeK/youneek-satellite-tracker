import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/youneek-satellite-tracker/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
