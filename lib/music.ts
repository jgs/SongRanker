export const CRITERIA = [
  { key: "emotionalImpact", label: "Emotional impact" },
  { key: "replayValue", label: "Replay value" },
  { key: "lyrics", label: "Lyrics" },
  { key: "production", label: "Production" },
  { key: "originality", label: "Originality" },
  { key: "personalMemories", label: "Personal memories" },
  { key: "overallEnjoyment", label: "Overall enjoyment" }
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];
export type Ratings = Record<CriterionKey, number>;
export type Weights = Record<CriterionKey, number>;

export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  genre: string;
  link: string;
  notes: string;
  ratings: Ratings;
  manualRank: number;
  spotifyId?: string;
  albumArtUrl?: string;
  source?: "manual" | "spotify" | "csv" | "sample";
  spotifyPlaylistIds?: string[];
  importedAt?: string;
  removedFromPlaylist?: boolean;
};

export type PlaylistImport = {
  id: string;
  spotifyPlaylistId: string;
  playlistName: string;
  snapshotDate: string;
  totalTracks: number;
  importedTracks: number;
  lastSync: string;
  imageUrl?: string;
  spotifySnapshotId?: string;
  lastPlaylistHash?: string;
};

export type PlaylistSyncEvent = {
  id: string;
  playlistImportId: string;
  type: "imported" | "synced" | "updated";
  date: string;
  changesCount: number;
  importedTracks: number;
  skippedDuplicates: number;
  removedTracks: number;
  totalTracks: number;
  message: string;
};

export type Library = {
  songs: Song[];
  weights: Weights;
  playlistImports: PlaylistImport[];
  syncHistory: PlaylistSyncEvent[];
};

const STORAGE_KEY = "trackforge.library.v1";

export const DEFAULT_WEIGHTS: Weights = {
  emotionalImpact: 1.4,
  replayValue: 1.2,
  lyrics: 1,
  production: 1,
  originality: 0.9,
  personalMemories: 1.3,
  overallEnjoyment: 1.5
};

const defaultRatings: Ratings = {
  emotionalImpact: 8,
  replayValue: 8,
  lyrics: 8,
  production: 8,
  originality: 8,
  personalMemories: 8,
  overallEnjoyment: 8
};

export function createSong(input: Partial<Song>): Song {
  return {
    id: input.id ?? randomId(),
    title: input.title ?? "",
    artist: input.artist ?? "",
    album: input.album ?? "",
    year: input.year ?? new Date().getFullYear(),
    genre: input.genre ?? "",
    link: input.link ?? "",
    notes: input.notes ?? "",
    ratings: { ...defaultRatings, ...input.ratings },
    manualRank: input.manualRank ?? 1,
    spotifyId: input.spotifyId,
    albumArtUrl: input.albumArtUrl,
    source: input.source ?? "manual",
    spotifyPlaylistIds: input.spotifyPlaylistIds ?? [],
    importedAt: input.importedAt,
    removedFromPlaylist: input.removedFromPlaylist ?? false
  };
}

export function calculateScore(song: Song, weights: Weights) {
  const totalWeight = CRITERIA.reduce((sum, criterion) => sum + weights[criterion.key], 0);
  if (!totalWeight) return 0;
  const weighted = CRITERIA.reduce((sum, criterion) => {
    return sum + song.ratings[criterion.key] * weights[criterion.key];
  }, 0);
  return weighted / totalWeight;
}

export function sortedByWeightedScore(songs: Song[], weights: Weights) {
  return [...songs].sort((a, b) => calculateScore(b, weights) - calculateScore(a, weights));
}

export function loadLibrary(): Library {
  if (typeof window === "undefined") return { songs: sampleSongs, weights: DEFAULT_WEIGHTS, playlistImports: [], syncHistory: [] };

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const library = { songs: sampleSongs, weights: DEFAULT_WEIGHTS, playlistImports: [], syncHistory: [] };
    saveLibrary(library);
    return library;
  }

  try {
    const parsed = JSON.parse(saved) as Library;
    return {
      songs: parsed.songs?.map((song, index) => createSong({ ...song, manualRank: song.manualRank ?? index + 1, source: song.source ?? "manual" })) ?? sampleSongs,
      weights: { ...DEFAULT_WEIGHTS, ...parsed.weights },
      playlistImports: Array.isArray(parsed.playlistImports) ? parsed.playlistImports : [],
      syncHistory: Array.isArray(parsed.syncHistory) ? parsed.syncHistory : []
    };
  } catch {
    return { songs: sampleSongs, weights: DEFAULT_WEIGHTS, playlistImports: [], syncHistory: [] };
  }
}

export function saveLibrary(library: Library) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function exportJson(songs: Song[], weights: Weights) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), weights, songs }, null, 2);
}

