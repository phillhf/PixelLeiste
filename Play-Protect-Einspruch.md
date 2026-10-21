# Play-Protect-Einspruch für PixelLeiste 1.2.0

Formular (nur auf Englisch verfügbar):
https://support.google.com/googleplay/android-developer/contact/protectappeals?hl=en

## Schritt 1 – APK bei VirusTotal hochladen

1. `PixelLeiste-1.2.0.apk` aus dem Release herunterladen:
   https://github.com/phillhf/PixelLeiste/releases/download/v1.2.0/PixelLeiste-1.2.0.apk
2. Auf https://www.virustotal.com/gui/home/upload die Datei hochladen und die Analyse abwarten.
3. Die Adresse der Ergebnisseite muss danach so lauten:
   https://www.virustotal.com/gui/file/cb6f9eab7de32bab057b38ee15fbc51d87c6668921841cb72fa72fe8ed98a9c7

## Schritt 2 – Formularfelder

| Feld | Eintrag |
|---|---|
| **Email address** | deine E-Mail-Adresse |
| **Developer name** | `Phill (phillhf)` |
| **Application package name** | `de.phill.pixelleiste` |
| **SHA256 Hash of the apk of the uploaded file on Virus Total** | `cb6f9eab7de32bab057b38ee15fbc51d87c6668921841cb72fa72fe8ed98a9c7` |
| **Additional information to support your appeal** | Text unten komplett einfügen |

### Additional information (zum Kopieren)

```text
PixelLeiste is a free, open-source (MIT) app to control Bluetooth LE LED matrix panels of the
"iPixel Color" family (e.g. 96x16 LED strips sold on AliExpress) – scrolling text, images, clock,
music equaliser. It is distributed as a signed APK via GitHub Releases because it is a small hobby
project, not via Google Play.

Source code: https://github.com/phillhf/PixelLeiste
Release / download: https://github.com/phillhf/PixelLeiste/releases/tag/v1.2.0
VirusTotal: https://www.virustotal.com/gui/file/cb6f9eab7de32bab057b38ee15fbc51d87c6668921841cb72fa72fe8ed98a9c7
Package: de.phill.pixelleiste, version 1.2.0 (versionCode 10200)
Signing certificate SHA-256:
76:EC:7C:C5:97:D5:F5:DD:94:44:16:2C:94:11:CA:23:73:FF:08:8D:E8:4D:FD:CE:75:40:1C:6F:62:0E:6F:5D
Every release APK is built by a public GitHub Actions workflow from the tagged source and
published with a .sha256 checksum.

Why the app needs its permissions:
- BLUETOOTH_SCAN (neverForLocation) / BLUETOOTH_CONNECT: find and connect to the LED panel.
- ACCESS_*_LOCATION (maxSdkVersion 30 only): required by Android 11 and older for BLE scanning;
  location is never read.
- RECORD_AUDIO: optional music equaliser; audio is analysed in memory on the device to drive the
  panel's bars and is never recorded, stored or transmitted. Requested only when the user starts it.
- INTERNET: optional update check (GitHub API) and weather data (Open-Meteo).
- NotificationListenerService (BIND_NOTIFICATION_LISTENER_SERVICE): optional feature that shows
  incoming phone notifications as scrolling text on the user's own LED panel ("display
  notifications on an alternative interface"). It is off by default; the user must enable it in
  the app AND grant notification access in Android settings. Only app name, title and text are
  passed to the panel over Bluetooth; nothing is stored or sent to any server.

The app contains no ads, no analytics, no tracking, no third-party SDKs besides the open-source
Capacitor runtime and its Bluetooth LE and Browser plugins, no obfuscation and no dynamic code
loading. It does not
use SMS or accessibility services.

We believe the app is incorrectly flagged and kindly ask you to review the classification.
Thank you.
```

## Gut zu wissen

- Google antwortet laut Formular **nicht** auf Einsprüche, und die Entscheidung ist endgültig.
  Ob es geklappt hat, merkst du nur daran, dass die Warnung beim Installieren verschwindet.
- Der Einspruch gilt für genau diese APK-Datei (Hash). Bei einer neuen Version muss man ihn
  vermutlich wiederholen – mit der neuen Datei und ihrem Hash.
