import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rizzmaster.app',
  appName: 'Rizz Master',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    AdMob: {
      appId: 'ca-app-pub-3940256099942544~3347511713' // Test App ID
    }
  }
};

export default config;