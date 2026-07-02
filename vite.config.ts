
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

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
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || '',
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
        VITE_GOOGLE_CLIENT_ID: env.VITE_GOOGLE_CLIENT_ID || '',
        VITE_AUTH_REDIRECT_URL: env.VITE_AUTH_REDIRECT_URL || '',
        VITE_API_BASE_URL: env.VITE_API_BASE_URL || env.API_BASE_URL || '',
        REACT_APP_SUPABASE_URL: env.REACT_APP_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
        REACT_APP_SUPABASE_ANON_KEY: env.REACT_APP_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
        SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.REACT_APP_SUPABASE_URL || '',
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || '',
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '',
        AUTH_REDIRECT_URL: env.AUTH_REDIRECT_URL || env.VITE_AUTH_REDIRECT_URL || '',
        API_BASE_URL: env.API_BASE_URL || env.VITE_API_BASE_URL || '',
      }),
      // Expose local and Vercel-style public auth vars to the client bundle used by Capacitor.
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.REACT_APP_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || ''),
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || ''),
      'process.env.AUTH_REDIRECT_URL': JSON.stringify(env.AUTH_REDIRECT_URL || env.VITE_AUTH_REDIRECT_URL || ''),
      'process.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL || env.VITE_API_BASE_URL || ''),
      // Keep legacy Supabase aliases available in the client bundle.
      'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(env.REACT_APP_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
      'process.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(env.REACT_APP_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
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
