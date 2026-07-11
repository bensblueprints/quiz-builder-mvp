import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5366,
    proxy: {
      '/api': 'http://localhost:5365',
      '/q': 'http://localhost:5365',
      '/embed.js': 'http://localhost:5365'
    }
  }
});
