// components/Reader.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Novel } from "@/libs/novel/types";
import { useReaderStore } from "@/store/useReaderStore";
import { cn } from "@/lib/utils";

interface ReaderProps {
  novel: Novel;
  novelId: string;
}

export function Reader({ novel, novelId }: ReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { bookmark, saveBookmark, setNovel } = useReaderStore();

  // Chapitre actuellement "focus" dans la zone de lecture
  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    novel.chapters[0]?.id ?? null,
  );

  // Enregistrer le roman dans le store + charger le bookmark éventuel
  useEffect(() => {
    setNovel(novel, novelId);
    // au changement de novel, on reset le chapitre actif
    setActiveChapterId(novel.chapters[0]?.id ?? null);
  }, [novel, novelId, setNovel]);

  // Scroll vers le bookmark éventuel
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

  // Détection du chapitre "focus" en fonction du scroll dans le ScrollArea
  useEffect(() => {
    if (!containerRef.current) return;

    // Le viewport réel est l'élément Radix avec data-slot="scroll-area-viewport"
    const viewport = containerRef.current.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    const handleScroll = () => {
      if (!containerRef.current) return;

      const sections = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>("[data-chapter-id]"),
      );
      if (!sections.length) return;

      const viewportRect = viewport.getBoundingClientRect();
      const targetY = viewportRect.top + viewportRect.height * 0.3; // 30% de la hauteur

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

    // premier calcul au montage
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

    if (chapterId && blockId) {
      saveBookmark({ chapterId, blockId });
      setActiveChapterId(chapterId);
    }
  };

  return (
    <div className="flex h-[80vh] min-h-0 border rounded-md overflow-hidden bg-background text-foreground">
      {/* TOC */}
      <aside className="hidden md:block w-64 border-r p-4">
        <h2 className="font-semibold mb-2">Sommaire</h2>
        <ScrollArea className="h-[calc(80vh-3rem)] pr-2">
          <ul className="space-y-1 text-sm">
            {novel.toc.map((item, index) => {
              const isActive = item.id === activeChapterId;
              return (
                <li key={`${item.id}-${index}`}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left rounded px-2 py-1 transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      const el = document.getElementById(item.id);
                      el?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                      setActiveChapterId(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>

      {/* Contenu */}
      <main className="flex-1 flex flex-col min-h-0">
        <header className="border-b px-4 py-2 flex items-center justify-between gap-2">
          <h1 className="font-bold text-lg truncate">{novel.metadata.title}</h1>
          <Button size="sm" variant="default" onClick={handleSaveBookmark}>
            Bookmark
          </Button>
        </header>

        {/* Zone de lecture scrollable */}
        <ScrollArea className="flex-1 h-[calc(80vh-3rem)]">
          <div
            ref={containerRef}
            className="max-w-3xl mx-auto px-4 py-6 space-y-8"
          >
            {novel.chapters.map((chapter, chapterIndex) => {
              const isActive = chapter.id === activeChapterId;
              return (
                <section
                  key={`${chapter.id}-${chapterIndex}`}
                  id={chapter.id}
                  data-chapter-id={chapter.id}
                  className="space-y-4"
                >
                  <h2
                    className={cn(
                      "text-xl font-semibold",
                      isActive ? "text-primary" : "text-foreground",
                    )}
                  >
                    {chapter.title}
                  </h2>

                  {chapter.blocks.map((block) => {
                    if (block.type === "image") {
                      return (
                        <picture
                          key={block.id}
                          data-block-id={block.id}
                          data-chapter-id={chapter.id}
                          className="flex justify-center my-4"
                        >
                          <img
                            src={block.src}
                            alt={block.alt ?? ""}
                            className="max-h-[70vh] rounded"
                          />
                        </picture>
                      );
                    }

                    return (
                      <div
                        key={block.id}
                        data-block-id={block.id}
                        data-chapter-id={chapter.id}
                        className="prose prose-invert max-w-none"
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: <temporary>
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                    );
                  })}
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
