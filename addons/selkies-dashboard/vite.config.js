import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ViteRestart from 'vite-plugin-restart'
import { ViteMinifyPlugin } from 'vite-plugin-minify';

export default defineConfig({
  server: {
    host: '0.0.0.0'
  },
  plugins: [
    react(),
    ViteMinifyPlugin(),
    ViteRestart({restart: ['index.html', 'src/**']}),
  ]
})
