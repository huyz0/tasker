import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Mirrors how the backend derives its own version (health.handler.ts) -
    // lets the GUI show which build is actually running without needing to
    // cross-reference a deploy log. Falls back to "dev" for local builds
    // where GIT_SHA isn't set.
    __BUILD_SHA__: JSON.stringify(process.env.GIT_SHA || 'dev'),
  },
})

