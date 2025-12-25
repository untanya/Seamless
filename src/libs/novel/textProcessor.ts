// lib/novel/textProcessor.ts
import { NovelPatternMatcher } from "./patternMatcher";
import type { LanguageCode } from "./types";

type BlockType = "paragraph" | "dialogue";

export class TextProcessor {
  private sentenceEndings = new Set([".", "!", "?", "...", "。", "！", "？"]);
  private dialogueMarkers: string[];

  // séparateur de scène type "◊ ◊ ◊", "◆ ◆ ◆", etc.
  private sceneBreakRegex = /^([◊◇◆✦*]\s*){3,}$/u;

  constructor(
    language: LanguageCode,
    patternMatcher = new NovelPatternMatcher(language),
  ) {
    this.dialogueMarkers = patternMatcher.getDialogueMarkers();
  }

  processContent(text: string): { type: BlockType; html: string }[] {
    // Normalisation des retours à la ligne
    let normalized = text.replace(/\r\n?/g, "\n");

    // On isole les séparateurs de scène sur leur propre ligne
    normalized = this.splitOnSceneBreakers(normalized);

    // On insère des \n devant les guillemets d'ouverture pour casser
    // les gros blocs type “A” “B” “C” en lignes distinctes
    normalized = this.splitOnDialogueOpeners(normalized);

    const blocks: { type: BlockType; html: string }[] = [];

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
    blocks: { type: BlockType; html: string }[],
  ) {
    const rawLines = paragraph
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => this.isValidLine(l));

    if (!rawLines.length) return;

    // 🔧 Nettoyage des lignes qui commencent par " mais ne sont pas de vrais dialogues
    const lines = rawLines.map((line) => this.cleanNonDialogueQuoteLine(line));

    let current = "";
    let inDialogue = false;

    for (const line of lines) {
      // 1) Gestion des séparateurs de scène
      if (this.isSceneBreak(line)) {
        if (current) {
          blocks.push({
            type: inDialogue ? "dialogue" : "paragraph",
            html: inDialogue
              ? `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`
              : `<p>${this.escapeHtml(current.trim())}</p>`,
          });
          current = "";
          inDialogue = false;
        }

        // Bloc spécifique pour la rupture de scène
        blocks.push({
          type: "paragraph",
          html: `<p class="scene-break">${this.escapeHtml(
            line.replace(/\s+/g, " ").trim(),
          )}</p>`,
        });
        continue;
      }

      // 2) Dialogues / narration
      const dialogueStart = this.isDialogueStart(line);

      if (dialogueStart) {
        // Nouvelle réplique qui commence par un guillemet

        // Flush du bloc précédent
        if (current) {
          blocks.push({
            type: inDialogue ? "dialogue" : "paragraph",
            html: inDialogue
              ? `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`
              : `<p>${this.escapeHtml(current.trim())}</p>`,
          });
        }

        current = line;
        inDialogue = true;

        if (this.isSentenceEnd(line)) {
          blocks.push({
            type: "dialogue",
            html: `<blockquote>${this.escapeHtml(current.trim())}</blockquote>`,
          });
          current = "";
          inDialogue = false;
        }
      } else if (inDialogue) {
        // Suite d'un dialogue sur plusieurs lignes
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

    // URLs
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return false;
    }

    // Lignes qui ne sont qu'un ou plusieurs guillemets → bruit d'OCR
    if (/^["“”«»『』「」]+$/.test(trimmed)) {
      return false;
    }

    // Lignes de type "15 | P a g e" ou variantes
    if (/^\d+\s*\|\s*[Pp]\s*a\s*g\s*e\b/.test(trimmed)) {
      return false;
    }
    if (/^\d+\s+page\b/i.test(trimmed)) {
      return false;
    }

    if (/^page\s*[|:]\s*\d+\s*$/i.test(trimmed)) return false;
    if (/^page\s+\d+\s*$/i.test(trimmed)) return false;

    return true;
  }

  /**
   * On décide ici si une ligne qui commence par un marqueur de dialogue
   * est *vraiment* une réplique, ou juste du texte entouré d'un guillemet pourri.
   *
   * - Pour les marqueurs exotiques ("“", "«", "「", etc.) : comportement historique.
   * - Pour le `"` simple : on demande au moins **2 guillemets** dans la ligne
   *   (ouverture + fermeture) pour considérer que c'est un vrai dialogue.
   */
  private isDialogueStart(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const marker = this.dialogueMarkers.find((m) => trimmed.startsWith(m));
    if (!marker) return false;

    // Tous les marqueurs sauf " gardent le comportement existant
    if (marker !== '"') {
      return true;
    }

    // Pour " : on exige qu'il y ait au moins 2 guillemets dans la ligne
    const quoteCount = (trimmed.match(/"/g) ?? []).length;
    if (quoteCount >= 2) {
      return true;
    }

    // Un seul " → très probablement du bruit d'extraction (Mahouka, etc.)
    return false;
  }

  private isSentenceEnd(line: string): boolean {
    let trimmed = line.trim();

    // On ignore les guillemets / crochets de fin pour déterminer la ponctuation
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
    const openers = ['"', "“", "«", "『", "「"];

    for (const opener of openers) {
      const escaped = this.escapeRegExp(opener);
      const regex = new RegExp(`\\s*${escaped}`, "g");
      text = text.replace(regex, `\n${opener}`);
    }

    return text;
  }

  /**
   * Isoler les marqueurs de scène (losanges, etc.) sur une ligne dédiée.
   * Exemple :
   *   "◊ ◊ ◊ After finals..."
   * devient :
   *   "◊ ◊ ◊"
   *   "After finals..."
   */
  private splitOnSceneBreakers(text: string): string {
    return text.replace(
      /(◊\s*◊\s*◊|◇\s*◇\s*◇|◆\s*◆\s*◆|✦\s*✦\s*✦|\*\s*\*\s*\*)/gu,
      "\n$1\n",
    );
  }

  private isSceneBreak(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return this.sceneBreakRegex.test(trimmed);
  }

  /**
   * Nettoie les lignes qui commencent par un " mais
   * qui ne sont PAS reconnues comme dialogues.
   *
   * Typiquement :
   *   `" Hearing Leo's question, Tatsuya immediately understood.`
   * devient :
   *   `Hearing Leo's question, Tatsuya immediately understood.`
   */
  private cleanNonDialogueQuoteLine(line: string): string {
    const trimmedLeft = line.trimStart();
    if (!trimmedLeft.startsWith('"')) return line;

    // Si malgré tout on considère que c'est un vrai dialogue, ne pas toucher.
    if (this.isDialogueStart(line)) return line;

    const firstQuoteIndex = line.indexOf('"');
    if (firstQuoteIndex === -1) return line;

    return line.slice(0, firstQuoteIndex) + line.slice(firstQuoteIndex + 1);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
