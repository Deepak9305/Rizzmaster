
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    // CRITICAL for Capacitor: Use relative paths for assets
    base: './',
    define: {
      // Keep legacy Supabase aliases available in the client bundle.
      'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(env.REACT_APP_SUPABASE_URL || ''),
      'process.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(env.REACT_APP_SUPABASE_ANON_KEY || ''),
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
