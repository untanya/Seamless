// app/page.tsx
"use client";

import { useRef, useState } from "react";
import { Reader } from "@/app/api/components/Reader";
import type { Novel } from "@/libs/novel/types";
import { ProgressBar } from "@/components/ui/progress-bar";

export default function HomePage() {
  const [novel, setNovel] = useState<Novel | null>(null);
  const [novelId, setNovelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // timer pour la progression "continue"
  const progressTimerRef = useRef<number | null>(null);

  const showReader = !!(novel && novelId);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // reset état
    setNovel(null);
    setNovelId(null);
    setError(null);
    setProgress(0);
    setLoading(true);

    // clear éventuel timer précédent
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // barre de progression "estimée" sur toute la durée du fetch + parsing
    progressTimerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        // on approche asymptotiquement 99%, sans jamais s'y bloquer
        if (prev >= 99) return 99;

        const remaining = 99 - prev;
        const step = Math.max(remaining * 0.05, 0.3); // baisse progressivement
        return Math.min(prev + step, 99);
      });
    }, 300);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error || errBody?.details) {
            msg += ` – ${errBody.error ?? ""} ${errBody.details ?? ""}`;
          }
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as Novel;
      setNovel(data);
      setNovelId(`${file.name}-${file.size}-${file.lastModified}`);
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError("Erreur pendant la conversion.");
      setProgress(0);
    } finally {
      setLoading(false);

      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      // reset visuel doux après la fin (sauf si 0)
      if (progress > 0) {
        setTimeout(() => setProgress(0), 700);
      }
    }
  }

  return (
    <main
      className={
        showReader
          ? // Quand le reader est affiché : pas d’overflow global, tout est calé dans l’écran
            "min-h-screen max-h-screen overflow-hidden bg-[#1e1e1e] text-[#cccccc] p-4 flex flex-col"
          : // Écran d’accueil normal
            "min-h-screen bg-[#1e1e1e] text-[#cccccc] p-4 space-y-6"
      }
    >
      {/* Header / Upload card */}
      <header className="max-w-5xl w-full mx-auto rounded-xl border border-[#444444] bg-[#252525] p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">LNReader</h1>
            <p className="text-sm text-[#aaaaaa]">
              Choisis un PDF de Light Novel pour le lire dans l’interface.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="text-sm text-[#cccccc]
                         file:mr-3 file:rounded-md file:border-0
                         file:bg-blue-600 file:px-3 file:py-1.5
                         file:text-xs file:font-medium file:text-white
                         hover:file:bg-blue-500"
            />
          </div>
        </div>

        {loading && (
          <div className="space-y-1 pt-1">
            <span className="text-xs text-[#aaaaaa]">
              Conversion en cours...
            </span>
            <ProgressBar
              value={progress}
              showLabel
              className="mt-1"
              // pour changer facilement la couleur de la barre :
              // barClassName="bg-emerald-500"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 pt-2 border-t border-[#3a3a3a]">
            {error}
          </p>
        )}
      </header>

      {/* Zone de lecture (prend tout le reste de la hauteur, sans overflow global) */}
      {showReader && (
        <section className="w-full flex-1 overflow-hidden mt-4">
          <Reader novel={novel} novelId={novelId} />
        </section>
      )}

      {/* Explication quand rien n'est encore chargé */}
      {!showReader && !loading && (
        <section className="max-w-3xl mx-auto text-sm text-[#aaaaaa]">
          <p className="mb-2">Une fois le PDF envoyé, le serveur&nbsp;:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>extrait le texte et les illustrations dans l&apos;ordre,</li>
            <li>détecte la langue et les chapitres (et transitions),</li>
            <li>renvoie un JSON que le lecteur affiche dans l&apos;UI.</li>
          </ul>
        </section>
      )}
    </main>
  );
}
