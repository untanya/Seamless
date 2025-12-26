/** biome-ignore-all lint/suspicious/noArrayIndexKey: <temporary> */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Novel } from "@/libs/novel/types";
import type { NovelMeta } from "@/store/useReaderStore";
import { useReaderStore } from "@/store/useReaderStore";

interface ReaderProps {
  novel: Novel;
  novelId: string;
  recents: NovelMeta[];
  search: string;
  onSearchChange: (value: string) => void;
  onUploadFile: (file: File) => Promise<void> | void;
  onSelectExisting: (novelId: string) => Promise<void> | void;
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function Reader({
  novel,
  novelId,
  recents,
  search,
  onSearchChange,
  onUploadFile,
  onSelectExisting,
}: ReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookmark = useReaderStore((s) => s.getBookmarkForCurrent());
  const saveBookmarkForCurrent = useReaderStore(
    (s) => s.saveBookmarkForCurrent,
  );

  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    novel.chapters[0]?.id ?? null,
  );
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  useEffect(() => {
    setActiveChapterId(novel.chapters[0]?.id ?? null);
  }, [novel]);

  useEffect(() => {
    if (!bookmark) return;
    if (!containerRef.current) return;

    const selector = `[data-chapter-id="${bookmark.chapterId}"][data-block-id="${bookmark.blockId}"]`;
    const el = containerRef.current.querySelector<HTMLElement>(selector);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveChapterId(bookmark.chapterId);
  }, [bookmark]);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewport = containerRef.current.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    const handleScroll = () => {
      if (!containerRef.current) return;

      const sections = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>("[data-chapter-id]"),
      );

      const viewportRect = viewport.getBoundingClientRect();
      const targetY = viewportRect.top + viewportRect.height * 0.3;

