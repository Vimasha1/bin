import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 3000,
    open: false
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: [
      'prolific-delight-production-6a57.up.railway.app',
      '.up.railway.app'
    ]
  }
})
