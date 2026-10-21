# PixelLeiste – Steuer-App für die 96×16 LED-Leiste

Windows- und Android-App für die AliExpress-LED-Leiste **TR5645H135-08H (16×96)**.
Die Leiste bekommt über USB nur Strom; gesteuert wird sie per **Bluetooth LE** mit dem
Protokoll der App „iPixel Color“ (Gerätename meist `LED_BLE_…`).

## Funktionen

| Bereich | Was geht |
|---|---|
| **Text** | Lauftext links/rechts, statisch, Blinken, Atmen, Schneeflocken · Farbe, Hintergrund, Regenbogen (9 Stile), Geschwindigkeit · Farbcodes im Text: `[#ff0000]rot[/] normal` |
| **Bild / GIF** | PNG, JPG, WebP, BMP und animierte GIFs; automatisch auf 96×16 skaliert (füllen / einpassen / strecken, weich oder pixelgenau) |
| **Zeichnen** | Pixel-Editor 96×16 mit Stift, Radierer, Füllen · „Live zeichnen“ überträgt jeden Pixel sofort |
| **Uhr & Live** | 9 Uhr-Stile (mit Zeitabgleich), Stoppuhr, Countdown, Anzeigetafel, Live-Text mit `{zeit}`, `{zeitsek}`, `{datum}`, `{tag}`, `{countdown}` |
| **Gerät** | Ein/Aus, Helligkeit, Ausrichtung, Uhrzeit übertragen, Speicherplätze 1–10 anzeigen/löschen, alles löschen |

Inhalte können „nur angezeigt“ oder in **Speicherplatz 1–10** abgelegt werden; die Leiste
wechselt dann selbst zwischen den gespeicherten Inhalten.

## Installation

**Windows** (Windows 10/11 mit Bluetooth):
`release\PixelLeiste 1.0.0.exe` (portabel, einfach starten) oder
`release\PixelLeiste Setup 1.0.0.exe` (Installer).

**Android** (ab Android 6): `android\app\build\outputs\apk\debug\app-debug.apk` aufs Handy
kopieren und installieren („Installation aus unbekannten Quellen“ erlauben). Beim ersten
Verbinden nach der Berechtigung „Geräte in der Nähe“ fragt die App.

## Bedienung

1. Leiste per USB mit Strom versorgen. **Die Original-App „iPixel Color“ schließen** –
   die Leiste akzeptiert nur eine Bluetooth-Verbindung gleichzeitig.
2. **Verbinden** drücken und `LED_BLE_…` auswählen.
   Taucht sie nicht auf: unter *Gerät → Verbindung* „Alle Bluetooth-Geräte zeigen“ anhaken.
3. Text, Bild oder Zeichnung einstellen – die Vorschau oben zeigt das Ergebnis – und senden.

## Entwickeln & Bauen

Eine Codebasis (TypeScript + Vite) für beide Plattformen:

| Pfad | Inhalt |
|---|---|
| `src/protocol/ipixel.ts` | Byte-Protokoll (Befehle, 12-KB-Fenster, CRC32, Zeichen-Bitmaps) |
| `src/ble/connection.ts` | BLE-Verbindung, 244-Byte-Pakete, ACK-Handling |
| `src/render/` | Pixelschrift (GNU Unifont), Bild-/GIF-Skalierung und -Kodierung |
| `src/main.ts`, `index.html` | Oberfläche |
| `electron/` | Windows-Hülle inkl. Bluetooth-Geräteauswahl |
| `android/` | Capacitor-Android-Projekt |

```bash
npm install
npm run dev          # Oberfläche im Browser (Chrome/Edge können per Web Bluetooth sogar direkt verbinden)
npm test             # Protokoll-Tests gegen Referenzdaten
npm run dist:win     # Windows-.exe nach release/
npm run android:apk  # APK (benötigt JAVA_HOME = JDK 17+ und ANDROID_HOME = Android-SDK)
```

Die Testdaten `tests/fixtures.json` stammen aus der Referenzimplementierung
[pypixelcolor](https://github.com/lucagoc/pypixelcolor) (MIT) und werden mit
`tools/make_fixtures.py` erzeugt. Die Pixelschrift ist GNU Unifont (SIL OFL 1.1).

## Hinweise

- Getestet sind die erzeugten Bytes (identisch zur Referenz) und die Oberfläche; die Funk-Strecke
  selbst konnte ohne die echte Leiste nicht getestet werden. Klappt etwas nicht, hilft das
  **Protokoll** unter *Gerät* bei der Fehlersuche.
- Ausrichtung, Uhr-Stile und Anzeigetafel folgen der Community-Dokumentation; einzelne Firmware-Versionen
  können sich anders verhalten.
