# KfW-296 Förderrechner (KNN-WG)

Statische HTML-Version für einen einfachen Vorab-Check zur KfW 296 Förderung (ohne Upload, ohne Backend).

## Schnellstart (statisch)

- Datei `index.html` direkt im Browser öffnen
- oder über einen lokalen Webserver bereitstellen

## Optional: lokaler Server per Node

```bash
npx.cmd --yes serve -l 4173 .
```

Alternative mit Python:

```bash
python -m http.server 4173
```

## Enthaltene Features

- Einfache Einseiten-Maske in HTML/JavaScript
- Sofortige K.O.-Prüfung (Beginn, Zweck, Parallelförderung, Wärmeerzeuger)
- Technische Checks (EH55, LCA, LCC/KNN-Tool)
- Wohnflächen-/Aufenthaltsraum-Regeln pro Wohneinheit
- Ergebnisampel: `geeignet`, `nicht_geeignet`, `unklar`
- Laufzeit-/Tilgungsfrei-Auswahl (10/25/35 Jahre)
- Monatsrate mit lokalem Zinssatz (editierbar)

## Datei

- Einstieg: `index.html`

## Automatische Zins-Updates (Scraping)

Die Zinsen werden aus KfW- und Interhyp-Seiten in folgende Dateien geschrieben:

- `data/kfw/296.json`
- `data/market/interhyp_10y_ltv_gt90.json`

Das Frontend (`index.html`) liest diese Dateien direkt ein.

Aktuelle Zielquellen:

- KfW 296: `Konditionen - Annuitätendarlehen` auf
  `https://www.kfw.de/inlandsfoerderung/Privatpersonen/Neubau/F%C3%B6rderprodukte/Klimafreundlicher-Neubau-im-Niedrigpreissegment-(296)/`
- Interhyp: `Zinsbindung 10 Jahre` bei `Beleihungsauslauf >90` auf
  `https://www.interhyp.de/zinsen/`

- KfW-Workflow: `.github/workflows/kfw296.yml`
- Interhyp-Workflow: `.github/workflows/interhyp.yml`

Hinweis:

- Das Scraping ist heuristisch (Seitenstruktur kann sich ändern).
- Bei Fehlern bleiben last-known-good JSON-Dateien unverändert.

## Auto-Deploy zu IONOS (GitHub Actions)

Der Workflow `.github/workflows/deploy-ionos.yml` deployed bei jedem Push auf `main`/`master`
automatisch per FTPS auf IONOS. Dadurch werden auch tägliche/wöchentliche Rate-Updates
automatisch live gestellt.

Benötigte GitHub Repository-Secrets:

- `IONOS_FTP_SERVER` (z. B. `home123456.1and1-data.host`)
- `IONOS_FTP_USERNAME`
- `IONOS_FTP_PASSWORD`
- `IONOS_FTP_SERVER_DIR` (z. B. `/` oder `/htdocs/`)

## Neue TypeScript Scraper (GitHub Actions)

- KfW 296 JSON: `data/kfw/296.json`
- Interhyp JSON: `data/market/interhyp_10y_ltv_gt90.json`

Lokal testen:

```bash
npm ci
npm run kfw:296
npm run market:interhyp
```
