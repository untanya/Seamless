// src/libs/novel/pdf.ts
import fs from "node:fs/promises";
import zlib from "node:zlib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawBlock } from "./types";

// Limites pour éviter de faire exploser le temps de conversion
const MAX_IMAGES_TOTAL = 40; // max d'images pour tout le PDF
const MAX_IMAGES_PER_PAGE = 3; // max d'images par page
const MIN_IMAGE_AREA = 200_000; // on ignore les images < 200k px (petites trames)

export async function parsePdfToBlocks(pdfPath: string): Promise<RawBlock[]> {
  const data = new Uint8Array(await fs.readFile(pdfPath));

  const loadingTask = (pdfjsLib as any).getDocument({
    data,
    useSystemFonts: false,
  });

  const pdf = await loadingTask.promise;
  const blocks: RawBlock[] = [];
  let totalImages = 0;

  console.log(`[pdf] Start parse: ${pdfPath} (${pdf.numPages} pages)`);

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    console.log(`[pdf] Page ${pageIndex}/${pdf.numPages}`);

    // ------------------------------
    // 1) TEXTE DE LA PAGE
    // ------------------------------
    const textContent = await page.getTextContent();
    const text = textContent.items
      // biome-ignore lint/suspicious/noExplicitAny: items non typés par pdf.js
      .map((i: any) => ("str" in i ? i.str : ""))
      .join("\n");

    blocks.push({
      kind: "text",
      pageIndex: pageIndex - 1,
      order: 1,
      text,
    });

    // Si on a déjà atteint la limite globale d'images, on ne tente plus d'en extraire
    if (totalImages >= MAX_IMAGES_TOTAL) {
      continue;
    }

    // ------------------------------
    // 2) IMAGES (best-effort, sans canvas)
    // ------------------------------
    let imagesOnPage = 0;

    try {
      const opList = await page.getOperatorList();
      const objs = (page as any).objs;
      if (!objs) {
        continue;
      }

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fnId = opList.fnArray[i];

        // 92 = paintImageXObject, 91 = paintInlineImageXObject
        if (
          fnId !== pdfjsLib.OPS.paintImageXObject &&
          fnId !== pdfjsLib.OPS.paintInlineImageXObject
        ) {
          continue;
        }

        if (imagesOnPage >= MAX_IMAGES_PER_PAGE) break;
        if (totalImages >= MAX_IMAGES_TOTAL) break;

        const args = opList.argsArray[i];
        const objId = args && args[0];
        if (!objId) continue;

        // Ne pas demander un objet pas encore résolu
        if (typeof objs.hasData === "function" && !objs.hasData(objId)) {
          continue;
        }

        let img: any;
        try {
          img = objs.get(objId);
        } catch {
          // "Requesting object that isn't resolved yet" -> on ignore cette image
          continue;
        }

        if (!img || !img.data || !img.width || !img.height) {
          continue;
        }

        const area = img.width * img.height;
        // On ignore les petites images (icônes, trames, etc.)
        if (area < MIN_IMAGE_AREA) {
          continue;
        }

        let pngBase64: string;
        try {
          pngBase64 = encodeRGBAtoPNG(img);
        } catch {
          continue;
        }

        blocks.push({
          kind: "image",
          pageIndex: pageIndex - 1,
          order: 0,
          dataUrl: `data:image/png;base64,${pngBase64}`,
          alt: `Image p.${pageIndex}`,
        });

        imagesOnPage++;
        totalImages++;
      }

      if (imagesOnPage > 0) {
        console.log(
          `[pdf]   Images on page ${pageIndex}: ${imagesOnPage} (total: ${totalImages})`,
        );
      }
    } catch (err) {
      console.log(
        `[pdf]   Image extraction error on page ${pageIndex}:`,
        (err as Error).message,
      );
      // On ignore l'erreur pour ne pas casser la conversion
    }
  }

  blocks.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return a.order - b.order;
  });

  console.log(
    `[pdf] Done parse: ${pdfPath} (pages: ${pdf.numPages}, images: ${totalImages})`,
  );

  return blocks;
}

/**
 * Encode un buffer source (1, 3 ou 4 composantes) en PNG RGBA.
 * Compatible Uint8Array / Uint8ClampedArray, sans canvas.
 */
function encodeRGBAtoPNG(img: any): string {
  const { width, height, data } = img; // data: Uint8Array / Uint8ClampedArray
  const totalPixels = width * height;
  const components =
    totalPixels > 0 ? Math.max(1, Math.floor(data.length / totalPixels)) : 4;

  const strideRGBA = width * 4;
  const raw = Buffer.alloc((strideRGBA + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = (strideRGBA + 1) * y;
    raw[rowStart] = 0; // filtre PNG = None

    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const srcIndex = pixelIndex * components;
      const destIndex = rowStart + 1 + x * 4;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (components === 4) {
        r = data[srcIndex];
        g = data[srcIndex + 1];
        b = data[srcIndex + 2];
        a = data[srcIndex + 3];
      } else if (components === 3) {
        r = data[srcIndex];
        g = data[srcIndex + 1];
        b = data[srcIndex + 2];
      } else if (components === 1) {
        r = g = b = data[srcIndex]; // niveau de gris
      } else {
        const v = data[srcIndex] ?? 0;
        r = g = b = v;
      }

      raw[destIndex] = r;
      raw[destIndex + 1] = g;
      raw[destIndex + 2] = b;
      raw[destIndex + 3] = a;
    }
  }

  const table = new Uint32Array(
    Array.from({ length: 256 }, (_, i) => {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      return c >>> 0;
    }),
  );

  const crc32 = (buf: Buffer) => {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return ~crc >>> 0;
  };

  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };

  const pngHeader = Buffer.from("89504E470D0A1A0A", "hex");

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 1 }); // level 1 = compression rapide

  const png = Buffer.concat([
    pngHeader,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  return png.toString("base64");
}
