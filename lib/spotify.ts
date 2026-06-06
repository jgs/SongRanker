import { createSong, Song } from "@/lib/music";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const TOKEN_KEY = "trackforge.spotify.tokens.v1";
const PKCE_KEY = "trackforge.spotify.pkce.v1";
const SCOPES = ["playlist-read-private", "playlist-read-collaborative"];

export type SpotifyTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
};

export type SpotifyPlaylistPreview = {
  spotifyPlaylistId: string;
  playlistName: string;
  playlistUrl: string;
  totalTracks: number;
  unavailableTracks: number;
  imageUrl?: string;
  spotifySnapshotId?: string;
  playlistHash: string;
  tracks: Song[];
};

type SpotifyPlaylist = {
  id: string;
  name: string;
  snapshot_id?: string;
  images?: Array<{ url: string }>;
  external_urls?: { spotify?: string };
  tracks: {
    href: string;
    total: number;
    items: SpotifyPlaylistTrack[];
    next: string | null;
  };
};

type SpotifyPlaylistPage = {
  items: SpotifyPlaylistTrack[];
  next: string | null;
};

type SpotifyPlaylistTrack = {
  track: SpotifyTrack | null;
};

type SpotifyTrack = {
  id: string | null;
  name: string;
  external_urls?: { spotify?: string };
  artists: Array<{ name: string }>;
  album: {
    name: string;
    release_date?: string;
    images?: Array<{ url: string }>;
  };
};

export function getSpotifyClientId() {
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
}

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (process.env.NODE_ENV === "development" && configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return configured?.replace(/\/$/, "") ?? "";
}

export function getRedirectUri() {
  const baseUrl = getAppUrl();
  return `${baseUrl}/callback`;
}

export function getSpotifyScopes() {
  return SCOPES;
}

export function getSpotifyDiagnostics() {
  const tokens = getStoredSpotifyTokens();
  return {
    appUrl: getAppUrl(),
    redirectUri: getRedirectUri(),
    connected: Boolean(tokens),
    tokenExpiry: tokens ? new Date(tokens.expiresAt).toLocaleString() : "Not connected",
    scopes: tokens?.scopes?.length ? tokens.scopes : SCOPES
  };
}

export function getStoredSpotifyTokens(): SpotifyTokens | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(TOKEN_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as SpotifyTokens;
  } catch {
    return null;
  }
}

export function saveSpotifyTokens(tokens: SpotifyTokens) {
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function disconnectSpotify() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PKCE_KEY);
}

export async function startSpotifyLogin() {
  const clientId = getSpotifyClientId();
  validateSpotifySetup(clientId);

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri();

  window.localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirectUri }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

export async function completeSpotifyLogin(code: string, returnedState: string | null) {
  const clientId = getSpotifyClientId();
  const saved = window.localStorage.getItem(PKCE_KEY);
  validateSpotifySetup(clientId);
  if (!saved) throw new Error("Missing saved Spotify login state. Go back to TrackForge and click Connect Spotify again.");

  const pkce = JSON.parse(saved) as { verifier: string; state: string; redirectUri: string };
  if (!returnedState || returnedState !== pkce.state) {
    throw new Error("Spotify login state did not match. Restart Spotify connection from TrackForge.");
  }

  if (pkce.redirectUri !== getRedirectUri()) {
    throw new Error(`Spotify redirect mismatch. Expected ${pkce.redirectUri}, but the app is now using ${getRedirectUri()}. Restart the connection.`);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: pkce.redirectUri,
    code_verifier: pkce.verifier
  });

  const payload = await postTokenRequest(body);
  const tokens = toStoredTokens(payload);
  saveSpotifyTokens(tokens);
  window.localStorage.removeItem(PKCE_KEY);
  return tokens;
}

export async function getValidSpotifyAccessToken() {
  const tokens = getStoredSpotifyTokens();
  if (!tokens) throw new Error("Connect Spotify first.");
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    disconnectSpotify();
    throw new Error("Spotify session expired. Connect Spotify again.");
  }

  const clientId = getSpotifyClientId();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken
  });

  const payload = await postTokenRequest(body);
  const refreshed = toStoredTokens(payload, tokens.refreshToken);
  saveSpotifyTokens(refreshed);
  return refreshed.accessToken;
}

