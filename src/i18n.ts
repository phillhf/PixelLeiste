// German is the source language (HTML and t() keys); English via this dictionary.
// HTML: data-i18n translates the element's own text, data-i18n-attr="placeholder,title" attributes.

export type Lang = 'de' | 'en';

const EN: Record<string, string> = {
  // header / devices
  'Verbinden': 'Connect',
  '+ Leiste': '+ Strip',
  'Jetzt aktualisieren': 'Update now',
  'Später': 'Later',
  'Vorschau der LED-Leiste': 'LED strip preview',
  'Nicht verbunden': 'Not connected',
  'Verbinde …': 'Connecting …',
  'Sende …': 'Sending …',
  'Getrennt – verbinde neu …': 'Disconnected – reconnecting …',
  'Senden an diese Leiste': 'Send to this strip',
  'Trennen': 'Disconnect',
  'Keine Leiste verbunden – „Verbinden“ drücken.': 'No strip connected – press “Connect”.',
  // tabs
  'Text': 'Text', 'Bild / GIF': 'Image / GIF', 'Zeichnen': 'Draw', 'Favoriten': 'Favourites',
  'Musik': 'Music', 'Uhr & Live': 'Clock & live', 'Gerät': 'Device',
  // text
  'Farbcodes möglich:': 'Colour codes:',
  'Schrift': 'Font',
  'Leisten-Schrift (Pixel)': 'Strip font (pixel)',
  'Effekt': 'Effect',
  'Statisch': 'Static',
  'Lauftext nach links': 'Scroll left',
  'Lauftext nach rechts': 'Scroll right',
  'Blinken': 'Blink',
  'Atmen / Fade': 'Breathe / fade',
  'Schneeflocken': 'Snowflakes',
  'Regenbogen': 'Rainbow',
  'Aus': 'Off',
  'Textfarbe': 'Text colour',
  'Hintergrund': 'Background',
  'Schriftgröße': 'Font size',
  'Fett': 'Bold',
  'Kantenglättung': 'Anti-aliasing',
  'Mit einer System-Schrift wird der Text als Bild bzw. Animation gesendet – auch Emojis 😀 sind möglich.':
    'With a system font the text is sent as an image or animation – emojis 😀 work too.',
  'Geschwindigkeit': 'Speed',
  'Speichern in': 'Save to',
  'Als Favorit speichern': 'Save as favourite',
  'Text senden': 'Send text',
  'Nur anzeigen': 'Show only',
  'Speicherplatz {n}': 'Slot {n}',
  'Nicht zurückschalten': 'Do not switch back',
  'Bitte einen Text eingeben': 'Please enter a text',
  'Text als Animation ({n} Bilder)': 'Text as animation ({n} frames)',
  // image
  'Bild oder animiertes GIF auswählen …': 'Choose an image or animated GIF …',
  'Anpassen': 'Fit',
  'Füllen (zuschneiden)': 'Fill (crop)',
  'Einpassen (Ränder)': 'Fit (borders)',
  'Strecken': 'Stretch',
  'Skalierung': 'Scaling',
  'Weich (Fotos)': 'Smooth (photos)',
  'Pixelgenau (Pixel-Art)': 'Pixel-exact (pixel art)',
  'Bild senden': 'Send image',
  '{w}×{h} px · {n} Bilder (animiert) → wird auf {W}×{H} skaliert': '{w}×{h} px · {n} frames (animated) → scaled to {W}×{H}',
  '{w}×{h} px → wird auf {W}×{H} skaliert': '{w}×{h} px → scaled to {W}×{H}',
  'Bild konnte nicht geladen werden: {e}': 'Could not load image: {e}',
  // draw
  'Farbe': 'Colour',
  'Stift': 'Pen', 'Radierer': 'Eraser', 'Füllen': 'Fill',
  'Live auf der Leiste zeichnen': 'Draw live on the strip',
  'Leeren': 'Clear',
  'Vorschau übernehmen': 'Copy preview',
  'Zeichnung senden': 'Send drawing',
  'Zeichnung': 'Drawing',
  'Live-Zeichnen aktiv': 'Live drawing active',
  'Live-Zeichenmodus': 'Live drawing mode',
  // favourites
  'Mit ★ in Text, Bild oder Zeichnen speicherst du Inhalte hier. Mehrere Favoriten lassen sich zu einem Profil bündeln und auf einmal in die Speicherplätze laden.':
    'Use ★ in Text, Image or Draw to save content here. Several favourites can be bundled into a profile and loaded into the slots in one go.',
  'Noch keine Favoriten.': 'No favourites yet.',
  'Profile': 'Profiles',
  'Neues Profil aus den markierten Favoriten': 'New profile from the selected favourites',
  'z. B. Auto, Party': 'e.g. Car, Party',
  'Profil anlegen': 'Create profile',
  'Beim Übertragen übrige Speicherplätze leeren': 'Clear the remaining slots when transferring',
  'Name des Favoriten': 'Favourite name',
  'Favorit gespeichert': 'Favourite saved',
  'Senden': 'Send',
  'Umbenennen': 'Rename',
  'Für Profil auswählen': 'Select for profile',
  'Favorit „{name}“ löschen?': 'Delete favourite “{name}”?',
  'Profil „{name}“ löschen?': 'Delete profile “{name}”?',
  'Bitte Favoriten markieren (max. 10)': 'Please select favourites (max. 10)',
  'Bitte einen Namen eingeben': 'Please enter a name',
  'Übertragen': 'Transfer',
  '{n} Inhalte': '{n} items',
  'Profil „{name}“ übertragen': 'Transfer profile “{name}”',
  'Profil übertragen ({i}/{n})': 'Transferring profile ({i}/{n})',
  // music
  'Equalizer über das Mikrofon': 'Equaliser via microphone',
  'Das Mikrofon dieses Geräts hört mit und steuert die 11 Balken der Leiste im Takt der Musik.':
    'This device’s microphone listens and drives the strip’s 11 bars to the beat of the music.',
  'Stil': 'Style',
  'Empfindlichkeit': 'Sensitivity',
  'Equalizer starten': 'Start equaliser',
  'Equalizer stoppen': 'Stop equaliser',
  'Eingebauter Rhythmus-Effekt': 'Built-in rhythm effect',
  'Stärke': 'Intensity',
  'Rhythmus-Effekt anzeigen': 'Show rhythm effect',
  'Rhythmus-Effekt': 'Rhythm effect',
  'Kein Zugriff auf das Mikrofon: {e}': 'No access to the microphone: {e}',
  // live
  'Uhr': 'Clock',
  'Ziffernblatt': 'Clock face',
  '24-Stunden': '24-hour',
  'Datum anzeigen': 'Show date',
  'Uhr anzeigen (mit Zeitabgleich)': 'Show clock (syncs time)',
  'Uhr anzeigen': 'Show clock',
  'Stoppuhr': 'Stopwatch',
  'Start': 'Start', 'Pause': 'Pause', 'Stopp': 'Stop',
  'Countdown': 'Countdown',
  'Min': 'Min', 'Sek': 'Sec',
  'Anzeigetafel': 'Scoreboard',
  'Zurücksetzen': 'Reset',
  'Live-Text': 'Live text',
  'Wird regelmäßig neu gezeichnet und gesendet. Platzhalter:': 'Redrawn and sent periodically. Placeholders:',
  'Vorlage': 'Template',
  'Intervall (Sek.)': 'Interval (sec.)',
  'Countdown-Ziel': 'Countdown target',
  'Ort für das Wetter': 'Location for the weather',
  'z. B. Köln': 'e.g. London',
  'Ort suchen': 'Find location',
  'Ort nicht gefunden': 'Location not found',
  'Wetter für {name}': 'Weather for {name}',
  'Live-Text starten': 'Start live text',
  'Live-Text stoppen': 'Stop live text',
  'Stil {n}': 'Style {n}',
  'Benachrichtigungen vom Handy': 'Phone notifications',
  'Zeigt eingehende Benachrichtigungen (z. B. WhatsApp) als Lauftext an. Funktioniert, solange PixelLeiste geöffnet oder im Hintergrund aktiv ist.':
    'Shows incoming notifications (e.g. WhatsApp) as scrolling text. Works while PixelLeiste is open or active in the background.',
  'Benachrichtigungen anzeigen': 'Show notifications',
  'Zugriff erlauben …': 'Allow access …',
  'Nur diese Apps (leer = alle)': 'Only these apps (empty = all)',
  'Danach zurück zu Speicherplatz': 'Then return to slot',
  'Anzeigedauer (Sek.)': 'Display time (sec.)',
  'Zuletzt gesehene Apps: {apps}': 'Recently seen apps: {apps}',
  'Bitte zuerst den Zugriff auf Benachrichtigungen erlauben': 'Please allow access to notifications first',
  'Benachrichtigung': 'Notification',
  'So': 'Sun', 'Mo': 'Mon', 'Di': 'Tue', 'Mi': 'Wed', 'Do': 'Thu', 'Fr': 'Fri', 'Sa': 'Sat',
  // device
  'Einschalten': 'Turn on', 'Ausschalten': 'Turn off',
  'Helligkeit': 'Brightness',
  'Helligkeit {n} %': 'Brightness {n} %',
  'Ausrichtung': 'Orientation',
  'Normal': 'Normal', 'Variante 1': 'Variant 1', 'Variante 2': 'Variant 2', 'Variante 3': 'Variant 3',
  'Uhrzeit': 'Time',
  'Uhrzeit übertragen': 'Sync time',
  'Speicherplätze': 'Slots',
  'Platz': 'Slot',
  'Anzeigen': 'Show',
  'Löschen': 'Delete',
  'Alles löschen …': 'Delete all …',
  'Alles gelöscht': 'Everything deleted',
  'Speicherplatz {n} anzeigen': 'Show slot {n}',
  'Speicherplatz {n} löschen': 'Delete slot {n}',
  'Wirklich ALLE gespeicherten Inhalte und Einstellungen auf der Leiste löschen?':
    'Really delete ALL stored content and settings on the strip?',
  'Passwortschutz': 'Password protection',
  'Mit Passwort kann sich niemand ohne die 6 Ziffern mit der Leiste verbinden. Passwort gut merken!':
    'With a password nobody can connect to the strip without the 6 digits. Remember it well!',
  '6 Ziffern': '6 digits',
  'Passwort setzen': 'Set password',
  'Passwort entfernen': 'Remove password',
  'Bitte genau 6 Ziffern eingeben': 'Please enter exactly 6 digits',
  'Passwort gesetzt': 'Password set',
  'Passwort entfernt': 'Password removed',
  'Passwort für {name}': 'Password for {name}',
  'Die Leiste ist mit einem 6-stelligen Passwort geschützt.': 'The strip is protected by a 6-digit password.',
  'Passwort geprüft': 'Password checked',
  'Verbindung': 'Connection',
  'Bekannte Leisten automatisch verbinden': 'Connect known strips automatically',
  'Alle Bluetooth-Geräte in der Auswahl zeigen (falls die Leiste nicht „LED…“ heißt)':
    'Show all Bluetooth devices in the picker (if the strip is not called “LED…”)',
  'Vergessen': 'Forget',
  'Bekannte Leisten:': 'Known strips:',
  'App': 'App',
  'Sprache': 'Language',
  'Version {v}': 'Version {v}',
  'Nach Updates suchen': 'Check for updates',
  'Beim Start nach Updates suchen': 'Check for updates on start',
  'Protokoll': 'Log',
  'Einschalten ✓': 'Turned on ✓',
  // connection dialogs
  'LED-Leiste auswählen': 'Choose LED strip',
  'Suche läuft … Leiste einschalten und in der Nähe halten.': 'Searching … switch the strip on and keep it close.',
  'Abbrechen': 'Cancel',
  'OK': 'OK',
  'Unbenannt': 'Unnamed',
  'Verbunden': 'Connected',
  'Abgebrochen': 'Cancelled',
  'Verbindung fehlgeschlagen: {e}': 'Connection failed: {e}',
  'Bitte zuerst mit der LED-Leiste verbinden': 'Please connect to the LED strip first',
  '{what} fehlgeschlagen: {e}': '{what} failed: {e}',
  'Unbekannter Fehler': 'Unknown error',
  'Keine Antwort der Leiste ({what})': 'No answer from the strip ({what})',
  'Nicht verbunden.': 'Not connected.',
  'Bereit. „Verbinden“ drücken und die LED-Leiste (meist „LED_BLE_…“) auswählen.':
    'Ready. Press “Connect” and choose the LED strip (usually “LED_BLE_…”).',
  // updates
  'Version {v} ist verfügbar.': 'Version {v} is available.',
  'Du hast die neueste Version ({v}).': 'You have the latest version ({v}).',
  'Update-Prüfung fehlgeschlagen: {e}': 'Update check failed: {e}',
  'Update wird geladen …': 'Downloading update …',
  'Herunterladen': 'Download',
};

let lang: Lang = 'de';

export function detectLang(saved: string | null): Lang {
  if (saved === 'de' || saved === 'en') return saved;
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function getLang() { return lang; }

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = lang === 'en' ? EN[key] ?? key : key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** (Re)applies the language to all marked elements; remembers the German originals. */
export function applyLang(next: Lang, root: ParentNode = document) {
  lang = next;
  document.documentElement.lang = next;
  for (const e of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    e.dataset.de ??= e.textContent ?? '';
    e.textContent = t(e.dataset.de);
  }
  for (const e of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const attr of e.dataset.i18nAttr!.split(',')) {
      const key = `de_${attr.replace(/-/g, '_')}`;
      e.dataset[key] ??= e.getAttribute(attr) ?? '';
      e.setAttribute(attr, t(e.dataset[key]!));
    }
  }
}

/** Every key used in the UI must have an English text – checked by the tests. */
export const englishKeys = () => Object.keys(EN);
