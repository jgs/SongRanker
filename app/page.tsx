"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  GripVertical,
  Headphones,
  Import,
  Loader2,
  ListMusic,
  Medal,
  Music2,
  Pencil,
  Plus,
  Save,
  Shuffle,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InstallButton } from "@/components/install-button";
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  Song,
  Weights,
  calculateScore,
  createSong,
  deserializeCsv,
  exportJson,
  loadLibrary,
  saveLibrary,
  serializeCsv,
  sortedByWeightedScore
} from "@/lib/music";
import {
  SpotifyPlaylistPreview,
  disconnectSpotify,
  fetchSpotifyPlaylistPreview,
  findImportDuplicate,
  getSpotifyClientId,
  getStoredSpotifyTokens,
  startSpotifyLogin
} from "@/lib/spotify";

type View = "archive" | "top100" | "compare" | "progress" | "spotify" | "data";
type NavItem = [View, string, LucideIcon];

const emptyForm = createSong({
  title: "",
  artist: "",
  album: "",
  year: new Date().getFullYear(),
  genre: "",
  link: "",
  notes: ""
});

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<View>("archive");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Song>(emptyForm);
  const [comparePair, setComparePair] = useState<[Song, Song] | null>(null);
  const [notice, setNotice] = useState("Sample archive loaded locally.");
  const [loaded, setLoaded] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyPreview, setSpotifyPreview] = useState<SpotifyPlaylistPreview | null>(null);
  const [selectedSpotifyIds, setSelectedSpotifyIds] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const library = loadLibrary();
    setSongs(library.songs);
    setWeights(library.weights);
    setSpotifyConnected(Boolean(getStoredSpotifyTokens()));
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    if (requestedView === "spotify") setView("spotify");
    if (params.get("spotify") === "connected") setNotice("Spotify connected. Paste a playlist URL to import.");
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      saveLibrary({ songs, weights });
    }
  }, [loaded, songs, weights]);

  const rankedSongs = useMemo(() => {
    return [...songs].sort((a, b) => a.manualRank - b.manualRank);
  }, [songs]);

  const weightedSongs = useMemo(() => sortedByWeightedScore(songs, weights), [songs, weights]);
  const top100 = rankedSongs.slice(0, 100);
  const completion = Math.min(100, Math.round((songs.length / 100) * 100));
  const averageScore = songs.length
    ? songs.reduce((sum, song) => sum + calculateScore(song, weights), 0) / songs.length
    : 0;

  function resetForm() {
    setEditingId(null);
    setForm(createSong({ title: "", artist: "", album: "", year: new Date().getFullYear(), genre: "", link: "", notes: "" }));
  }

  function upsertSong() {
    if (!form.title.trim() || !form.artist.trim()) {
      setNotice("Title and artist are required.");
      return;
    }

    if (editingId) {
      setSongs((current) => current.map((song) => (song.id === editingId ? { ...form, title: form.title.trim(), artist: form.artist.trim() } : song)));
      setNotice(`Updated ${form.title}.`);
    } else {
      const nextRank = songs.length ? Math.max(...songs.map((song) => song.manualRank)) + 1 : 1;
      setSongs((current) => [...current, { ...form, id: crypto.randomUUID(), manualRank: nextRank, source: "manual" }]);
      setNotice(`Added ${form.title}.`);
    }
    resetForm();
  }

  function editSong(song: Song) {
    setEditingId(song.id);
    setForm(song);
    setView("archive");
  }

  function deleteSong(id: string) {
    const removed = songs.find((song) => song.id === id);
    setSongs((current) => rerank(current.filter((song) => song.id !== id)));
    setNotice(removed ? `Deleted ${removed.title}.` : "Song deleted.");
  }

  function updateRating(key: keyof Song["ratings"], value: number) {
    setForm((current) => ({
      ...current,
      ratings: { ...current.ratings, [key]: value }
    }));
  }

  function updateWeight(key: keyof Weights, value: number) {
    setWeights((current) => ({ ...current, [key]: value }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rankedSongs.findIndex((song) => song.id === active.id);
    const newIndex = rankedSongs.findIndex((song) => song.id === over.id);
    const reordered = rerank(arrayMove(rankedSongs, oldIndex, newIndex));
    setSongs(reordered);
    setNotice("Manual Top 100 order updated.");
  }

  function startComparison() {
    if (songs.length < 2) {
      setNotice("Add at least two songs to compare.");
      return;
    }
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    setComparePair([shuffled[0], shuffled[1]]);
  }

  function chooseWinner(winner: Song, loser: Song) {
    const ordered = [...rankedSongs];
    const winnerIndex = ordered.findIndex((song) => song.id === winner.id);
    const loserIndex = ordered.findIndex((song) => song.id === loser.id);
    const next = arrayMove(ordered, winnerIndex, Math.min(winnerIndex, loserIndex));
    setSongs(rerank(next));
    setNotice(`${winner.title} moved ahead in your manual ranking.`);
    startComparison();
  }

  function downloadFile(filename: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importCsv(file: File) {
    file.text().then((text) => {
      const imported = deserializeCsv(text);
      setSongs(rerank([...songs, ...imported]));
      setNotice(`Imported ${imported.length} songs from CSV.`);
    });
  }

  async function connectSpotify() {
    try {
      await startSpotifyLogin();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not start Spotify login.");
    }
  }

  function disconnectFromSpotify() {
    disconnectSpotify();
    setSpotifyConnected(false);
    setSpotifyPreview(null);
    setSelectedSpotifyIds(new Set());
    setNotice("Spotify disconnected.");
  }

  async function loadSpotifyPreview(playlistUrl: string) {
    try {
      setNotice("Loading Spotify playlist...");
      const preview = await fetchSpotifyPlaylistPreview(playlistUrl);
      setSpotifyPreview(preview);
      setSelectedSpotifyIds(new Set(preview.tracks.map((track) => track.id)));
      setNotice(`Found ${preview.totalTracks} Spotify tracks in ${preview.playlistName}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Spotify import failed.");
    }
  }

  function toggleSpotifyTrack(id: string) {
    setSelectedSpotifyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmSpotifyImport() {
    if (!spotifyPreview) return;

    let skippedDuplicates = 0;
    const failedTracks = spotifyPreview.unavailableTracks;
    const chosen = spotifyPreview.tracks.filter((track) => selectedSpotifyIds.has(track.id));
    const existingAndIncoming = [...songs];
    const imported: Song[] = [];

    for (const track of chosen) {
      if (findImportDuplicate(track, existingAndIncoming)) {
        skippedDuplicates += 1;
        continue;
      }
      const nextRank = existingAndIncoming.length + 1;
      const rankedTrack = { ...track, manualRank: nextRank };
      imported.push(rankedTrack);
      existingAndIncoming.push(rankedTrack);
    }

    setSongs(rerank(existingAndIncoming));
    setNotice(
      `Spotify import summary: ${spotifyPreview.totalTracks} found, ${imported.length} imported, ${skippedDuplicates} skipped duplicates, ${failedTracks} unavailable.`
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 rounded-none py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3 text-acid">
            <div className="grid size-11 place-items-center rounded-lg border border-acid/30 bg-acid/10 shadow-glow">
              <Music2 size={23} />
            </div>
            <span className="text-sm font-semibold uppercase tracking-[0.24em]">TrackForge</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-6xl">
            Forge your definitive Top 100.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">
            Shape a personal archive with weighted taste signals, manual ranking, head-to-head decisions, and offline-first PWA storage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InstallButton />
          <button onClick={() => setView("spotify")} className="inline-flex items-center gap-2 rounded-lg border border-acid/30 bg-acid/10 px-4 py-3 text-sm font-semibold text-acid transition hover:bg-acid/15">
            <Music2 size={18} /> {spotifyConnected ? "Spotify Connected" : "Connect Spotify"}
          </button>
          <button onClick={() => setView("data")} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            <Upload size={18} /> Import
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<ListMusic size={19} />} label="Archive" value={`${songs.length}/100`} accent="text-acid" />
        <Stat icon={<Medal size={19} />} label="Current #1" value={rankedSongs[0]?.title ?? "None"} accent="text-wave" />
        <Stat icon={<BarChart3 size={19} />} label="Avg score" value={averageScore.toFixed(1)} accent="text-pulse" />
        <Stat icon={<Sparkles size={19} />} label="Completion" value={`${completion}%`} accent="text-acid" />
      </section>

      <nav className="glass sticky top-3 z-10 flex gap-2 overflow-x-auto rounded-lg p-2">
        {([
          ["archive", "Archive", Headphones],
          ["top100", "Top 100", Medal],
          ["compare", "Compare", Shuffle],
          ["progress", "Progress", BarChart3],
          ["spotify", "Spotify", Music2],
          ["data", "Data", Download]
        ] satisfies NavItem[]).map(([id, label, Icon]) => (
          <button
            key={id as string}
            onClick={() => setView(id as View)}
            className={`inline-flex min-w-fit items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
              view === id ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </nav>

      <p className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">{notice}</p>

      {view === "archive" && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <SongEditor
            editing={Boolean(editingId)}
            form={form}
            weights={weights}
            setForm={setForm}
            updateRating={updateRating}
            updateWeight={updateWeight}
            onSave={upsertSong}
            onCancel={resetForm}
          />
          <RankedList songs={weightedSongs} weights={weights} title="Weighted Ranking" subtitle="Auto-sorted by your custom criteria." onEdit={editSong} onDelete={deleteSong} />
        </section>
      )}

      {view === "top100" && (
        <section className="glass rounded-lg p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Manual Top 100</h2>
              <p className="text-sm text-zinc-400">Drag songs into the order that feels right after the numbers do their work.</p>
            </div>
            <span className="text-sm font-semibold text-acid">{top100.length} ranked</span>
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={top100.map((song) => song.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {top100.map((song) => (
                  <SortableSong key={song.id} song={song} score={calculateScore(song, weights)} onEdit={editSong} onDelete={deleteSong} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {view === "compare" && (
        <section className="glass rounded-lg p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Head-to-Head</h2>
              <p className="text-sm text-zinc-400">Pick the song you would rather keep. TrackForge nudges it higher in the manual list.</p>
            </div>
            <button onClick={startComparison} className="inline-flex items-center justify-center gap-2 rounded-lg bg-acid px-4 py-3 text-sm font-bold text-zinc-950 transition hover:brightness-110">
              <Shuffle size={18} /> New Pair
            </button>
          </div>
          {comparePair ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {comparePair.map((song, index) => (
                <button
                  key={song.id}
                  onClick={() => chooseWinner(song, comparePair[index === 0 ? 1 : 0])}
                  className="group rounded-lg border border-white/10 bg-white/[0.04] p-5 text-left transition hover:-translate-y-1 hover:border-acid/50 hover:bg-acid/10"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Choose</span>
                  <h3 className="mt-4 text-2xl font-black text-white">{song.title}</h3>
                  <p className="text-zinc-300">{song.artist}</p>
                  <p className="mt-4 text-sm text-zinc-400">{song.album} / {song.year} / {song.genre}</p>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-300">{song.notes}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-white/15 p-8 text-center text-zinc-400">Start a comparison round when you are ready.</div>
          )}
        </section>
      )}

      {view === "progress" && <ProgressDashboard songs={songs} weights={weights} completion={completion} />}

      {view === "spotify" && (
        <SpotifyImportPanel
          connected={spotifyConnected}
          preview={spotifyPreview}
          selectedIds={selectedSpotifyIds}
          existingSongs={songs}
          onConnect={connectSpotify}
          onDisconnect={disconnectFromSpotify}
          onPreview={loadSpotifyPreview}
          onToggleTrack={toggleSpotifyTrack}
          onSelectAll={() => spotifyPreview && setSelectedSpotifyIds(new Set(spotifyPreview.tracks.map((track) => track.id)))}
          onSelectNone={() => setSelectedSpotifyIds(new Set())}
          onConfirm={confirmSpotifyImport}
        />
      )}

      {view === "data" && (
        <section className="grid gap-5 md:grid-cols-2">
          <div className="glass rounded-lg p-5">
            <h2 className="text-2xl font-bold text-white">Export</h2>
            <p className="mt-2 text-sm text-zinc-400">Keep backups or move your archive into another tool.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => downloadFile("trackforge-songs.json", exportJson(songs, weights), "application/json")} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-zinc-950">
                <Download size={18} /> JSON
              </button>
              <button onClick={() => downloadFile("trackforge-songs.csv", serializeCsv(songs), "text/csv")} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                <Download size={18} /> CSV
              </button>
            </div>
          </div>
          <div className="glass rounded-lg p-5">
            <h2 className="text-2xl font-bold text-white">CSV Import</h2>
            <p className="mt-2 text-sm text-zinc-400">Columns can include title, artist, album, year, genre, link, notes, and rating names.</p>
            <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-acid px-4 py-3 text-sm font-bold text-zinc-950 transition hover:brightness-110">
              <Import size={18} /> Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
            </label>
          </div>
        </section>
      )}
    </main>
  );
}

function SpotifyImportPanel({
  connected,
  preview,
  selectedIds,
  existingSongs,
  onConnect,
  onDisconnect,
  onPreview,
  onToggleTrack,
  onSelectAll,
  onSelectNone,
  onConfirm
}: {
  connected: boolean;
  preview: SpotifyPlaylistPreview | null;
  selectedIds: Set<string>;
  existingSongs: Song[];
  onConnect: () => void;
  onDisconnect: () => void;
  onPreview: (playlistUrl: string) => Promise<void>;
  onToggleTrack: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
}) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const hasClientId = Boolean(getSpotifyClientId());
  const duplicateCount = preview?.tracks.filter((track) => findImportDuplicate(track, existingSongs)).length ?? 0;

  async function fetchPreview() {
    setLoading(true);
    try {
      await onPreview(playlistUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="glass rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Spotify Import</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Connect with PKCE, paste a playlist URL, preview every paginated track, then choose what joins your archive.</p>
          </div>
          <span className={`rounded-md px-3 py-2 text-xs font-black ${connected ? "bg-acid/10 text-acid" : "bg-white/10 text-zinc-300"}`}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {!hasClientId && (
          <div className="mt-5 rounded-lg border border-pulse/30 bg-pulse/10 p-4 text-sm leading-6 text-pulse">
            Missing NEXT_PUBLIC_SPOTIFY_CLIENT_ID. Add it to .env.local and restart the dev server.
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={onConnect}
            disabled={!hasClientId}
            className="inline-flex items-center gap-2 rounded-lg bg-acid px-4 py-3 text-sm font-black text-zinc-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Music2 size={18} /> Connect Spotify
          </button>
          {connected && (
            <button onClick={onDisconnect} className="rounded-lg border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/10">
              Disconnect
            </button>
          )}
        </div>

        <label className="mt-6 block text-sm font-semibold text-zinc-300">
          Playlist URL or URI
          <input
            value={playlistUrl}
            onChange={(event) => setPlaylistUrl(event.target.value)}
            placeholder="https://open.spotify.com/playlist/... or spotify:playlist:..."
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-acid/60"
          />
        </label>
        <button
          onClick={fetchPreview}
          disabled={!connected || loading || !playlistUrl.trim()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Import size={18} />}
          {loading ? "Loading playlist" : "Preview Tracks"}
        </button>

        {preview && (
          <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Import Summary</p>
            <h3 className="mt-2 text-xl font-black text-white">{preview.playlistName}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SummaryPill label="Total" value={String(preview.totalTracks)} />
              <SummaryPill label="Previewed" value={String(preview.tracks.length)} />
              <SummaryPill label="Duplicates" value={String(duplicateCount)} />
              <SummaryPill label="Unavailable" value={String(preview.unavailableTracks)} />
            </div>
          </div>
        )}
      </div>

      <div className="glass rounded-lg p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Track Preview</h2>
            <p className="text-sm text-zinc-400">{preview ? `${selectedIds.size} selected for import` : "Load a playlist to review tracks first."}</p>
          </div>
          {preview && (
            <div className="flex gap-2">
              <button onClick={onSelectAll} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/10">All</button>
              <button onClick={onSelectNone} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/10">None</button>
              <button onClick={onConfirm} className="rounded-lg bg-acid px-3 py-2 text-sm font-black text-zinc-950 hover:brightness-110">Import</button>
            </div>
          )}
        </div>

        <div className="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
          {!preview && <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-zinc-400">No playlist preview yet.</div>}
          {preview?.tracks.map((track) => {
            const duplicate = Boolean(findImportDuplicate(track, existingSongs));
            const selected = selectedIds.has(track.id);
            return (
              <label key={track.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${selected ? "border-acid/40 bg-acid/10" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]"}`}>
                <input type="checkbox" checked={selected} onChange={() => onToggleTrack(track.id)} className="mt-5 size-4 accent-lime-300" />
                <AlbumArt song={track} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold text-white">{track.title}</h3>
                    {duplicate && <span className="rounded bg-pulse/15 px-2 py-1 text-xs font-bold text-pulse">Duplicate</span>}
                  </div>
                  <p className="truncate text-sm text-zinc-300">{track.artist}</p>
                  <p className="mt-1 text-xs text-zinc-500">{track.album} / {track.year}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function SongEditor({
  editing,
  form,
  weights,
  setForm,
  updateRating,
  updateWeight,
  onSave,
  onCancel
}: {
  editing: boolean;
  form: Song;
  weights: Weights;
  setForm: (song: Song) => void;
  updateRating: (key: keyof Song["ratings"], value: number) => void;
  updateWeight: (key: keyof Weights, value: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="glass rounded-lg p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">{editing ? "Edit Song" : "Add Song"}</h2>
          <p className="text-sm text-zinc-400">Capture the track and the reasons it matters.</p>
        </div>
        <span className="rounded-md bg-white/10 px-3 py-2 text-sm font-bold text-acid">{calculateScore(form, weights).toFixed(1)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Field label="Artist" value={form.artist} onChange={(artist) => setForm({ ...form, artist })} />
        <Field label="Album" value={form.album} onChange={(album) => setForm({ ...form, album })} />
        <Field label="Year" type="number" value={String(form.year)} onChange={(year) => setForm({ ...form, year: Number(year) || new Date().getFullYear() })} />
        <Field label="Genre" value={form.genre} onChange={(genre) => setForm({ ...form, genre })} />
        <Field label="Spotify/YouTube link" value={form.link} onChange={(link) => setForm({ ...form, link })} />
      </div>
      <label className="mt-3 block text-sm font-semibold text-zinc-300">
        Notes
        <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition focus:border-acid/60" />
      </label>
      <div className="mt-5 space-y-4">
        {CRITERIA.map((criterion) => (
          <div key={criterion.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-white">{criterion.label}</label>
              <span className="text-sm font-bold text-acid">{form.ratings[criterion.key]}/10</span>
            </div>
            <input type="range" min="1" max="10" value={form.ratings[criterion.key]} onChange={(event) => updateRating(criterion.key, Number(event.target.value))} className="mt-3 w-full accent-lime-300" />
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-zinc-500">Weight</span>
              <input type="range" min="0" max="5" step="0.5" value={weights[criterion.key]} onChange={(event) => updateWeight(criterion.key, Number(event.target.value))} className="w-full accent-teal-300" />
              <span className="w-8 text-right text-xs font-bold text-zinc-300">{weights[criterion.key]}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-3">
        <button onClick={onSave} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-acid px-4 py-3 text-sm font-black text-zinc-950 transition hover:brightness-110">
          {editing ? <Save size={18} /> : <Plus size={18} />} {editing ? "Save" : "Add"}
        </button>
        {editing && (
          <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/10">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm font-semibold text-zinc-300">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition focus:border-acid/60" />
    </label>
  );
}

function RankedList({ songs, weights, title, subtitle, onEdit, onDelete }: { songs: Song[]; weights: Weights; title: string; subtitle: string; onEdit: (song: Song) => void; onDelete: (id: string) => void }) {
  return (
    <div className="glass rounded-lg p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {songs.map((song, index) => (
          <SongRow key={song.id} song={song} rank={index + 1} score={calculateScore(song, weights)} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function AlbumArt({ song }: { song: Song }) {
  if (song.albumArtUrl) {
    return <img src={song.albumArtUrl} alt="" className="size-12 shrink-0 rounded-md border border-white/10 object-cover" loading="lazy" />;
  }

  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-acid">
      <Music2 size={20} />
    </div>
  );
}

function SongRow({ song, rank, score, onEdit, onDelete }: { song: Song; rank: number; score: number; onEdit: (song: Song) => void; onDelete: (id: string) => void }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.035] p-3 transition hover:border-white/20 hover:bg-white/[0.06]">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AlbumArt song={song} />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded bg-white text-[0.65rem] font-black text-zinc-950">{rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-white">{song.title}</h3>
              <p className="truncate text-sm text-zinc-300">{song.artist}</p>
              <p className="mt-1 text-xs text-zinc-500">{song.album} / {song.year} / {song.genre || song.source || "manual"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-acid/10 px-2 py-1 text-xs font-black text-acid">{score.toFixed(1)}</span>
              <button aria-label={`Edit ${song.title}`} onClick={() => onEdit(song)} className="rounded-md p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><Pencil size={16} /></button>
              <button aria-label={`Delete ${song.title}`} onClick={() => onDelete(song.id)} className="rounded-md p-2 text-zinc-300 hover:bg-pulse/15 hover:text-pulse"><Trash2 size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SortableSong({ song, score, onEdit, onDelete }: { song: Song; score: number; onEdit: (song: Song) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: song.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}>
      <article className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-3">
          <button {...attributes} {...listeners} aria-label={`Drag ${song.title}`} className="cursor-grab rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
            <GripVertical size={18} />
          </button>
          <div className="relative shrink-0">
            <AlbumArt song={song} />
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded bg-white text-[0.65rem] font-black text-zinc-950">{song.manualRank}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-white">{song.title}</h3>
            <p className="truncate text-sm text-zinc-400">{song.artist} / {song.album}</p>
          </div>
          <span className="hidden rounded-md bg-acid/10 px-2 py-1 text-xs font-black text-acid sm:inline">{score.toFixed(1)}</span>
          <button aria-label={`Edit ${song.title}`} onClick={() => onEdit(song)} className="rounded-md p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><Pencil size={16} /></button>
          <button aria-label={`Delete ${song.title}`} onClick={() => onDelete(song.id)} className="rounded-md p-2 text-zinc-300 hover:bg-pulse/15 hover:text-pulse"><Trash2 size={16} /></button>
        </div>
      </article>
    </div>
  );
}

function ProgressDashboard({ songs, weights, completion }: { songs: Song[]; weights: Weights; completion: number }) {
  const genres = Object.entries(
    songs.reduce<Record<string, number>>((acc, song) => {
      acc[song.genre || "Unknown"] = (acc[song.genre || "Unknown"] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const topCriteria = CRITERIA.map((criterion) => ({
    ...criterion,
    average: songs.length ? songs.reduce((sum, song) => sum + song.ratings[criterion.key], 0) / songs.length : 0,
    weight: weights[criterion.key]
  }));

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="glass rounded-lg p-5">
        <h2 className="text-2xl font-bold text-white">Top 100 Progress</h2>
        <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/10">
          <div className="meter h-full rounded-full transition-all" style={{ width: `${completion}%` }} />
        </div>
        <p className="mt-3 text-sm text-zinc-400">{songs.length} songs logged. {Math.max(0, 100 - songs.length)} spots left to fill.</p>
      </div>
      <div className="glass rounded-lg p-5">
        <h2 className="text-2xl font-bold text-white">Genre Map</h2>
        <div className="mt-4 space-y-3">
          {genres.map(([genre, count]) => (
            <div key={genre}>
              <div className="flex justify-between text-sm"><span>{genre}</span><span className="text-zinc-400">{count}</span></div>
              <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-wave" style={{ width: `${(count / Math.max(1, songs.length)) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-lg p-5 lg:col-span-2">
        <h2 className="text-2xl font-bold text-white">Taste Signals</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {topCriteria.map((criterion) => (
            <div key={criterion.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex justify-between text-sm"><span className="font-semibold text-white">{criterion.label}</span><span className="text-zinc-400">Avg {criterion.average.toFixed(1)} / W {criterion.weight}</span></div>
              <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-acid" style={{ width: `${criterion.average * 10}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="glass rounded-lg p-4">
      <div className={`mb-3 ${accent}`}>{icon}</div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function rerank(songs: Song[]) {
  return songs.map((song, index) => ({ ...song, manualRank: index + 1 }));
}
