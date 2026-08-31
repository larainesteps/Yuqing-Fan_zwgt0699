import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API port comes from PORT in the root .env, defaulting to 4000.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // This is an npm workspace: react is installed at the repository root, and packages
    // depending on it (react-router-dom among them) are hoisted there too. Without this line
    // Vite resolves a separate React for each of them, and the failure appears at runtime as
    // "Invalid hook call" raised inside a library component rather than in application code.
    dedupe: ['react', 'react-dom']
  },
  server: {
    port: 5173,
    strictPort: true,
    // Lets VITE_API_URL be a relative '/api', proxied here to avoid a cross-origin request.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
