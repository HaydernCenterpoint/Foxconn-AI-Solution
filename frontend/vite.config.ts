import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    mode === 'analyze' &&
      visualizer({
        open: true,
        filename: 'dist-app-v2/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ],
  build: {
    outDir: 'dist-app-v2',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react/')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('@xyflow/react')) {
              return 'vendor-flow';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) {
              return 'vendor-forms';
            }
            if (id.includes('zustand')) {
              return 'vendor-state';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/cep': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cep/, '/api/v1'),
      },
      '/api/asset-service': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/asset-service/, '/api/v1'),
      },
      '/api': {
        target: 'http://localhost:5165',
        changeOrigin: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_LINE_ID': JSON.stringify('c0d8d10b-2228-4e01-b8eb-d32b209f5e16'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist-app-v2/**'],
  },
}));
