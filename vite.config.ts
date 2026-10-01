import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8791' } },
  build: { rollupOptions: { output: { manualChunks: { 'three-engine': ['three'], 'campus-engine': ['@react-three/fiber', '@react-three/drei'] } } } },
})
