import { Capacitor } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const desktop = window.pixelDesktop;
export const isDesktop = !!desktop;

declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;
export const REPO = 'phillhf/PixelLeiste';
