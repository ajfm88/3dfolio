import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The client imports the server's pure canvas module through this alias
      // so both sides run the same validation. The import only goes
      // client → server; Render builds server/ alone and never loads this config.
      '@shared': fileURLToPath(new URL('./server/src/shared', import.meta.url)),
    },
  },
})