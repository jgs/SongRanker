"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Music2 } from "lucide-react";
import { completeSpotifyLogin } from "@/lib/spotify";

export default function SpotifyCallbackPage() {
  return (
    <Suspense fallback={<CallbackShell status="Completing Spotify connection..." />}>
      <CallbackHandler />
    </Suspense>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Completing Spotify connection...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const spotifyError = searchParams.get("error");

    if (spotifyError) {
      setError(`Spotify returned: ${spotifyError}`);
      return;
    }

    if (!code) {
      setError("Spotify did not return an authorization code.");
      return;
    }

    completeSpotifyLogin(code, state)
      .then(() => {
        setStatus("Spotify connected. Returning to TrackForge...");
        router.replace("/?view=spotify&spotify=connected");
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Spotify connection failed.");
      });
  }, [router, searchParams]);

  return <CallbackShell status={status} error={error} />;
}

function CallbackShell({ status, error }: { status: string; error?: string | null }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="glass w-full max-w-md rounded-lg p-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-lg border border-acid/30 bg-acid/10 text-acid shadow-glow">
          <Music2 size={26} />
        </div>
        <h1 className="mt-5 text-2xl font-black text-white">TrackForge Spotify</h1>
        {error ? (
          <>
            <p className="mt-3 text-sm leading-6 text-pulse">{error}</p>
            <Link href="/?view=spotify" className="mt-5 inline-flex rounded-lg bg-white px-4 py-3 text-sm font-black text-zinc-950">
              Back to importer
            </Link>
          </>
        ) : (
          <div className="mt-5 flex items-center justify-center gap-3 text-sm text-zinc-300">
            <Loader2 className="animate-spin text-acid" size={18} />
            {status}
          </div>
        )}
      </section>
    </main>
  );
}
