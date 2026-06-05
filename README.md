# TrackForge

TrackForge is a local-first Next.js PWA for building a personal Top 100 favorite songs list. It includes weighted scoring, manual drag-and-drop ranking, head-to-head comparison, import/export, and a progress dashboard.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```

## Install as a PWA

1. Run the app with `npm run dev` or `npm run start`.
2. Open it in Chrome, Edge, or another PWA-capable browser.
3. Use the in-app **Install App** button when it appears.
4. If the button is not visible, use the browser install icon in the address bar or menu.

The install prompt only appears when the browser decides the app is installable. TrackForge includes `public/manifest.json`, placeholder SVG icons, and `public/sw.js` for offline shell caching.

## MVP storage

All songs, ratings, custom weights, and manual rankings are saved in `localStorage` under `trackforge.library.v1`. There is no authentication and no server persistence yet.

## Import/export

- Export JSON for a full backup of songs and weights.
- Export CSV for spreadsheet-friendly song data.
- Import CSV with columns such as `title`, `artist`, `album`, `year`, `genre`, `link`, `notes`, `emotionalImpact`, `replayValue`, `lyrics`, `production`, `originality`, `personalMemories`, `overallEnjoyment`, and `manualRank`.

## Future extension points

- Replace localStorage helpers in `lib/music.ts` with a cloud sync adapter.
- Add Spotify API enrichment for album art, previews, and canonical links.
- Add account-based collections after the MVP data model stabilizes.
