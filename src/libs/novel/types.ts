// lib/novel/types.ts
export type Block =
  | {
      id: string;
      type: "paragraph" | "dialogue";
      html: string;
    }
  | {
      id: string;
      type: "image";
      src: string;
      alt?: string;
    };

export interface Chapter {
  id: string; // ex: "chapter-1"
  number: number; // 1, 2, …
  title: string;
  blocks: Block[];
}

export interface TocItem {
  id: string; // "chapter-1"
  label: string; // texte dans le sommaire
  chapterNumber: number;
}

export interface NovelMetadata {
  title: string;
  language: string; // "fr" | "en" | "ja" etc.
  author?: string;
  series?: string;
  volume?: string;
}

export interface Novel {
  metadata: NovelMetadata;
  toc: TocItem[];
  chapters: Chapter[];
}

// Pour l’API interne
export type LanguageCode = "fr" | "en" | "ja";

export type RawBlock =
  | {
      pageIndex: number;
      order: number;
      kind: "text";
      text: string;
    }
  | {
      pageIndex: number;
      order: number;
      kind: "image";
      dataUrl: string;
      alt: string;
    };