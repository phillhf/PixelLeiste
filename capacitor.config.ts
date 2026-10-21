import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.phill.pixelleiste',
  appName: 'PixelLeiste',
  webDir: 'dist',
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Suche LED-Leiste …',
        cancel: 'Abbrechen',
        availableDevices: 'Gefundene Geräte',
        noDeviceFound: 'Keine LED-Leiste gefunden',
      },
    },
  },
};

export default config;
