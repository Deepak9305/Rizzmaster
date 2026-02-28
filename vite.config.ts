
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Rizz Master',
          short_name: 'RizzMaster',
          description: 'Your AI Wingman',
          theme_color: '#000000',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        }
      })
    ],
    // CRITICAL for Capacitor: Use relative paths for assets
    base: './',
    define: {
      // Define process.env variables so they work in the client-side code
      // Gemini Key
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      
      // Llama / OpenAI Compatible Keys
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY || ''),
      'process.env.LLAMA_API_KEY': JSON.stringify(env.LLAMA_API_KEY || ''),
      'process.env.LLAMA_BASE_URL': JSON.stringify(env.LLAMA_BASE_URL || ''), 
      'process.env.LLAMA_MODEL_NAME': JSON.stringify(env.LLAMA_MODEL_NAME || ''),
      
      // Google Perspective API
      'process.env.PERSPECTIVE_API_KEY': JSON.stringify(env.PERSPECTIVE_API_KEY || ''),
      
      // Supabase
      'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(env.REACT_APP_SUPABASE_URL || ''),
      'process.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(env.REACT_APP_SUPABASE_ANON_KEY || ''),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      outDir: 'dist',
      assetsDir: 'assets',
      // Ensure empty output directory before building
      emptyOutDir: true,
    },
  };
});
