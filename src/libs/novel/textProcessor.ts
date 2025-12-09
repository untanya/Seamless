// lib/novel/textProcessor.ts
import { NovelPatternMatcher } from "./patternMatcher";
import type { LanguageCode } from "./types";

export class TextProcessor {
  private sentenceEndings = new Set([".", "!", "?", "...", "。", "！", "？"]);
  private dialogueMarkers: string[];

  constructor(
    language: LanguageCode,
    patternMatcher = new NovelPatternMatcher(language),
  ) {
    this.dialogueMarkers = patternMatcher.getDialogueMarkers();
  }

  processContent(
    text: string,
  ): { type: "paragraph" | "dialogue"; html: string }[] {
    // Normalisation des retours à la ligne
    let normalized = text.replace(/\r\n?/g, "\n");

    // On insère des \n devant les guillemets d'ouverture pour casser
    // les gros blocs type “A” “B” “C” en lignes distinctes
    normalized = this.splitOnDialogueOpeners(normalized);

    const blocks: { type: "paragraph" | "dialogue"; html: string }[] = [];

    // On respecte au mieux les paragraphes : séparation sur lignes vides
    const paragraphs = normalized
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const paragraph of paragraphs) {
      this.processParagraphSequential(paragraph, blocks);
    }

    return blocks;
  }

  // Méthode principale : narration + dialogues
  private processParagraphSequential(
    paragraph: string,
    blocks: { type: "paragraph" | "dialogue"; html: string }[],
  ) {
    const lines = paragraph
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => this.isValidLine(l));

    if (!lines.length) return;

    let current = "";
    let inDialogue = false;

    for (const line of lines) {
      const dialogueStart = this.isDialogueStart(line);

      if (dialogueStart) {
        // 🟢 Nouvelle réplique qui commence par un guillemet

        // 1) On flush ce qu'on avait avant (dialogue ou paragraphe)
        if (current) {
          blocks.push({
            type: inDialogue ? "dialogue" : "paragraph",
            html: inDialogue
              ? `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`
              : `<p>${this.escapeHtml(current.trim())}</p>`,
          });
        }

        // 2) On démarre une nouvelle réplique
        current = line;
        inDialogue = true;

        // 3) Si cette ligne se termine déjà par une ponctuation de fin,
        //    on peut la pousser immédiatement
        if (this.isSentenceEnd(line)) {
          blocks.push({
            type: "dialogue",
            html: `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`,
          });
          current = "";
          inDialogue = false;
        }
      } else if (inDialogue) {
        // On continue une réplique sur plusieurs lignes
        current += (current ? " " : "") + line;
        if (this.isSentenceEnd(line)) {
          blocks.push({
            type: "dialogue",
            html: `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`,
          });
          current = "";
          inDialogue = false;
        }
      } else {
        // Narration
        current += (current ? " " : "") + line;
        if (this.isSentenceEnd(line)) {
          blocks.push({
            type: "paragraph",
            html: `<p>${this.escapeHtml(current.trim())}</p>`,
          });
          current = "";
        }
      }
    }

    // Flush final
    if (current) {
      blocks.push({
        type: inDialogue ? "dialogue" : "paragraph",
        html: inDialogue
          ? `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`
          : `<p>${this.escapeHtml(current.trim())}</p>`,
      });
    }
  }

  // --- Helpers ---

  private isValidLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return false;
    }
    return true;
  }

  private isDialogueStart(line: string): boolean {
    const trimmed = line.trim();
    return this.dialogueMarkers.some((m) => trimmed.startsWith(m));
  }

  private isSentenceEnd(line: string): boolean {
    // On ignore les guillemets / crochets de fin pour déterminer la ponctuation
    let trimmed = line.trim();

    trimmed = trimmed.replace(/[”"'»」』]+$/u, "");

    return Array.from(this.sentenceEndings).some((end) =>
      trimmed.endsWith(end),
    );
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Coupe les gros blocs en introduisant des \n devant les guillemets d'ouverture,
   * afin que chaque réplique devienne une "ligne" distincte.
   *
   * Exemple :
   *   “A” “B” “C”
   * devient :
   *   “A”
   *   “B”
   *   “C”
   */
  private splitOnDialogueOpeners(text: string): string {
    // On cible les guillemets d'ouverture typiques des LN
    const openers = ['"', "“", "«", "『", "「"];

    for (const opener of openers) {
      const escaped = this.escapeRegExp(opener);
      // On remplace "   «" ou " “" etc. par "\n«" ou "\n“"
      const regex = new RegExp(`\\s*${escaped}`, "g");
      text = text.replace(regex, `\n${opener}`);
    }

    return text;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
