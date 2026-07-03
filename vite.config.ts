
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  const packageVersion = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  ).version || '0.0.0';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    // CRITICAL for Capacitor: Use relative paths for assets
    base: './',
    define: {
      __APP_RUNTIME_ENV__: JSON.stringify({
        VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY || '',
        VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN || '',
        VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || '',
        VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID || env.FIREBASE_APP_ID || '',
        VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID || env.FIREBASE_MESSAGING_SENDER_ID || '',
        VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET || '',
        VITE_FIREBASE_MEASUREMENT_ID: env.VITE_FIREBASE_MEASUREMENT_ID || env.FIREBASE_MEASUREMENT_ID || '',
        VITE_GOOGLE_CLIENT_ID: env.VITE_GOOGLE_CLIENT_ID || '',
        VITE_AUTH_REDIRECT_URL: env.VITE_AUTH_REDIRECT_URL || '',
        VITE_API_BASE_URL: env.VITE_API_BASE_URL || env.API_BASE_URL || '',
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '',
        AUTH_REDIRECT_URL: env.AUTH_REDIRECT_URL || env.VITE_AUTH_REDIRECT_URL || '',
        API_BASE_URL: env.API_BASE_URL || env.VITE_API_BASE_URL || '',
      }),
      __APP_VERSION__: JSON.stringify(packageVersion),
      'process.env.FIREBASE_API_KEY': JSON.stringify(env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || ''),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || ''),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || ''),
      'process.env.FIREBASE_APP_ID': JSON.stringify(env.FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || ''),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID || env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || ''),
      'process.env.FIREBASE_MEASUREMENT_ID': JSON.stringify(env.FIREBASE_MEASUREMENT_ID || env.VITE_FIREBASE_MEASUREMENT_ID || ''),
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || ''),
      'process.env.AUTH_REDIRECT_URL': JSON.stringify(env.AUTH_REDIRECT_URL || env.VITE_AUTH_REDIRECT_URL || ''),
      'process.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL || env.VITE_API_BASE_URL || ''),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'capacitor-vendor': ['@capacitor/core', '@capacitor/app', '@capacitor/status-bar', '@capacitor/camera', '@capacitor/network', '@capacitor/dialog', '@capacitor/preferences', '@capacitor/local-notifications'],
            'admob-vendor': ['@capacitor-community/admob'],
          }
        }
      }
    },
  };
});
