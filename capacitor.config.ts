import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.krumer.app',
  appName: 'Krumer',
  webDir: 'mobile',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false
    }
  }
}

export default config
