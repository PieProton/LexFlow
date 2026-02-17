import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss() // <--- QUESTO era il pezzo mancante per il CSS!
  ],
  
  // Fondamentale per Electron (percorsi relativi)
  base: './', 

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
      mangle: { toplevel: true },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },
});