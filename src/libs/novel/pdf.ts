// src/libs/novel/pdf.ts
import fs from "node:fs/promises";
// 🟢 Build Node-friendly (pas de DOMMatrix / canvas requis)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawBlock } from "./types";

// 🔧 IMPORTANT : indiquer manuellement où se trouve le worker
// (évite l'erreur "Setting up fake worker failed: Cannot find module 'pdf.worker.mjs'")
// biome-ignore lint/suspicious/noExplicitAny: <expected>
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function parsePdfToBlocks(pdfPath: string): Promise<RawBlock[]> {
  // fs.readFile -> Buffer
  const fileBuffer = await fs.readFile(pdfPath);

  // 👉 Conversion explicite Buffer -> Uint8Array (cf. erreur précédente)
  const data = new Uint8Array(
    fileBuffer.buffer,
    fileBuffer.byteOffset,
    fileBuffer.byteLength,
  );

  // pdfjs-dist depuis la racine, sans worker custom
  // biome-ignore lint/suspicious/noExplicitAny: <expected>
  const loadingTask = (pdfjsLib as any).getDocument({ data });
  const doc = await loadingTask.promise;
  const numPages: number = doc.numPages;

  const blocks: RawBlock[] = [];

  for (let pageIndex = 1; pageIndex <= numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex);
    const textContent = await page.getTextContent();

    const text = textContent.items
      // biome-ignore lint/suspicious/noExplicitAny: pdfjs items pas typées
      .map((item: any) => ("str" in item ? item.str : ""))
      .join("\n");

    blocks.push({
      pageIndex: pageIndex - 1,
      order: 0,
      kind: "text",
      text,
    });
  }

  blocks.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return a.order - b.order;
  });

  return blocks;
}
