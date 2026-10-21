declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number): number[][];
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][]): Uint8Array;
}

interface PixelDesktopDevice { deviceId: string; deviceName: string }

interface Window {
  /** Exposed by electron/preload.cjs when running as the Windows app. */
  pixelDesktop?: {
    onDevices(cb: (list: PixelDesktopDevice[]) => void): void;
    select(deviceId: string): void;
    /** Device the user (or auto-connect) picked in the last requestDevice() call. */
    lastSelected(): Promise<PixelDesktopDevice | null>;
    /** Silently picks `deviceId` once it shows up; calls window.__pixelAutoPick with a user gesture. */
    autoConnect(deviceId: string): Promise<void>;
    sysStats(): Promise<{ cpu: number; ram: number }>;
    isInstalled(): Promise<boolean>;
    installUpdate(url: string, sha256: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  __pixelAutoPick?: () => Promise<unknown>;
}
