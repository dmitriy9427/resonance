/**
 * Vite + React. На GitHub Pages сайт живёт в подпапке /resonance/ — её
 * передаёт сборка в Actions через BASE_URL; локально сайт открывается с корня.
 */
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5191 },
  build: {
    target: 'es2022',
    // three.js + R3F — один большой чанк (~1,3 МБ, ~340 КБ в gzip): без него сайт бесполезен,
    // поэтому делить нет смысла. Порог поднят, чтобы не пугало предупреждение.
    chunkSizeWarningLimit: 1400,
  },
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
