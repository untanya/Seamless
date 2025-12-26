// app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reader } from "@/app/api/components/Reader";
import { ProgressBar } from "@/components/ui/progress-bar";
import { loadNovelFromDb, saveNovelToDb } from "@/libs/novel/storage";
import type { Novel } from "@/libs/novel/types";
import { type NovelMeta, useReaderStore } from "@/store/useReaderStore";

export default function HomePage() {
  const {
    currentNovel,
    currentNovelId,
    setCurrentNovel,
    clearCurrent,
    recents,
  } = useReaderStore();

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  // Timer for estimated progress (0–99 %)
  const progressTimerRef = useRef<number | null>(null);

  const showReader = !!(currentNovel && currentNovelId);

  // Rehydrate from IndexedDB if needed
  useEffect(() => {
    if (!currentNovel && currentNovelId) {
      let cancelled = false;
      (async () => {
        try {
          const cached = await loadNovelFromDb(currentNovelId);
          if (!cancelled && cached) {
            const metaFromRecents = recents.find(
              (r) => r.id === currentNovelId,
            );
            const meta: NovelMeta = metaFromRecents ?? {
              id: currentNovelId,
              title: cached.metadata.title,
              fileName: cached.metadata.title,
              createdAt: new Date().toISOString(),
            };
            setCurrentNovel(cached, meta);
          }
        } catch (e) {
          console.warn(
            "Seamless: impossible de recharger le novel depuis IndexedDB",
            e,
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [currentNovel, currentNovelId, recents, setCurrentNovel]);

  const filteredRecents = useMemo(
    () =>
      recents.filter((meta) => {
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          meta.title.toLowerCase().includes(needle) ||
          meta.fileName.toLowerCase().includes(needle)
        );
      }),
    [recents, search],
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state and start loading
    clearCurrent();
    setError(null);
    setLogs([]);
    setProgress(0);
    setLoading(true);

    // Clear any previous estimated-progress timer
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // Start the estimated-progress timer (0–99 % over time)
    progressTimerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 99) return 99;
        const remaining = 99 - prev;
        const step = Math.max(remaining * 0.05, 0.3);
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
          /* ignore */
        }
        throw new Error(msg);
      }

      const json = await res.json();

      // Determine whether the response contains { novel, logs } or just the novel
      let novelData: Novel;
      let logsArray: string[] = [];
      if (json.novel) {
        novelData = json.novel as Novel;
        logsArray = Array.isArray(json.logs) ? json.logs : [];
      } else {
        novelData = json as Novel;
      }

      // Stop the estimated-progress timer
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      // Prepare novel ID and metadata for later saving
      const generatedNovelId = `${file.name}-${file.size}-${file.lastModified}`;
      const meta: NovelMeta = {
        id: generatedNovelId,
        title: novelData.metadata.title,
        fileName: file.name,
        createdAt: new Date().toISOString(),
      };

      // If logs are present, display them with actual progression, then save the novel
      if (logsArray.length > 0) {
        logsArray.forEach((line, index) => {
          setTimeout(() => {
            setLogs((prev) => [...prev, line]);
            setProgress(Math.round(((index + 1) / logsArray.length) * 100));
            if (index === logsArray.length - 1) {
              setCurrentNovel(novelData, meta);
              void saveNovelToDb(generatedNovelId, novelData);
              setTimeout(() => {
                setProgress(0);
                setLoading(false);
              }, 700);
            }
          }, index * 150);
        });
      } else {
        // No logs: save novel immediately and fill the progress bar briefly
        setProgress(100);
        setCurrentNovel(novelData, meta);
        void saveNovelToDb(generatedNovelId, novelData);
        setTimeout(() => {
          setProgress(0);
          setLoading(false);
        }, 1000);
      }
    } catch (err) {
      console.error(err);
      setError("Erreur pendant la conversion.");
      setProgress(0);
      // Stop any running timer
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setLoading(false);
    }
  }

  async function handleSelectExisting(novelId: string) {
    if (!novelId || novelId === currentNovelId) return;

    setLoading(true);
    setError(null);

    try {
      const cached = await loadNovelFromDb(novelId);
      if (!cached) {
        setError(
          "Impossible de retrouver ce novel localement. Il a peut-être été nettoyé par le navigateur.",
        );
        return;
      }

      const metaFromRecents = recents.find((r) => r.id === novelId);
      const meta: NovelMeta = metaFromRecents ?? {
        id: novelId,
        title: cached.metadata.title,
        fileName: cached.metadata.title,
        createdAt: new Date().toISOString(),
      };

      setCurrentNovel(cached, meta);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement du novel local.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className={
        showReader
          ? "min-h-screen max-h-screen overflow-hidden bg-[#1e1e1e] text-[#cccccc] p-4 flex flex-col"
          : "min-h-screen bg-[#1e1e1e] text-[#cccccc] p-4 space-y-6"
      }
    >
      {/* Header / Upload card */}
      <header className="max-w-5xl w-full mx-auto rounded-xl border border-[#444444] bg-[#252525] p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-[220px]">
            <h1 className="text-2xl font-bold">Seamless</h1>
            <p className="text-sm text-[#aaaaaa]">
              Choisis un PDF de Light Novel pour le lire dans l’interface.
            </p>
          </div>

          <div className="flex flex-col gap-2 items-end flex-1 min-w-[260px]">
            {/* Upload PDF */}
            <div className="flex flex-wrap items-center gap-3 justify-end">
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

            {/* Dropdown de novels déjà convertis */}
            {recents.length > 0 && (
              <div className="flex flex-col gap-1 w-full max-w-md">
                <span className="text-[11px] uppercase tracking-wide text-[#888]">
                  Novels convertis
                </span>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-1 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <select
                    className="min-w-[180px] rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-1 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={currentNovelId ?? ""}
                    onChange={(e) => handleSelectExisting(e.target.value)}
                  >
                    <option value="">Sélectionner un novel…</option>
                    {filteredRecents.map((meta) => (
                      <option key={meta.id} value={meta.id}>
                        {meta.title || meta.fileName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-1 pt-1">
            {/* Show logs if available, otherwise a generic message */}
            {logs.length > 0 ? (
              <div className="bg-[#2a2a2a] p-2 rounded text-xs text-[#aaaaaa] max-h-36 overflow-y-auto">
                {logs.map((line, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: <expected>
                  <div key={idx}>{line}</div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-[#aaaaaa]">
                Traitement en cours...
              </span>
            )}
            <ProgressBar value={progress} showLabel className="mt-1" />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 pt-2 border-t border-[#3a3a3a]">
            {error}
          </p>
        )}
      </header>

      {/* Zone de lecture */}
      {showReader && (
        <section className="w-full flex-1 overflow-hidden mt-4">
          <Reader
            novel={currentNovel as Novel}
            novelId={currentNovelId as string}
          />
        </section>
      )}

      {!showReader && !loading && (
        <section className="max-w-3xl mx-auto text-sm text-[#aaaaaa]">
          <p className="mb-2">Une fois le PDF envoyé, le serveur :</p>
          <ul className="list-disc list-inside space-y-1">
            <li>extrait le texte et les illustrations dans l’ordre,</li>
            <li>détecte la langue et les chapitres (et transitions),</li>
            <li>renvoie un JSON que le lecteur affiche dans l’UI.</li>
          </ul>
        </section>
      )}
    </main>
  );
}
