import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import * as path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The user manual's clips (public/manual) are served as they are; watching them is not needed, and a
  // clip still being copied in is locked by Windows, which made the dev server stop (EBUSY).
  server: {
    watch: { ignored: ['**/public/manual/**'] },
  },
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
  },
})
