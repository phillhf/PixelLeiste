# PixelLeiste

[Deutsch](README_de.md) · **English**

Windows and Android app for LED strips and matrices of the **“iPixel Color” family** – e.g. the
AliExpress strip **TR5645H135-08H (16×96)**. USB only powers the strip; it is controlled via
**Bluetooth LE** (device name usually `LED_BLE_…`). No cloud, no account, no ads.

<p>
  <img src="docs/screenshots/text-en.png" alt="Text view on Windows" width="560">
  <img src="docs/screenshots/phone-en.png" alt="Android" width="200">
</p>

## Features

| Area | What you can do |
|---|---|
| **Text** | Strip font (pixel) with scrolling, blinking, breathing, snowflakes, 9 rainbow styles · **system fonts** (Arial, Impact …) with size/bold, **emojis** 😀 · colour codes in the text: `[#ff0000]red[/] normal` |
| **Image / GIF** | PNG, JPG, WebP, BMP and animated GIFs, scaled to the panel size automatically |
| **Draw** | Pixel editor with pen, eraser, fill · “draw live” sends every pixel immediately |
| **Favourites & profiles** | Save texts, images and drawings with ★; load several favourites as a profile (“Car”, “Party” …) into slots 1–10 in one go |
| **Music** | Equaliser driven by the phone’s/PC’s microphone · built-in rhythm effect |
| **Clock & live** | 9 clock faces, stopwatch, countdown, scoreboard · live text with `{zeit}` (time), `{datum}` (date), `{tag}` (weekday), `{countdown}`, `{temp}`, `{wetter}` (weather), `{akku}` (battery) and on Windows `{cpu}`, `{ram}` · **Android:** notifications (e.g. WhatsApp) as scrolling text |
| **Device** | On/off, brightness, orientation, slots, **password protection** |
| **Connection** | **Several strips at once** · known strips **connect automatically** on start and reconnect after a drop-out |
| **App** | German / English · **update check** (Windows updates itself) |

<p>
  <img src="docs/screenshots/live-en.png" alt="Clock and live" width="420">
  <img src="docs/screenshots/draw-en.png" alt="Draw" width="420">
</p>

## Installation

Downloads: **[Releases](https://github.com/phillhf/PixelLeiste/releases/latest)**.

**Windows** (10/11 with Bluetooth, built-in or a USB dongle): download and run
`PixelLeiste-Setup-<version>.exe`. No administrator rights needed; Start menu entry and optional
desktop shortcut; detects an existing installation (update). Uninstall via “Apps” – you can choose to
keep your settings. PixelLeiste can install new versions itself.
Silent install: `PixelLeiste-Setup-<version>.exe /VERYSILENT [/DIR="D:\PixelLeiste"] [/TASKS="desktopicon"]`

> Windows SmartScreen may show “Unknown publisher” on first start – the setup is not code-signed
> with a paid certificate. Click “More info → Run anyway”.

**Android** (6.0+): open `PixelLeiste-<version>.apk` on the phone and allow “install unknown apps”.
New versions install right over it. Permissions: “Nearby devices” (Bluetooth), microphone only for
the equaliser, notification access only if you turn on the notification display.

## Usage

1. Power the strip via USB. **Close the “iPixel Color” phone app** – the strip accepts only one
   Bluetooth connection at a time.
2. Press **Connect** and choose `LED_BLE_…`. Add more strips with **+ Strip**; the tick box on each
   strip selects which ones receive content.
3. Set up text, image or drawing – the preview at the top shows the result – and send it.

If the strip does not show up: tick “Show all Bluetooth devices” under *Device → Connection*.
The **log** under *Device* helps with troubleshooting.

## Development

One code base (TypeScript + Vite) for both platforms – see [README_de.md](README_de.md#entwicklung)
for the folder overview.

```bash
npm install
npm run dev          # UI in the browser (Chrome/Edge can connect directly via Web Bluetooth)
npm test             # protocol and translation tests
npx playwright test  # UI tests against simulated strips (desktop + phone)
npm run dist:win     # Windows setup into release/ (needs Inno Setup 6)
npm run android:apk  # debug APK (needs JAVA_HOME = JDK 17+ and ANDROID_HOME)
```

**Releasing:** bump the version in `package.json`, commit, push and publish a GitHub release tagged
`v<version>`. `.github/workflows/release.yml` builds the setup and the signed APK (with `.sha256`)
and attaches them. APK signing uses the secrets `PIXELLEISTE_KEYSTORE_BASE64` and
`PIXELLEISTE_KEYSTORE_PASSWORD`. Regenerate screenshots: `SCREENSHOTS=1 npx playwright test screenshots`.

## Credits & licence

MIT licence. The Bluetooth protocol is based on the reverse-engineering work of
[pypixelcolor](https://github.com/lucagoc/pypixelcolor) (MIT) and
[hass-ble-led-sign](https://github.com/eigger/hass-ble-led-sign); the generated commands are tested
byte-for-byte against pypixelcolor. Pixel font: GNU Unifont (SIL OFL 1.1).
Weather data: [Open-Meteo](https://open-meteo.com) (CC BY 4.0).

Some settings (orientation, the clock’s 24 h switch, scoreboard) follow community documentation;
individual firmware versions may behave differently.
