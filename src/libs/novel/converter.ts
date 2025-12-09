// lib/novel/converter.ts

import { nanoid } from "nanoid";
import { NovelPatternMatcher } from "./patternMatcher";
import { TextProcessor } from "./textProcessor";
import type {
  Chapter,
  LanguageCode,
  Novel,
  Block as NovelBlock,
  RawBlock,
  TocItem,
} from "./types";

interface ConvertOptions {
  title: string;
  language: LanguageCode;
  author?: string;
  series?: string;
  volume?: string;
}

export function convertBlocksToNovel(
  rawBlocks: RawBlock[],
  options: ConvertOptions,
): Novel {
  const matcher = new NovelPatternMatcher(options.language);
  const textProcessor = new TextProcessor(options.language, matcher);

  const chapters: Chapter[] = [];
  let currentBlocks: NovelBlock[] = [];
  let currentTitle = "Prologue";
  let currentNumber: number | undefined;
  let chapterCount = 0;

  // Texte brut en attente (entre deux headers)
  let pendingText = "";

  const flushPendingText = () => {
    const trimmed = pendingText.trim();
    if (!trimmed) return;

    const processed = textProcessor.processContent(trimmed);
    for (const p of processed) {
      currentBlocks.push({
        id: nanoid(),
        type: p.type,
        html: p.html,
      });
    }

    pendingText = "";
  };

  const pushCurrentChapter = () => {
    // On finalise d'abord le texte en attente
    flushPendingText();

    if (!currentBlocks.length) return;

    // Compteur strictement croissant = ID unique
    chapterCount++;

    // Numéro logique (issu du texte) ou fallback sur l'ordre
    const number = currentNumber ?? chapterCount;
    const id = `chapter-${chapterCount}`;

    chapters.push({
      id,
      number,
      title: currentTitle || `Chapitre ${number}`,
      blocks: currentBlocks,
    });

    currentBlocks = [];
    currentTitle = "";
    currentNumber = undefined;
  };

  // Heuristique : une ligne qui ressemble à la suite d'un header
  const isHeaderContinuation = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // On évite les phrases normales qui finissent par . ! ?
    if (/[.!?]$/.test(trimmed)) return false;

    // Pas trop court, pas trop long
    if (trimmed.length < 5 || trimmed.length > 140) return false;

    // Ratio de majuscules élevé
    const letters = trimmed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (!letters) return false;

    const upper = letters.replace(/[^A-ZÀ-Ö]/g, "");
    const upperRatio = upper.length / letters.length;

    // Si tout est en majuscules, ou quasi
    return upperRatio > 0.7;
  };

  for (const raw of rawBlocks) {
    if (raw.kind === "text") {
      const lines = raw.text.split("\n").map((l) => l.trim());

      // On a besoin d'un index pour regarder les lignes suivantes
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // 1) Header de chapitre classique ("Chapitre 1", "Part 2", "第3章", etc.)
        const chap = matcher.detectChapter(line);
        if (chap) {
          pushCurrentChapter();
          currentTitle = chap.title || line;
          currentNumber = chap.number;
          continue;
        }

        // 2) Header de section / scène (Prologue, Epilogue, headers journalistiques)
        const section = matcher.detectSection(line);
        if (section) {
          // On essaie de récupérer les lignes suivantes qui complètent le header
          let fullTitle = section.title;

          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j];
            if (!nextLine) {
              j++;
              continue;
            }

            if (!isHeaderContinuation(nextLine)) break;

            // On ajoute la ligne suivante au titre
            fullTitle += " " + nextLine.trim();
            i = j; // on avance l'index principal pour "consommer" cette ligne
            j++;
          }

          pushCurrentChapter();
          currentTitle = fullTitle;
          currentNumber = undefined; // numérotation continue auto
          continue;
        }

        // 3) Ligne "normale" => on la colle au texte en attente
        // On garde les "\n" pour que TextProcessor voie les coupures
        pendingText += (pendingText ? "\n" : "") + line;
      }
    } else if (raw.kind === "image") {
      // On flush le texte avant d'insérer une image
      flushPendingText();

      currentBlocks.push({
        id: nanoid(),
        type: "image",
        src: raw.dataUrl,
        alt: raw.alt,
      });
    }
  }

  // Dernier chapitre à la fin
  pushCurrentChapter();

  const toc: TocItem[] = chapters
    .filter((c) => c.title.trim().length > 0)
    .map((c) => ({
      id: c.id,
      label: c.title,
      chapterNumber: c.number,
    }));

  return {
    metadata: {
      title: options.title,
      language: options.language,
      author: options.author,
      series: options.series,
      volume: options.volume,
    },
    toc,
    chapters,
  };
}
