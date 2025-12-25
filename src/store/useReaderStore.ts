// store/useReaderStore.ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Novel } from "@/libs/novel/types";

export interface Bookmark {
  chapterId: string;
  blockId: string;
}

export interface NovelMeta {
  id: string; // novelId
  title: string;
  fileName: string;
  createdAt: string; // ISO string
}

interface ReaderState {
  currentNovel: Novel | null;
  currentNovelId: string | null;
  bookmarksByNovelId: Record<string, Bookmark | undefined>;
  recents: NovelMeta[];

  setCurrentNovel: (novel: Novel, meta: NovelMeta) => void;
  saveBookmarkForCurrent: (bookmark: Bookmark) => void;
  getBookmarkForCurrent: () => Bookmark | null;
  clearCurrent: () => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      currentNovel: null,
      currentNovelId: null,
      bookmarksByNovelId: {},
      recents: [],

      setCurrentNovel: (novel, meta) => {
        set((state) => {
          const withoutCurrent = state.recents.filter((m) => m.id !== meta.id);
          return {
            currentNovel: novel,
            currentNovelId: meta.id,
            recents: [meta, ...withoutCurrent],
          };
        });
      },

      saveBookmarkForCurrent: (bookmark) => {
        const { currentNovelId } = get();
        if (!currentNovelId) return;

        set((state) => ({
          bookmarksByNovelId: {
            ...state.bookmarksByNovelId,
            [currentNovelId]: bookmark,
          },
        }));
      },

      getBookmarkForCurrent: () => {
        const { currentNovelId, bookmarksByNovelId } = get();
        if (!currentNovelId) return null;
        return bookmarksByNovelId[currentNovelId] ?? null;
      },

      // On ne touche pas aux bookmarks ni aux recents ici
      clearCurrent: () => set({ currentNovel: null, currentNovelId: null }),
    }),
    {
      name: "seamless-reader",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }

        const ls = window.localStorage;

        return {
          getItem: ls.getItem.bind(ls),
          setItem: (name, value) => {
            try {
              ls.setItem(name, value);
            } catch (err) {
              console.warn("Seamless: impossible de persister l'état", err);
            }
          },
          removeItem: ls.removeItem.bind(ls),
        };
      }),
      // ⚠️ On ne persiste PAS le Novel complet
      partialize: (state) => ({
        currentNovelId: state.currentNovelId,
        bookmarksByNovelId: state.bookmarksByNovelId,
        recents: state.recents,
      }),
    },
  ),
);
