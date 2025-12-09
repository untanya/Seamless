// store/useReaderStore.ts
import { create } from "zustand";
import type { Novel } from "@/libs/novel/types";

interface Bookmark {
  chapterId: string;
  blockId: string;
}

interface ReaderState {
  novel: Novel | null;
  novelId: string | null;
  bookmark: Bookmark | null;
  setNovel: (novel: Novel, novelId: string) => void;
  loadBookmark: (novelId: string) => void;
  saveBookmark: (bookmark: Bookmark) => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  novel: null,
  novelId: null,
  bookmark: null,
  setNovel: (novel, novelId) => {
    set({ novel, novelId });
    get().loadBookmark(novelId);
  },
  loadBookmark: (novelId) => {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(`bookmark:${novelId}`)
        : null;
    if (!raw) return;
    try {
      const bookmark = JSON.parse(raw) as Bookmark;
      set({ bookmark });
    } catch {
      /* ignore */
    }
  },
  saveBookmark: (bookmark) => {
    const { novelId } = get();
    if (!novelId) return;
    localStorage.setItem(`bookmark:${novelId}`, JSON.stringify(bookmark));
    set({ bookmark });
  },
}));
