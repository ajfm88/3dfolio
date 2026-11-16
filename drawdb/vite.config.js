import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 3dfolio: served under /drawdb/ and built into the portfolio dist folder.
  base: '/drawdb/',
  build: { outDir: '../dist/drawdb', emptyOutDir: true },
})
