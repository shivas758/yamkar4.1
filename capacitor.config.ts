import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yamkar.app',
  appName: 'Yamkar',
  webDir: 'out',
  server: {
    url: 'https://yamkarv41.netlify.app',
    cleartext: true // Recommended for development/testing with live reload or external URLs
  }
};

export default config;
