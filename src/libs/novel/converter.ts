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
    flushPendingText();
    if (!currentBlocks.length) return;

    chapterCount++;

    const number = currentNumber ?? chapterCount;
    const id = `chapter-${chapterCount}`;

    chapters.push({
      id,
      number,
      title: currentTitle || `Chapter ${number}`,
      blocks: currentBlocks,
    });

    currentBlocks = [];
    currentTitle = "";
    currentNumber = undefined;
  };

  // --- structure helpers ---

  const isPageLine = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    if (/^page\s*[|:]\s*\d+\s*$/i.test(t)) return true;
    if (/^page\s+\d+\s*$/i.test(t)) return true;
    if (/^\d+\s*\|\s*[Pp]\s*a\s*g\s*e\b/.test(t)) return true;
    return false;
  };

  const looksLikeOpeningContent = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    if (/^["“‘«「『]/.test(t)) return true;
    if (t.endsWith(",")) return true;
    return false;
  };

  const isHeaderContinuation = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;

    if (/[.!?]$/.test(t)) return false;
    if (looksLikeOpeningContent(t)) return false;

    if (t.length < 3 || t.length > 140) return false;

    const letters = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (!letters) return false;

    const upper = letters.replace(/[^A-ZÀ-Ö]/g, "");
    const upperRatio = upper.length / letters.length;

    return upperRatio > 0.7;
  };

  const endsLikeHeadingPrefix = (line: string): boolean => {
    const t = line.trim();
    return /[:\-–]\s*$/.test(t);
  };

  const isAllCapsWord = (w: string): boolean => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    if (letters.length < 2) return false;
    return (
      letters === letters.toUpperCase() && letters !== letters.toLowerCase()
    );
  };

  // Split mixed heading line:
  // "The Diary (Part 1) IT WAS THE MORNING AFTER ..."
  // -> title: "The Diary (Part 1)"
  // -> remainder: "IT WAS THE MORNING AFTER ..."
  const splitTitleFromMixedLine = (
    line: string,
  ): { title: string; remainder: string } => {
    const t = line.trim();
    if (!t) return { title: "", remainder: "" };

    const tokens = t.split(/\s+/);
    if (tokens.length < 6) return { title: t, remainder: "" };

    let splitAt = -1;

    for (let i = 0; i < tokens.length - 2; i++) {
      if (!isAllCapsWord(tokens[i])) continue;
      if (!isAllCapsWord(tokens[i + 1])) continue;
      if (!isAllCapsWord(tokens[i + 2])) continue;

      const after = tokens.slice(i).join(" ");
      const hasLowerLater = /[a-z]/.test(after);
      if (!hasLowerLater) continue;

      const before = tokens.slice(0, i).join(" ").trim();
      if (before.length < 6) continue;

      const remainder = tokens.slice(i).join(" ").trim();
      if (remainder.length < 20) continue;

      splitAt = i;
      break;
    }

    if (splitAt === -1) return { title: t, remainder: "" };

    return {
      title: tokens.slice(0, splitAt).join(" ").trim(),
      remainder: tokens.slice(splitAt).join(" ").trim(),
    };
  };

  // Returns:
  // - finalTitle: what goes into chapter.title
  // - consumed: how many lines to consume from input
  // - remainderToText: if we split title/body, this goes back into pendingText
  const consumeChapterHeading = (
    lines: string[],
    startIndex: number,
    chapLine: string,
  ): { finalTitle: string; consumed: number; remainderToText: string } => {
    const det = matcher.detectChapter(chapLine);
    if (!det) {
      return { finalTitle: chapLine.trim(), consumed: 1, remainderToText: "" };
    }

    // Case A: same-line title exists ("Chapter 12: The Summons")
    if (det.title?.trim()) {
      // Keep "Chapter X:" prefix as part of the title? -> NO, we keep what parser already gives
      // But you want it for prefix-only cases; for same-line cases, the input already has it.
      return { finalTitle: chapLine.trim(), consumed: 1, remainderToText: "" };
    }

    // Case B: "Chapter X" (no ":" / "-" / "–") => keep as-is (avoid eating content)
    if (!endsLikeHeadingPrefix(chapLine)) {
      return { finalTitle: chapLine.trim(), consumed: 1, remainderToText: "" };
    }

    // Case C: "Chapter X:" prefix-only => merge next title-ish line
    let j = startIndex + 1;
    while (j < lines.length) {
      const next = (lines[j] ?? "").trim();
      if (!next) {
        j++;
        continue;
      }
      if (isPageLine(next)) {
        j++;
        continue;
      }
      if (looksLikeOpeningContent(next)) {
        return {
          finalTitle: chapLine.trim(),
          consumed: 1,
          remainderToText: "",
        };
      }

      // We accept next line as title if it looks like a heading OR it looks like a normal title line.
      // This keeps compatibility with novels that use Title Case (not all-caps).
      if (
        !matcher.isLikelyChapterTitleLine(next) &&
        !isHeaderContinuation(next)
      ) {
        return {
          finalTitle: chapLine.trim(),
          consumed: 1,
          remainderToText: "",
        };
      }

      // Try merging optional 2nd continuation line (rare)
      let full = next;
      let consumed = j - startIndex + 1;

      const next2 = (lines[j + 1] ?? "").trim();
      if (next2 && !isPageLine(next2) && isHeaderContinuation(next2)) {
        full = `${full} ${next2}`;
        consumed += 1;
      }

      // Split "title + body" line
      const { title, remainder } = splitTitleFromMixedLine(full);

      // ✅ IMPORTANT: keep "Chapter X:" prefix in final title
      // Example wanted: "Chapter 1: The Diary (Part 1)"
      const prefix = chapLine.trim().replace(/\s*$/, "");
      const final = title ? `${prefix} ${title}` : prefix;

      return { finalTitle: final.trim(), consumed, remainderToText: remainder };
    }

    return { finalTitle: chapLine.trim(), consumed: 1, remainderToText: "" };
  };

  // --- main loop ---

  for (const raw of rawBlocks) {
    if (raw.kind === "text") {
      const lines = raw.text.split("\n").map((l) => l.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        if (isPageLine(line)) continue;

        const chap = matcher.detectChapter(line);
        if (chap) {
          pushCurrentChapter();

          const { finalTitle, consumed, remainderToText } =
            consumeChapterHeading(lines, i, line);

          currentTitle = finalTitle || line;
          currentNumber = chap.number;

          if (remainderToText) {
            pendingText += (pendingText ? "\n" : "") + remainderToText;
          }

          i += Math.max(0, consumed - 1);
          continue;
        }

        if (!looksLikeOpeningContent(line)) {
          const section = matcher.detectSection(line);
          if (section) {
            let fullTitle = section.title;

            let j = i + 1;
            while (j < lines.length) {
              const nextLine = (lines[j] ?? "").trim();
              if (!nextLine) {
                j++;
                continue;
              }
              if (isPageLine(nextLine)) {
                j++;
                continue;
              }
              if (!isHeaderContinuation(nextLine)) break;

              fullTitle += ` ${nextLine}`;
              i = j;
              j++;
            }

            pushCurrentChapter();
            currentTitle = fullTitle.trim();
            currentNumber = undefined;
            continue;
          }
        }

        pendingText += (pendingText ? "\n" : "") + line;
      }
    } else if (raw.kind === "image") {
      flushPendingText();

      currentBlocks.push({
        id: nanoid(),
        type: "image",
        src: raw.dataUrl,
        alt: raw.alt,
      });
    }
  }

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