export function serializeCsv(songs: Song[]) {
  const headers = [
    "title",
    "artist",
    "album",
    "year",
    "genre",
    "link",
    "notes",
    "spotifyId",
    "albumArtUrl",
    "source",
    "spotifyPlaylistIds",
    "importedAt",
    "removedFromPlaylist",
    ...CRITERIA.map((criterion) => criterion.key),
    "manualRank"
  ];
  const rows = songs.map((song) => {
    const values = [
      song.title,
      song.artist,
      song.album,
      String(song.year),
      song.genre,
      song.link,
      song.notes,
      song.spotifyId ?? "",
      song.albumArtUrl ?? "",
      song.source ?? "manual",
      song.spotifyPlaylistIds?.join("|") ?? "",
      song.importedAt ?? "",
      String(Boolean(song.removedFromPlaylist)),
      ...CRITERIA.map((criterion) => String(song.ratings[criterion.key])),
      String(song.manualRank)
    ];
    return values.map(csvEscape).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

export function deserializeCsv(csv: string) {
  const rows = parseCsv(csv);
  const [headers = [], ...data] = rows;
  const normalized = headers.map((header) => header.trim());
  return data
    .filter((row) => row.some(Boolean))
    .map((row, index) => {
      const record = Object.fromEntries(normalized.map((header, headerIndex) => [header, row[headerIndex] ?? ""]));
      const ratings = CRITERIA.reduce((acc, criterion) => {
        acc[criterion.key] = clampRating(Number(record[criterion.key]) || 8);
        return acc;
      }, {} as Ratings);

      return createSong({
        id: randomId(),
        title: record.title,
        artist: record.artist,
        album: record.album,
        year: Number(record.year) || new Date().getFullYear(),
        genre: record.genre,
        link: record.link,
        notes: record.notes,
        spotifyId: record.spotifyId,
        albumArtUrl: record.albumArtUrl,
        source: "csv",
        spotifyPlaylistIds: record.spotifyPlaylistIds ? record.spotifyPlaylistIds.split("|").filter(Boolean) : [],
        importedAt: record.importedAt,
        removedFromPlaylist: record.removedFromPlaylist === "true",
        ratings,
        manualRank: Number(record.manualRank) || index + 1
      });
    });
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows;
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function clampRating(value: number) {
  return Math.max(1, Math.min(10, value));
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const sampleSongs: Song[] = [
  createSong({ title: "Everything In Its Right Place", artist: "Radiohead", album: "Kid A", year: 2000, genre: "Art Rock", link: "https://open.spotify.com/", notes: "The reset button. Cold, strange, and completely alive.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 8, production: 10, originality: 10, personalMemories: 9, overallEnjoyment: 10 }, manualRank: 1, source: "sample" }),
  createSong({ title: "Run Away With Me", artist: "Carly Rae Jepsen", album: "E-MO-TION", year: 2015, genre: "Pop", link: "https://open.spotify.com/", notes: "Saxophone ignition, windows down.", ratings: { emotionalImpact: 9, replayValue: 10, lyrics: 8, production: 9, originality: 8, personalMemories: 9, overallEnjoyment: 10 }, manualRank: 2 }),
  createSong({ title: "Nights", artist: "Frank Ocean", album: "Blonde", year: 2016, genre: "R&B", link: "https://open.spotify.com/", notes: "Two lives stitched together by a beat switch.", ratings: { emotionalImpact: 10, replayValue: 10, lyrics: 10, production: 10, originality: 10, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 3 }),
  createSong({ title: "All My Friends", artist: "LCD Soundsystem", album: "Sound of Silver", year: 2007, genre: "Dance Punk", link: "https://open.spotify.com/", notes: "Aging, sprinting, laughing, refusing to leave.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 10, production: 9, originality: 9, personalMemories: 9, overallEnjoyment: 10 }, manualRank: 4 }),
  createSong({ title: "A Case of You", artist: "Joni Mitchell", album: "Blue", year: 1971, genre: "Folk", link: "https://open.spotify.com/", notes: "Devastating writing with no armor on.", ratings: { emotionalImpact: 10, replayValue: 8, lyrics: 10, production: 8, originality: 9, personalMemories: 8, overallEnjoyment: 9 }, manualRank: 5 }),
  createSong({ title: "Digital Love", artist: "Daft Punk", album: "Discovery", year: 2001, genre: "House", link: "https://open.spotify.com/", notes: "The dream sequence never gets old.", ratings: { emotionalImpact: 9, replayValue: 10, lyrics: 8, production: 10, originality: 9, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 6 }),
  createSong({ title: "Motion Picture Soundtrack", artist: "Radiohead", album: "Kid A", year: 2000, genre: "Art Rock", link: "https://open.spotify.com/", notes: "Closing credits for a feeling.", ratings: { emotionalImpact: 10, replayValue: 7, lyrics: 9, production: 9, originality: 9, personalMemories: 9, overallEnjoyment: 9 }, manualRank: 7 }),
  createSong({ title: "Dancing On My Own", artist: "Robyn", album: "Body Talk", year: 2010, genre: "Pop", link: "https://open.spotify.com/", notes: "Euphoria and heartbreak in the same room.", ratings: { emotionalImpact: 10, replayValue: 10, lyrics: 9, production: 9, originality: 8, personalMemories: 9, overallEnjoyment: 10 }, manualRank: 8 }),
  createSong({ title: "Impossible Soul", artist: "Sufjan Stevens", album: "The Age of Adz", year: 2010, genre: "Indie", link: "https://open.spotify.com/", notes: "A whole weather system disguised as a song.", ratings: { emotionalImpact: 9, replayValue: 8, lyrics: 9, production: 10, originality: 10, personalMemories: 8, overallEnjoyment: 9 }, manualRank: 9 }),
  createSong({ title: "Supercut", artist: "Lorde", album: "Melodrama", year: 2017, genre: "Pop", link: "https://open.spotify.com/", notes: "Memory as a dance floor.", ratings: { emotionalImpact: 9, replayValue: 10, lyrics: 9, production: 9, originality: 8, personalMemories: 10, overallEnjoyment: 10 }, manualRank: 10 }),
  createSong({ title: "Hounds of Love", artist: "Kate Bush", album: "Hounds of Love", year: 1985, genre: "Art Pop", link: "https://open.spotify.com/", notes: "Big drums, mythic panic, total release.", ratings: { emotionalImpact: 9, replayValue: 9, lyrics: 9, production: 10, originality: 10, personalMemories: 7, overallEnjoyment: 9 }, manualRank: 11 }),
  createSong({ title: "Reckoner", artist: "Radiohead", album: "In Rainbows", year: 2007, genre: "Alternative", link: "https://open.spotify.com/", notes: "Floating percussion and soft devastation.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 9, production: 10, originality: 9, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 12 }),
  createSong({ title: "Alright", artist: "Kendrick Lamar", album: "To Pimp a Butterfly", year: 2015, genre: "Hip-Hop", link: "https://open.spotify.com/", notes: "Joy as resistance.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 10, production: 10, originality: 9, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 13 }),
  createSong({ title: "Dreams", artist: "Fleetwood Mac", album: "Rumours", year: 1977, genre: "Rock", link: "https://open.spotify.com/", notes: "Effortless until you notice the ache.", ratings: { emotionalImpact: 9, replayValue: 10, lyrics: 9, production: 9, originality: 8, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 14 }),
  createSong({ title: "Cellophane", artist: "FKA twigs", album: "MAGDALENE", year: 2019, genre: "Art Pop", link: "https://open.spotify.com/", notes: "So exposed it almost hurts to press play.", ratings: { emotionalImpact: 10, replayValue: 8, lyrics: 9, production: 10, originality: 10, personalMemories: 7, overallEnjoyment: 9 }, manualRank: 15 }),
  createSong({ title: "Heroes", artist: "David Bowie", album: "Heroes", year: 1977, genre: "Rock", link: "https://open.spotify.com/", notes: "A wall of sound trying to become courage.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 9, production: 9, originality: 9, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 16 }),
  createSong({ title: "I Know the End", artist: "Phoebe Bridgers", album: "Punisher", year: 2020, genre: "Indie Rock", link: "https://open.spotify.com/", notes: "A quiet road trip into apocalypse.", ratings: { emotionalImpact: 10, replayValue: 8, lyrics: 10, production: 9, originality: 9, personalMemories: 8, overallEnjoyment: 9 }, manualRank: 17 }),
  createSong({ title: "Time to Pretend", artist: "MGMT", album: "Oracular Spectacular", year: 2007, genre: "Synth Pop", link: "https://open.spotify.com/", notes: "Naive fantasy with a shadow under it.", ratings: { emotionalImpact: 8, replayValue: 10, lyrics: 9, production: 9, originality: 9, personalMemories: 9, overallEnjoyment: 9 }, manualRank: 18 }),
  createSong({ title: "Fast Car", artist: "Tracy Chapman", album: "Tracy Chapman", year: 1988, genre: "Folk Rock", link: "https://open.spotify.com/", notes: "Plainspoken hope, perfectly framed.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 10, production: 8, originality: 9, personalMemories: 8, overallEnjoyment: 10 }, manualRank: 19 }),
  createSong({ title: "Let Down", artist: "Radiohead", album: "OK Computer", year: 1997, genre: "Alternative", link: "https://open.spotify.com/", notes: "The lift-off still arrives every time.", ratings: { emotionalImpact: 10, replayValue: 9, lyrics: 9, production: 9, originality: 9, personalMemories: 9, overallEnjoyment: 10 }, manualRank: 20 })
].map((song) => ({ ...song, source: "sample" }));
