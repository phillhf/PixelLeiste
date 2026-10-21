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

Downloads gibt es unter **[Releases](https://github.com/phillhf/PixelLeiste/releases/latest)**.

**Windows** (Windows 10/11 mit Bluetooth, eingebaut oder USB-Stick):
`PixelLeiste-Setup-<Version>.exe` herunterladen und starten. Das Setup braucht keine
Administratorrechte, legt einen Startmenü-Eintrag und optional eine Desktop-Verknüpfung an und
erkennt eine vorhandene Installation (Update). Deinstallation über „Apps“ bzw.
„Programme und Features“; dabei kannst du wählen, ob die Einstellungen erhalten bleiben.
Stille Installation: `PixelLeiste-Setup-<Version>.exe /VERYSILENT [/DIR="D:\PixelLeiste"] [/TASKS="desktopicon"]`

**Android** (ab Android 6): `PixelLeiste-<Version>.apk` auf dem Handy herunterladen und
öffnen („Installation aus unbekannten Quellen“ erlauben). Neue Versionen lassen sich einfach
darüber installieren. Beim ersten Verbinden fragt die App nach der Berechtigung
„Geräte in der Nähe“.

> Wer vorher eine selbst gebaute Debug-APK installiert hatte, muss diese einmal deinstallieren –
> die Release-APK ist mit einem anderen Schlüssel signiert.

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
npm run dist:win     # Windows-Setup nach release/ (benötigt Inno Setup 6)
npm run android:apk  # Debug-APK (benötigt JAVA_HOME = JDK 17+ und ANDROID_HOME = Android-SDK)
```

**Release erstellen:** Version in `package.json` erhöhen, committen, pushen und auf GitHub eine
Release mit dem Tag `v<Version>` veröffentlichen. Der Workflow `.github/workflows/release.yml`
baut dann Windows-Setup und signierte APK (inkl. `.sha256`) und hängt sie an.
Die APK-Signatur kommt aus den Repository-Secrets `PIXELLEISTE_KEYSTORE_BASE64` und
`PIXELLEISTE_KEYSTORE_PASSWORD`; lokal genügen die Umgebungsvariablen `PIXELLEISTE_KEYSTORE`
und `PIXELLEISTE_KEYSTORE_PASSWORD` für `gradlew assembleRelease`.

Die Testdaten `tests/fixtures.json` stammen aus der Referenzimplementierung
[pypixelcolor](https://github.com/lucagoc/pypixelcolor) (MIT) und werden mit
`tools/make_fixtures.py` erzeugt. Die Pixelschrift ist GNU Unifont (SIL OFL 1.1).

## Hinweise

- Getestet sind die erzeugten Bytes (identisch zur Referenz) und die Oberfläche; die Funk-Strecke
  selbst konnte ohne die echte Leiste nicht getestet werden. Klappt etwas nicht, hilft das
  **Protokoll** unter *Gerät* bei der Fehlersuche.
- Ausrichtung, Uhr-Stile und Anzeigetafel folgen der Community-Dokumentation; einzelne Firmware-Versionen
  können sich anders verhalten.
