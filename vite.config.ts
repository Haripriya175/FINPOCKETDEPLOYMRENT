import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
    watch: {
      ignored: ['**/finpocket_app/**', '**/finpocket_server/**', '**/.web_reference/**', '**/build/**'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
