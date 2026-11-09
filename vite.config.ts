import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  base: './',
  clearScreen: false, // mantém os logs do Rust visíveis no `tauri dev`
  server: { port: 5173, host: true, watch: { ignored: ['**/src-tauri/**'] } },
  // WebView2 (Windows) é Chromium recente; WebKit no macOS/Linux
  build: { outDir: 'dist', emptyOutDir: true, target: ['chrome110', 'safari15'] },
})
