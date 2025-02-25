import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all interfaces
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001', // Internal Flask server
        // target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false, // Disable SSL verification for internal communication
        rewrite: (path) => path
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
