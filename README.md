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

Die Zinsen werden aus KfW- und Interhyp-Seiten in `rates.json` geschrieben.

Aktuelle Zielquellen:

- KfW 296: `Konditionen - Annuitätendarlehen` auf
  `https://www.kfw.de/inlandsfoerderung/Privatpersonen/Neubau/F%C3%B6rderprodukte/Klimafreundlicher-Neubau-im-Niedrigpreissegment-(296)/`
- Interhyp: `Zinsbindung 10 Jahre` bei `Beleihungsauslauf >90` auf
  `https://www.interhyp.de/zinsen/`

- Scraping-Skript: `scripts/update-rates.mjs`
- Datenquelle für Frontend: `rates.json`
- Automatischer Job: `.github/workflows/update-rates.yml`

Manuell ausführen:

```bash
node scripts/update-rates.mjs
```

Optional eigene URLs setzen:

```bash
KFW_RATES_URL="..." INTERHYP_RATES_URL="..." node scripts/update-rates.mjs
```

Hinweis:

- Das Scraping ist heuristisch (Seitenstruktur kann sich ändern).
- Bei Fehlern werden letzte/Default-Werte als Fallback in `rates.json` verwendet.

## Auto-Deploy zu IONOS (GitHub Actions)

Der Workflow `.github/workflows/deploy-ionos.yml` deployed bei jedem Push auf `main`/`master`
automatisch per FTPS auf IONOS. Dadurch werden auch tägliche/wöchentliche Rate-Updates
automatisch live gestellt.

Benötigte GitHub Repository-Secrets:

- `IONOS_FTP_SERVER` (z. B. `home123456.1and1-data.host`)
- `IONOS_FTP_USERNAME`
- `IONOS_FTP_PASSWORD`
- `IONOS_FTP_SERVER_DIR` (z. B. `/` oder `/htdocs/`)
