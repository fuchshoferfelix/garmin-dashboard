# Garmin Dashboard

Ein persönliches Dashboard für deine Garmin-Daten: Training, Erholung und Alltag auf einen Blick. Die Daten kommen live aus der **Garmin Personal API**. Ohne Verbindung zeigt die App automatisch Beispieldaten, sodass sie sich auch ohne Key ausprobieren lässt.

## Features

- **Kennzahlen** – Ruhepuls, HRV, Schlaf-Score und Body Battery (jeweils neuester Wert)
- **Training** – Laufkilometer pro Woche (16 Wochen), Herzfrequenz-Zonen, Trainingsbelastung
- **Karte** – Heatmap aller Outdoor-Läufe der letzten 12 Monate (Leaflet)
- **Erholung** – HRV mit Baseline, Ruhepuls, Schlafphasen, Body Battery, Stress
- **Alltag** – Schritte inkl. Tagesziel, Gewichtsverlauf
- **Kalender** – wann du aktiv warst
- **Aktivitäten** – Liste der letzten Einheiten mit Detailansicht (Route, Puls, Tempo, Höhe, Kadenz)
- **Export** – Daten als Markdown kopieren oder speichern, z. B. um sie mit Claude auszuwerten
- **Dark/Light Mode** und responsives Layout

## Tech-Stack

| Bereich    | Technologie                                        |
| ---------- | -------------------------------------------------- |
| Framework  | [Next.js](https://nextjs.org) 16 (App Router)      |
| UI         | React 19, Tailwind CSS 4                           |
| Charts     | [Recharts](https://recharts.org)                   |
| Karte      | [Leaflet](https://leafletjs.com)                   |
| Sprache    | TypeScript                                         |

## Loslegen

### Voraussetzungen

- Node.js 20 oder neuer
- Ein Garmin-Account mit Zugang zur Personal API

### Installation

```bash
git clone <repo-url>
cd garmin-dashboard
npm install
```

### API-Key einrichten

Lege eine Datei `.env.local` im Projektordner an:

```bash
GARMIN_PERSONAL_API_KEY=dein-key
```

Den Key erstellst du in Garmin Connect. Der alte Name `GARMIN_API_KEY` wird weiterhin akzeptiert.

Optional kannst du mit `GARMIN_PERSONAL_API_BASE_URL` eine andere API-Basis-URL setzen.

### Starten

```bash
npm run dev
```

Danach ist das Dashboard unter [http://localhost:3000](http://localhost:3000) erreichbar.

| Befehl          | Beschreibung                  |
| --------------- | ----------------------------- |
| `npm run dev`   | Entwicklungsserver            |
| `npm run build` | Produktions-Build             |
| `npm start`     | Produktions-Server starten    |
| `npm run lint`  | Code mit ESLint prüfen        |

## Projektstruktur

```
app/
  page.tsx, layout.tsx, globals.css
  api/garmin/
    dashboard/       Gesamtdaten für das Dashboard
    heatmap/         GPS-Routen aller Läufe
    activity/[id]/   Detaildaten einer Aktivität
    status/          Verbindungscheck (nur Status und Anzahl, keine Rohdaten)
components/          Dashboard, Charts, Karte, Kalender, Export, Theme-Toggle
lib/
  garmin.ts          Garmin-API-Client (nur serverseitig)
  dashboard.ts       Aufbereitung der Rohdaten zum Dashboard-Payload
  routes.ts          Heatmap und Aktivitätsdetails
  export.ts          Markdown-Export
  mock.ts            Beispieldaten als Fallback
  types.ts           Gemeinsame Typen für Server und Client
```

## Wie es funktioniert

1. Der Browser lädt `/api/garmin/dashboard`.
2. Die Route tauscht auf dem Server den API-Key gegen ein kurzlebiges Bearer-Token und ruft die Garmin-Endpunkte ab (Aktivitäten, Schlaf, HRV, Stress, Body Battery, Schritte, Gewicht).
3. `lib/dashboard.ts` fasst alles zu einem `DashboardData`-Objekt zusammen, das die Komponenten rendern.
4. Schlägt der Abruf fehl (z. B. kein oder ungültiger Key), zeigt das Dashboard einen Hinweis und nutzt Beispieldaten aus `lib/mock.ts`.

Der Garmin-Client cached Antworten 10 Minuten im Speicher, teilt parallele identische Requests und erneuert das Token automatisch.

## Datenschutz und Sicherheit

- Der API-Key wird **nur serverseitig** gelesen und gelangt nie in den Browser.
- `.env.local` ist über `.gitignore` ausgeschlossen. Committe sie nicht.
- Die API-Routen liefern `Cache-Control: no-store`.
- Die Daten gehören dir: Es gibt keine Datenbank und keinen Drittanbieter, nur dein Server und Garmin.

## Fehlerbehebung

| Meldung                                  | Ursache und Lösung                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| „Kein API-Key gefunden“                  | `GARMIN_PERSONAL_API_KEY` fehlt in `.env.local`. Nach dem Eintragen den Dev-Server neu starten. |
| „Key ungültig oder abgelaufen“           | In Garmin Connect einen neuen Key erstellen und eintragen.                                 |
| „Garmin ist gerade nicht erreichbar“     | Garmin antwortet nicht oder mit Fehler. Später erneut versuchen.                           |
| Dashboard zeigt Beispieldaten            | Die Verbindung zu Garmin hat nicht geklappt, siehe Hinweis oben auf der Seite.             |

Mit `GET /api/garmin/status` prüfst du schnell, ob die Verbindung steht.

## Deployment

Das Projekt lässt sich z. B. auf [Vercel](https://vercel.com) deployen. Hinterlege `GARMIN_PERSONAL_API_KEY` dort als Umgebungsvariable. Da das Dashboard persönliche Gesundheitsdaten zeigt, solltest du die Seite nicht öffentlich erreichbar machen, sondern z. B. mit einem Zugriffsschutz absichern.
