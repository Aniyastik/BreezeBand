import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/pay': 'http://127.0.0.1:8000',
      '/register_nfc': 'http://127.0.0.1:8000',
      '/history': 'http://127.0.0.1:8000',
      '/settle_day': 'http://127.0.0.1:8000',
      '/profile': 'http://127.0.0.1:8000',
      '/database_view': 'http://127.0.0.1:8000'
    }
  }
})
