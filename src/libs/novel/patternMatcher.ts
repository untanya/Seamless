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
      String.raw`^chapitre\s*(\d+)\s*$`,
      String.raw`^chapitre\s*(\d+)\s*[:\-–]?\s*(.*)$`,
      String.raw`^partie\s*(\d+)\s*[:\-–]?\s*(.*)$`,
    ],
    dialogue: ["—", "–", "-", "«", "“", '"'],
    section: [
      String.raw`^(prologue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(épilogue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(avant[-\s]?propos)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(postface)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(.*\bprologue\b.*)$`,
      String.raw`^(.*\bépilogue\b.*)$`,
    ],
  },
  en: {
    chapter: [
      String.raw`^chapter\s*(\d+)\s*$`,
      String.raw`^chapter\s*(\d+)\s*[:\-–]?\s*(.*)$`,
      String.raw`^part\s*(\d+)\s*[:\-–]?\s*(.*)$`,
    ],
    dialogue: ['"', "“", "‘"],
    section: [
      String.raw`^(prologue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(epilogue)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(author[’']?s?\s+foreword)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(afterword)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(intermission)\s*[:\-–]?\s*(.*)$`,

      String.raw`^(.*\bprologue\b.*)$`,
      String.raw`^(.*\bepilogue\b.*)$`,
      String.raw`^(.*\bauthor[’']?s?\s+foreword\b.*)$`,
      String.raw`^(.*\bafterword\b.*)$`,
      String.raw`^(.*\bintermission\b.*)$`,
    ],
  },
  ja: {
    chapter: [
      String.raw`^第(\d+)章\s*[:\-–]?\s*(.*)$`,
      String.raw`^(\d+)章\s*[:\-–]?\s*(.*)$`,
    ],
    dialogue: ["「", "『"],
    section: [
      String.raw`^(プロローグ)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(エピローグ)\s*[:\-–]?\s*(.*)$`,
      String.raw`^(.*プロローグ.*)$`,
      String.raw`^(.*エピローグ.*)$`,
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
    if (!trimmed) return null;

    for (const pattern of this.config.chapter) {
      const regex = new RegExp(pattern, "i");
      const match = trimmed.match(regex);
      if (!match) continue;

      const rawNum = match[1]?.trim();
      const num = rawNum && /^\d+$/.test(rawNum) ? Number(rawNum) : undefined;

      // If pattern has no explicit title capture group, keep title empty
      const rawTitle = (match[2] ?? "").trim();

      return { number: num, title: rawTitle };
    }

    return null;
  }

  detectSection(line: string): { title: string } | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Avoid misclassifying opening-content lines as headers
    // e.g. “DEAR RUDEUS GREYRAT,”
    if (this.looksLikeOpeningContent(trimmed)) return null;

    // 1) Explicit patterns
    for (const pattern of this.config.section) {
      const regex = new RegExp(pattern, "i");
      const match = trimmed.match(regex);
      if (!match) continue;

      const main = (match[1] ?? match[0] ?? trimmed).trim();
      const rest = (match[2] ?? "").trim();

      // Avoid turning "title,": (comma-ended) into a header
      const title = rest ? `${main}: ${rest}` : main;
      if (this.looksLikeOpeningContent(title)) return null;

      return { title };
    }

    // 2) Mostly-uppercase short header heuristic
    if (trimmed.length >= 3 && trimmed.length <= 80) {
      if (this.looksLikeOpeningContent(trimmed)) return null;

      const lettersOnly = trimmed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
      if (lettersOnly) {
        const upper = lettersOnly.replace(/[^A-ZÀ-Ö]/g, "");
        const upperRatio = upper.length / lettersOnly.length;

        // Reject comma-ended lines (common for letters / content openings)
        if (
          upperRatio > 0.7 &&
          !/[.!?]$/.test(trimmed) &&
          !/, $/.test(trimmed) &&
          !trimmed.endsWith(",")
        ) {
          return { title: trimmed };
        }
      }
    }

    // 3) "Newswire" header heuristic
    if (trimmed.length >= 10 && trimmed.length <= 160) {
      if (this.looksLikeOpeningContent(trimmed)) return null;

      const letters = trimmed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
      if (letters) {
        const upper = letters.replace(/[^A-ZÀ-Ö]/g, "");
        const upperRatio = upper.length / letters.length;
        const hasDigitOrComma = /[0-9,]/.test(trimmed);

        // Still reject comma-ended lines
        if (upperRatio > 0.6 && hasDigitOrComma && !trimmed.endsWith(",")) {
          return { title: trimmed };
        }
      }
    }

    return null;
  }

  getDialogueMarkers(): string[] {
    return this.config.dialogue;
  }

  // Used by the parser to merge multi-line headings safely.
  isLikelyChapterTitleLine(line: string): boolean {
    const t = line.trim();
    if (!t) return false;

    // Page noise
    if (this.isPageLine(t)) return false;

    // Avoid grabbing opening content as titles (quotes / comma-ended)
    if (this.looksLikeOpeningContent(t)) return false;

    // Reasonable length for a title line
    if (t.length < 3 || t.length > 140) return false;

    // Looks like prose
    if (/[.!?]$/.test(t)) return false;

    // Too much punctuation usually means content
    const heavyPunct = (t.match(/[,;:]/g) ?? []).length;
    if (heavyPunct >= 4) return false;

    return true;
  }

  isPageLine(line: string): boolean {
    const t = line.trim();
    // "Page | 205", "Page: 205", "Page 205"
    if (/^page\s*[|:]\s*\d+\s*$/i.test(t)) return true;
    if (/^page\s+\d+\s*$/i.test(t)) return true;
    // "205 | P a g e"
    if (/^\d+\s*\|\s*[Pp]\s*a\s*g\s*e\b/.test(t)) return true;
    return false;
  }

  private looksLikeOpeningContent(line: string): boolean {
    const t = line.trim();

    // Starts with opening quotes (common for chapter openings / letters)
    if (/^["“‘«「『]/.test(t)) return true;

    // Comma-ended uppercase-ish opening line (e.g. DEAR RUDEUS GREYRAT,)
    if (t.endsWith(",")) return true;

    return false;
  }
}
