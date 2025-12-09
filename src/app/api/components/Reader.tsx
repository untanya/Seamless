/** biome-ignore-all lint/suspicious/noArrayIndexKey: <temporary> */
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Novel } from "@/libs/novel/types";
import { useReaderStore } from "@/store/useReaderStore";

interface ReaderProps {
  novel: Novel;
  novelId: string;
}

export function Reader({ novel, novelId }: ReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { bookmark, saveBookmark, setNovel } = useReaderStore();

  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    novel.chapters[0]?.id ?? null,
  );
  const [isTocOpen, setIsTocOpen] = useState(false);

  // Init
  useEffect(() => {
    setNovel(novel, novelId);
    setActiveChapterId(novel.chapters[0]?.id ?? null);
  }, [novel, novelId, setNovel]);

  // Scroll to bookmark
  useEffect(() => {
    if (!bookmark || !containerRef.current) return;

    const el = containerRef.current.querySelector<HTMLElement>(
      `[data-chapter-id="${bookmark.chapterId}"][data-block-id="${bookmark.blockId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveChapterId(bookmark.chapterId);
    }
  }, [bookmark]);

  // Update active chapter during scroll
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

  // Bookmark
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

    if (
      firstVisible.dataset.chapterId === undefined ||
      firstVisible.dataset.blockId === undefined
    )
      return;

    saveBookmark({
      chapterId: firstVisible.dataset.chapterId,
      blockId: firstVisible.dataset.blockId,
    });
  };

  const handleClickTocItem = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setActiveChapterId(id);
    setIsTocOpen(false);
  };

  // ---------------- UI ----------------
  return (
    <>
      {/* Bouton mobile menu */}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="fixed bottom-4 left-4 z-40 md:hidden shadow-md bg-[#2c2c2c] border-[#555] text-[#ccc]"
        onClick={() => setIsTocOpen(!isTocOpen)}
      >
        ☰
      </Button>

      {/* Menu mobile (slide depuis la droite) */}
      {isTocOpen && (
        <div className="fixed inset-0 z-30 md:hidden bg-black/40">
          <div className="absolute inset-y-0 right-0 w-[80vw] max-w-xs bg-[#252525] border-l border-[#444] shadow-xl flex flex-col text-[#ccc]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#444]">
              <h2 className="font-semibold">Sommaire</h2>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-[#ccc]"
                onClick={() => setIsTocOpen(false)}
              >
                ✕
              </Button>
            </div>

            <ScrollArea className="flex-1">
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

      {/* Layout */}
      <div className="w-full flex justify-center items-center">
        {/* Sommaire desktop */}
        <aside className="hidden md:flex w-64 flex-col text-[#ccc]">
          <h2 className="font-semibold mb-2">Sommaire</h2>

          <ScrollArea className="h-[80vh] pr-2 border border-[#444] rounded-md bg-[#252525]">
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

        {/* Reader zone */}
        <main
          className="flex-1 flex flex-col h-[calc(100vh-7rem)] md:h-[80vh] min-h-0 
                         border border-[#444] rounded-md bg-[#252525] text-[#ccc] 
                         mx-auto max-w-6xl shadow-sm"
        >
          <header className="border-b border-[#444] px-4 py-2 flex items-center justify-between">
            <h1 className="text-2xl font-bold truncate">
              {novel.metadata.title}
            </h1>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-500"
              onClick={handleSaveBookmark}
            >
              Bookmark
            </Button>
          </header>

          <ScrollArea className="flex-1">
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

                  {chapter.blocks.map((block) =>
                    block.type === "image" ? (
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
                    ) : (
                      <div
                        key={block.id}
                        style={{ fontSize: 20 }}
                        className="prose prose-invert max-w-none text-[#ddd]"
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: <temporary>
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                    ),
                  )}
                </section>
              ))}
            </div>
          </ScrollArea>
        </main>

        <div className="hidden md:block w-64" />
      </div>
    </>
  );
}
