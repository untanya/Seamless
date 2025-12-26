"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reader } from "@/app/api/components/Reader";
import { ProgressBar } from "@/components/ui/progress-bar";
import { loadNovelFromDb, saveNovelToDb } from "@/libs/novel/storage";
import type { Novel } from "@/libs/novel/types";
import { type NovelMeta, useReaderStore } from "@/store/useReaderStore";

type ConvertPayload = { novel: Novel; logs?: string[] };
type ConvertResponse = ConvertPayload | Novel;

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function isConvertPayload(value: unknown): value is ConvertPayload {
  if (typeof value !== "object" || value === null) return false;
  return "novel" in value;
}

function extractErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const rec = value as Record<string, unknown>;
  const error = typeof rec.error === "string" ? rec.error : "";
  const details = typeof rec.details === "string" ? rec.details : "";
  const msg = `${error} ${details}`.trim();
  return msg.length > 0 ? msg : null;
}

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

  const progressTimerRef = useRef<number | null>(null);

  const showReader = currentNovel !== null && currentNovelId !== null;

  useEffect(() => {
    if (currentNovel !== null) return;
    if (currentNovelId === null) return;

    let cancelled = false;

    (async () => {
      try {
        const cached = await loadNovelFromDb(currentNovelId);
        if (cancelled || !cached) return;

        const metaFromRecents = recents.find((r) => r.id === currentNovelId);
        const meta: NovelMeta = metaFromRecents ?? {
          id: currentNovelId,
          title: cached.metadata.title,
          fileName: cached.metadata.title,
          createdAt: new Date().toISOString(),
        };

        setCurrentNovel(cached, meta);
      } catch (e) {
        console.warn("Seamless: failed to rehydrate novel from IndexedDB", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentNovel, currentNovelId, recents, setCurrentNovel]);

  const filteredRecents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return recents;

    return recents.filter((meta) => {
      return (
        meta.title.toLowerCase().includes(needle) ||
        meta.fileName.toLowerCase().includes(needle)
      );
    });
  }, [recents, search]);

  function stopProgressTimer() {
    if (progressTimerRef.current === null) return;
    window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
  }

  function startEstimatedProgress() {
    stopProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 99) return 99;
        const remaining = 99 - prev;
        const step = Math.max(remaining * 0.05, 0.3);
        return Math.min(prev + step, 99);
      });
    }, 300);
  }

  function resetLoadingUI() {
    clearCurrent();
    setError(null);
    setLogs([]);
    setProgress(0);
    setLoading(true);
    startEstimatedProgress();
  }

  async function convertFile(file: File) {
    resetLoadingUI();

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
          const errBody: unknown = await res.json();
          const extra = extractErrorMessage(errBody);
          if (extra) msg += ` – ${extra}`;
        } catch {
          // noop
        }
        throw new Error(msg);
      }

      const json: unknown = await res.json();

      let novelData: Novel | null = null;
      let logsArray: string[] = [];

      if (isConvertPayload(json)) {
        novelData = json.novel;
        if (Array.isArray(json.logs)) {
          logsArray = json.logs.filter(
            (v): v is string => typeof v === "string",
          );
        }
      } else {
        novelData = json as ConvertResponse as Novel;
      }

      if (!novelData) throw new Error("Invalid response");

      stopProgressTimer();

      const generatedNovelId = `${file.name}-${file.size}-${file.lastModified}`;
      const meta: NovelMeta = {
        id: generatedNovelId,
        title: novelData.metadata.title,
        fileName: file.name,
        createdAt: new Date().toISOString(),
      };

      const finalize = () => {
        setCurrentNovel(novelData as Novel, meta);
        void saveNovelToDb(generatedNovelId, novelData as Novel);
        setProgress(100);
        window.setTimeout(() => {
          setProgress(0);
          setLoading(false);
        }, 700);
      };

      if (logsArray.length === 0) {
        finalize();
        return;
      }

      logsArray.forEach((line, index) => {
        window.setTimeout(() => {
          setLogs((prev) => [...prev, line]);
          setProgress(Math.round(((index + 1) / logsArray.length) * 100));
          if (index === logsArray.length - 1) finalize();
        }, index * 150);
      });
    } catch (err) {
      console.error(err);
      setError("Conversion failed.");
      setProgress(0);
      stopProgressTimer();
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    if (!isPdfFile(file)) {
      setError("Please select a PDF file.");
      return;
    }

    await convertFile(file);
  }

  async function handleSelectExisting(novelId: string) {
    if (!novelId) return;
    if (novelId === currentNovelId) return;

    setLoading(true);
    setError(null);

    try {
      const cached = await loadNovelFromDb(novelId);
      if (!cached) {
        setError("This novel is not available locally anymore.");
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
    } catch (e) {
      console.error(e);
      setError("Failed to load the local novel.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className={
        showReader
          ? "h-[100svh] overflow-hidden bg-[#1e1e1e] text-[#cccccc]"
          : "min-h-screen bg-[#1e1e1e] text-[#cccccc] p-4 space-y-6 overflow-x-hidden"
      }
    >
      {!showReader && (
        <>
          <header className="max-w-5xl w-full mx-auto rounded-xl border border-[#444444] bg-[#252525] p-4 shadow-sm flex flex-col gap-3 overflow-x-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
              <div className="space-y-1 min-w-0">
                <h1 className="text-2xl font-bold">Seamless</h1>
                <p className="text-sm text-[#aaaaaa]">
                  Choose a Light Novel PDF to read it in the interface.
                </p>
              </div>

              <div className="flex flex-col gap-2 items-end flex-1 min-w-0 w-full">
                <div className="flex flex-wrap items-center gap-3 justify-end w-full min-w-0">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="w-full max-w-full text-sm text-[#cccccc]
                           file:mr-3 file:rounded-md file:border-0
                           file:bg-blue-600 file:px-3 file:py-1.5
                           file:text-xs file:font-medium file:text-white
                           hover:file:bg-blue-500"
                  />
                </div>

                {recents.length > 0 && (
                  <div className="flex flex-col gap-1 w-full max-w-md min-w-0">
                    <span className="text-[11px] uppercase tracking-wide text-[#888]">
                      Converted novels
                    </span>

                    {/* COLUMN LAYOUT => no X overflow + does not resize the upload area */}
                    <div className="flex flex-col gap-2 w-full min-w-0">
                      <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full min-w-0 rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-1 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      <select
                        className="w-full min-w-0 rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-1 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={currentNovelId ?? ""}
                        onChange={(e) => {
                          void handleSelectExisting(e.target.value);
                        }}
                      >
                        <option value="">Select a novel…</option>
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
                {logs.length > 0 ? (
                  <div className="bg-[#2a2a2a] p-2 rounded text-xs text-[#aaaaaa] max-h-36 overflow-y-auto">
                    {logs.map((line, idx) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: <expected>
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-[#aaaaaa]">Processing…</span>
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

          {!loading && (
            <section className="max-w-3xl mx-auto text-sm text-[#aaaaaa] overflow-x-hidden">
              <p className="mb-2">After you upload a PDF, the server:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>extracts text and illustrations in order,</li>
                <li>detects language and chapters,</li>
                <li>returns a JSON rendered by the reader.</li>
              </ul>
            </section>
          )}
        </>
      )}

      {showReader && (
        <section className="h-[100svh] overflow-hidden">
          <Reader
            novel={currentNovel}
            novelId={currentNovelId}
            recents={recents}
            search={search}
            onSearchChange={setSearch}
            onUploadFile={convertFile}
            onSelectExisting={handleSelectExisting}
          />
        </section>
      )}
    </main>
  );
}
