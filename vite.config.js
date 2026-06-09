import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 部署路径：https://<username>.github.io/<repo>/
  base: '/small-creation/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
