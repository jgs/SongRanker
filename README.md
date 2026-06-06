# TrackForge

TrackForge is a local-first Next.js PWA for building a personal Top 100 favorite songs list. It includes weighted scoring, manual drag-and-drop ranking, head-to-head comparison, import/export, and a progress dashboard.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3001
```

Open `http://127.0.0.1:3001`.

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
3. In the app settings, set the website to:
   - `http://127.0.0.1:3001`
4. In the app settings, add this local redirect URI:
   - `http://127.0.0.1:3001/callback`
5. For production, add your production callback too:
   - `https://YOUR_DOMAIN/callback`
6. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001
```

7. Paste your Spotify Client ID into `.env.local`.
8. Restart the dev server after changing `.env.local`.
9. Open TrackForge and go to the Spotify tab.
10. Click **Connect Spotify** and approve access.
11. Paste a playlist URL like `https://open.spotify.com/playlist/{id}` or a URI like `spotify:playlist:{id}`.
12. Preview the tracks, select or deselect entries, then confirm the import.

Imported playlist tracks are fetched with pagination, so playlists larger than 100 tracks are supported. TrackForge stores the Spotify access token, refresh token, and expiry time in `localStorage` for the MVP.

### Playlist sync

After importing a playlist, TrackForge saves a local playlist snapshot with the Spotify playlist ID, name, cover image, track total, imported count, latest sync time, Spotify snapshot ID, and a lightweight track hash.

Use **Spotify > My Playlists > Update Playlist** to sync later:

- New Spotify tracks are appended to the archive.
- Existing ratings, notes, manual ranks, comparisons, and Top 100 positions are preserved.
- Duplicate tracks are not imported again.
- Tracks removed from Spotify are not deleted from TrackForge; they get a **No longer in Spotify playlist** badge.
- **Spotify > Sync History** shows Imported and Synced timeline events.
- **Spotify > Debug** shows the current app URL, redirect URI, connection state, token expiry, and scopes.

## Future extension points

- Replace localStorage helpers in `lib/music.ts` with a cloud sync adapter.
- Expand Spotify API enrichment for genres, audio features, previews, and canonical metadata.
- Add account-based collections after the MVP data model stabilizes.
