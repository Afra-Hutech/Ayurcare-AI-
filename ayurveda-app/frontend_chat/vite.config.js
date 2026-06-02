import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
      protocol: 'ws',
    },
    proxy: {
      // All patient auth now goes to doctor API (Postgres — no MongoDB)
      '/api/patient/login':          { target: 'http://localhost:5001', changeOrigin: true },
      '/api/patient/signup':         { target: 'http://localhost:5001', changeOrigin: true },
      '/api/patient/forgot-password':{ target: 'http://localhost:5001', changeOrigin: true },
      '/api/patient/reset-password': { target: 'http://localhost:5001', changeOrigin: true },
      // Doctor–patient chat on doctor API
      '/api/chat': { target: 'http://localhost:5001', changeOrigin: true },
      // Everything else → doctor API (5001)
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
})
