# TrackForge

TrackForge is a local-first Next.js PWA for building a personal Top 100 favorite songs list. It includes weighted scoring, manual drag-and-drop ranking, head-to-head comparison, import/export, and a progress dashboard.

## Run locally

```bash
npm install
cp .env.example .env.local
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

## Spotify playlist import

TrackForge uses the official Spotify Web API with Authorization Code + PKCE. This is the correct flow for a browser/PWA app because there is no client secret in the frontend.

1. Go to the Spotify Developer Dashboard and create an app.
2. Copy the app's Client ID.
3. In the app settings, add these redirect URIs:
   - `http://localhost:3000/callback`
   - `http://localhost:3001/callback`
4. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

5. Restart the dev server after changing `.env.local`.
6. Open TrackForge and go to the Spotify tab.
7. Click **Connect Spotify** and approve access.
8. Paste a playlist URL like `https://open.spotify.com/playlist/{id}` or a URI like `spotify:playlist:{id}`.
9. Preview the tracks, select or deselect entries, then confirm the import.

Imported playlist tracks are fetched with pagination, so playlists larger than 100 tracks are supported. TrackForge stores the Spotify access token, refresh token, and expiry time in `localStorage` for the MVP.

## Future extension points

- Replace localStorage helpers in `lib/music.ts` with a cloud sync adapter.
- Expand Spotify API enrichment for genres, audio features, previews, and canonical metadata.
- Add account-based collections after the MVP data model stabilizes.
