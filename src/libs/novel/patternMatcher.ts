// lib/novel/patternMatcher.ts
import type { LanguageCode } from "./types";

interface PatternConfig {
  chapter: string[];
  dialogue: string[];
  section: string[];
}

const PATTERNS: Record<LanguageCode, PatternConfig> = {
  fr: {
    chapter: [
      // "Chapitre 1: Titre"
      String.raw`^chapitre\s*(\d+)\s*[:\-–]?\s*(.*)$`,
      // "Partie 1 - Titre"
      String.raw`^partie\s*(\d+)\s*[:\-–]?\s*(.*)$`,
    ],
    // 🟢 EN FRANÇAIS : dialogues possibles avec tirets ET guillemets
    dialogue: ["—", "–", "-", "«", "“", '"'],
    section: [
      // Prologue / Épilogue comme sections particulières
      String.raw`^(prologue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(épilogue)\s*[:\-–]?\s*(.*)$`,
    ],
  },
  en: {
    chapter: [
      // "Chapter 1: Title"
      String.raw`^chapter\s*(\d+)\s*[:\-–]?\s*(.*)$`,
      // "Part 1 - Title"
      String.raw`^part\s*(\d+)\s*[:\-–]?\s*(.*)$`,
    ],
    // guillemets classiques anglais
    dialogue: ['"', "“", "‘"],
    section: [
      String.raw`^(prologue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(epilogue)\s*[:\-–]?\s*(.*)$`,
    ],
  },
  ja: {
    chapter: [
      String.raw`^第(\d+)章\s*[:\-–]?\s*(.*)$`,
      String.raw`^(\d+)章\s*[:\-–]?\s*(.*)$`,
    ],
    // guillemets japonais
    dialogue: ["「", "『"],
    section: [
      String.raw`^(プロローグ)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(エピローグ)\s*[:\-–]?\s*(.*)$`,
    ],
  },
};

export class NovelPatternMatcher {
  constructor(private language: LanguageCode) {}

  private get config(): PatternConfig {
    return PATTERNS[this.language] ?? PATTERNS.en;
  }

  detectChapter(line: string): { number?: number; title: string } | null {
    const trimmed = line.trim();
    for (const pattern of this.config.chapter) {
      const regex = new RegExp(pattern, "i");
      const match = trimmed.match(regex);
      if (match) {
        const num = match[1]?.trim();
        const title = match[2]?.trim() || trimmed;
        return {
          number: num && /^\d+$/.test(num) ? Number(num) : undefined,
          title,
        };
      }
    }
    return null;
  }

  /**
   * Détecte un header de section / scène, p.ex. :
   * "OCTOBER 23, UNIFIED YEAR 1924, IMPERIAL ARMY GENERAL STAFF OFFICE, DINING ROOM 1 (ARMY)"
   * ou "PROLOGUE", "EPILOGUE", etc.
   */
  detectSection(line: string): { title: string } | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // 1) Patterns explicites (Prologue, Epilogue, etc.)
    for (const pattern of this.config.section) {
      const regex = new RegExp(pattern, "i");
      const match = trimmed.match(regex);
      if (match) {
        const title = (match[1] ?? match[0] ?? trimmed).trim();
        const rest = (match[2] ?? "").trim();
        return {
          title: rest ? `${title}: ${rest}` : title,
        };
      }
    }

    // 2) Heuristique "header journalistique"
    if (trimmed.length < 10 || trimmed.length > 160) {
      return null;
    }

    const letters = trimmed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (!letters) return null;
    const upper = letters.replace(/[^A-ZÀ-Ö]/g, "");
    const upperRatio = upper.length / letters.length;

    const hasDigitOrComma = /[0-9,]/.test(trimmed);

    if (upperRatio > 0.6 && hasDigitOrComma) {
      return { title: trimmed };
    }

    return null;
  }

  getDialogueMarkers(): string[] {
    return this.config.dialogue;
  }
}