export function extractSpotifyPlaylistId(input: string) {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(trimmed);
    if (url.hostname === "open.spotify.com") {
      const [, type, id] = url.pathname.split("/");
      if (type === "playlist" && id) return id;
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchSpotifyPlaylistPreview(playlistInput: string): Promise<SpotifyPlaylistPreview> {
  const playlistId = extractSpotifyPlaylistId(playlistInput);
  if (!playlistId) {
    throw new Error("Paste a valid Spotify playlist URL or URI.");
  }

  const playlist = await spotifyFetch<SpotifyPlaylist>(
    `${API_URL}/playlists/${playlistId}?fields=id,name,snapshot_id,images,external_urls.spotify,tracks(href,total,next,items(track(id,name,external_urls.spotify,artists(name),album(name,release_date,images))))`
  );

  const allItems = [...playlist.tracks.items];
  let next = playlist.tracks.next;
  while (next) {
    const page = await spotifyFetch<SpotifyPlaylistPage>(next);
    allItems.push(...page.items);
    next = page.next;
  }

  let unavailableTracks = 0;
  const tracks = allItems.flatMap((item, index) => {
    if (!item.track) {
      unavailableTracks += 1;
      return [];
    }
    return [spotifyTrackToSong(item.track, playlist.name, index + 1)];
  });

  return {
    spotifyPlaylistId: playlist.id,
    playlistName: playlist.name,
    playlistUrl: playlist.external_urls?.spotify ?? playlistInput,
    totalTracks: playlist.tracks.total,
    unavailableTracks,
    imageUrl: playlist.images?.[0]?.url,
    spotifySnapshotId: playlist.snapshot_id,
    playlistHash: hashPlaylistTracks(tracks),
    tracks
  };
}

export function findImportDuplicate(candidate: Song, existingSongs: Song[]) {
  if (candidate.spotifyId) {
    return existingSongs.find((song) => song.spotifyId && song.spotifyId === candidate.spotifyId) ?? null;
  }
  const candidateKey = normalizeSongKey(candidate);
  return existingSongs.find((song) => normalizeSongKey(song) === candidateKey) ?? null;
}

export function normalizeSongKey(song: Pick<Song, "title" | "artist">) {
  return `${normalizeText(song.title)}::${normalizeText(song.artist)}`;
}

async function spotifyFetch<T>(url: string): Promise<T> {
  const accessToken = await getValidSpotifyAccessToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 401) {
    disconnectSpotify();
    throw new Error("Spotify session expired. Connect Spotify again.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(`Spotify rate limit reached. Try again${retryAfter ? ` in ${retryAfter} seconds` : " shortly"}.`);
  }

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new Error(detail || `Spotify request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function postTokenRequest(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new Error(detail || "Spotify token exchange failed.");
  }

  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>;
}

function toStoredTokens(payload: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }, fallbackRefreshToken?: string): SpotifyTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? fallbackRefreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scopes: payload.scope?.split(" ").filter(Boolean) ?? SCOPES
  };
}

function spotifyTrackToSong(track: SpotifyTrack, playlistName: string, manualRank: number) {
  const releaseYear = Number(track.album.release_date?.slice(0, 4)) || new Date().getFullYear();
  return createSong({
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(", "),
    album: track.album.name,
    year: releaseYear,
    genre: "",
    link: track.external_urls?.spotify ?? "",
    notes: `Imported from Spotify playlist: ${playlistName}`,
    spotifyId: track.id ?? undefined,
    albumArtUrl: track.album.images?.[0]?.url,
    source: "spotify",
    manualRank,
    importedAt: new Date().toISOString()
  });
}

function validateSpotifySetup(clientId: string) {
  if (!clientId) {
    throw new Error("Missing NEXT_PUBLIC_SPOTIFY_CLIENT_ID. Add it to .env.local, restart Next.js, then try again.");
  }

  const redirectUri = getRedirectUri();
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error(`Invalid Spotify redirect URI: ${redirectUri}. Check NEXT_PUBLIC_APP_URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Invalid Spotify redirect URI protocol: ${redirectUri}. Use http for local 127.0.0.1 or https in production.`);
  }

  if (process.env.NODE_ENV === "development" && parsed.hostname === "localhost") {
    throw new Error("Spotify local redirects must use 127.0.0.1, not localhost. Set NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001.");
  }

  if (parsed.pathname !== "/callback") {
    throw new Error(`Spotify redirect URI must end with /callback. Current value: ${redirectUri}`);
  }
}

function hashPlaylistTracks(tracks: Song[]) {
  return tracks.map((track) => track.spotifyId ?? normalizeSongKey(track)).join("|");
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function safeErrorText(response: Response) {
  try {
    const payload = await response.json();
    return payload.error?.message ?? payload.error_description ?? null;
  } catch {
    return null;
  }
}