      let closestId: string | null = null;
      let closestDist = Infinity;

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const dist = Math.abs(rect.top - targetY);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = section.dataset.chapterId ?? null;
        }
      }

      if (closestId && closestId !== activeChapterId) {
        setActiveChapterId(closestId);
      }
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [activeChapterId]);

  const handleSaveBookmark = () => {
    if (!containerRef.current) return;

    const blocks = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>("[data-block-id]"),
    );

    const firstVisible = blocks.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight * 0.5;
    });

    if (!firstVisible) return;

    const chapterId = firstVisible.dataset.chapterId;
    const blockId = firstVisible.dataset.blockId;
    if (!chapterId || !blockId) return;

    saveBookmarkForCurrent({ chapterId, blockId });
  };

  const handleClickTocItem = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setActiveChapterId(id);
    setIsTocOpen(false);
  };

  const handleUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (!isPdfFile(file)) return;
    setIsLibraryOpen(false);
    await onUploadFile(file);
  };

  const filteredRecents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return recents;

    return recents.filter((meta) => {
      const t = meta.title.toLowerCase();
      const f = meta.fileName.toLowerCase();
      return t.includes(needle) || f.includes(needle);
    });
  }, [recents, search]);

  const scrollToTop = () => {
    if (!containerRef.current) return;
    const viewport = containerRef.current.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    viewport.scrollTo({ top: 0, behavior: "smooth" });
  };

  function getStringField(value: unknown, key: string): string | null {
    if (typeof value !== "object" || value === null) return null;
    const rec = value as Record<string, unknown>;
    const v = rec[key];
    return typeof v === "string" ? v : null;
  }

  function getBlockHtml(block: unknown): string | null {
    return (
      getStringField(block, "html") ??
      getStringField(block, "content") ??
      getStringField(block, "text")
    );
  }

  return (
    <>
      {isLibraryOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsLibraryOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setIsLibraryOpen(false);
            }}
            aria-label="Close library overlay"
          />
          <div
            className="absolute inset-y-0 left-0 w-[86vw] max-w-sm bg-[#252525] border-r border-[#444] shadow-xl flex flex-col min-h-0 text-[#ccc]"
            role="dialog"
            aria-modal="true"
            aria-label="Library"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#444]">
              <div className="min-w-0">
                <div className="text-xs text-[#9a9a9a] truncate">
                  {novel.metadata.title}
                </div>
                <div className="font-semibold truncate">Library</div>
              </div>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-[#ccc]"
                onClick={() => setIsLibraryOpen(false)}
                aria-label="Close library"
              >
                ✕
              </Button>
            </div>

            <div className="p-3 space-y-3 border-b border-[#444]">
              <label className="block">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleUploadInput}
                  className="sr-only"
                />
                <span className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer">
                  Import PDF
                </span>
              </label>

              {recents.length > 0 && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-2 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  <select
                    className="w-full rounded-md border border-[#555] bg-[#1f1f1f] px-2 py-2 text-xs text-[#ddd] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={novelId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (!nextId || nextId === novelId) return;
                      void onSelectExisting(nextId);
                      setIsLibraryOpen(false);
                    }}
                  >
                    <option value={novelId}>{novel.metadata.title}</option>
                    {filteredRecents
                      .filter((m) => m.id !== novelId)
                      .map((meta) => (
                        <option key={meta.id} value={meta.id}>
                          {meta.title || meta.fileName}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 p-3">
              <div className="text-xs text-[#9a9a9a]">
                Use the TOC button to open the table of contents.
              </div>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="icon"
        variant="outline"
        className="fixed bottom-4 left-4 z-40 md:hidden shadow-md bg-[#2c2c2c] border-[#555] text-[#ccc]"
        onClick={() => setIsTocOpen((v) => !v)}
        aria-label="Open table of contents"
      >
        ☰
      </Button>

      <Button
        type="button"
        size="icon"
        variant="outline"
        className="fixed bottom-4 right-4 z-40 shadow-md bg-[#2c2c2c] border-[#555] text-[#ccc]"
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        ↑
      </Button>

      {isTocOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsTocOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setIsTocOpen(false);
            }}
            aria-label="Close table of contents overlay"
          />
          <div
            className="absolute inset-y-0 right-0 w-[80vw] max-w-xs bg-[#252525] border-l border-[#444] shadow-xl flex flex-col text-[#ccc] min-h-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#444]">
              <h2 className="font-semibold">Table of contents</h2>
              <Button
                size="icon"
                variant="ghost"
                className="text-[#ccc]"
                onClick={() => setIsTocOpen(false)}
                aria-label="Close table of contents"
              >
                ✕
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
              <ul className="space-y-1 text-sm p-2">
                {novel.toc.map((item, index) => (
                  <li key={`toc-mob-${index}`}>
                    <button
                      type="button"
                      onClick={() => handleClickTocItem(item.id)}
                      className={cn(
                        "w-full text-left rounded px-2 py-1 transition-colors",
                        item.id === activeChapterId
                          ? "bg-blue-500/20 text-blue-400 font-semibold"
                          : "text-[#aaa] hover:text-[#ddd]",
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
      )}

      <div className="h-[100svh] w-full overflow-hidden flex items-stretch justify-center">
        <aside className="hidden md:flex w-64 flex-col text-[#ccc] p-4 h-full min-h-0">
          <h2 className="font-semibold mb-2">Table of contents</h2>

          <ScrollArea className="flex-1 min-h-0 pr-2 border border-[#444] rounded-md bg-[#252525] overflow-hidden">
            <ul className="space-y-1 text-sm p-2">
              {novel.toc.map((item, index) => (
                <li key={`toc-desk-${index}`}>
                  <button
                    type="button"
                    onClick={() => handleClickTocItem(item.id)}
                    className={cn(
                      "w-full text-left rounded px-2 py-1 transition-colors",
                      item.id === activeChapterId
                        ? "bg-blue-500/20 text-blue-400 font-semibold"
                        : "text-[#aaa] hover:text-[#ddd]",
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>

        <main className="flex-1 h-full min-h-0 overflow-hidden border border-[#444] bg-[#252525] text-[#ccc] md:my-4 md:rounded-md md:max-w-6xl w-full shadow-sm">
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#444] px-4 py-2 flex items-center gap-3 overflow-hidden">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0 bg-[#2c2c2c] border-[#555] text-[#ccc]"
                onClick={() => setIsLibraryOpen(true)}
                aria-label="Open library"
              >
                ☰
              </Button>

              <h1
                className="font-bold truncate min-w-0 flex-1"
                style={{ fontSize: 14 }}
              >
                {novel.metadata.title}
              </h1>

              <Button
                className="bg-blue-600 text-white hover:bg-blue-500 shrink-0"
                onClick={handleSaveBookmark}
              >
                Bookmark
              </Button>
            </header>

            <ScrollArea className="flex-1 min-h-0 overflow-hidden">
              <div
                ref={containerRef}
                className="max-w-5xl mx-auto px-6 md:px-4 py-6 space-y-8"
              >
                {novel.chapters.map((chapter, i) => (
                  <section
                    key={i}
                    id={chapter.id}
                    data-chapter-id={chapter.id}
                    className="space-y-4"
                  >
                    <h2
                      className={cn(
                        "text-2xl font-semibold",
                        chapter.id === activeChapterId
                          ? "text-blue-400"
                          : "text-[#ccc]",
                      )}
                    >
                      {chapter.title}
                    </h2>

                    {chapter.blocks.map((block) => {
                      if (block.type === "image") {
                        return (
                          <picture
                            key={block.id}
                            className="flex justify-center my-4"
                            data-block-id={block.id}
                            data-chapter-id={chapter.id}
                          >
                            <img
                              src={block.src}
                              alt={block.alt ?? ""}
                              className="w-[90%] h-auto max-h-[70vh] rounded object-contain"
                            />
                          </picture>
                        );
                      }

                      const html = getBlockHtml(block);
                      if (!html) {
                        return (
                          <div
                            key={block.id}
                            data-block-id={block.id}
                            data-chapter-id={chapter.id}
                            className="text-sm text-[#9a9a9a]"
                          />
                        );
                      }

                      return (
                        <div
                          key={block.id}
                          data-block-id={block.id}
                          data-chapter-id={chapter.id}
                          style={{ fontSize: 18 }}
                          className="prose prose-invert max-w-none text-[#ddd] break-words"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: <tmp>
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      );
                    })}
                  </section>
                ))}
              </div>
            </ScrollArea>
          </div>
        </main>

        <div className="hidden md:block w-64" />
      </div>
    </>
  );
}
