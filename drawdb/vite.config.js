import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 3dfolio: served under /dbdesign/ and built into the portfolio dist folder.
  base: '/dbdesign/',
  build: { outDir: '../dist/dbdesign', emptyOutDir: true },
})
