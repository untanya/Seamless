// src/libs/novel/pdf.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <expected> */
import fs from "node:fs/promises";
import zlib from "node:zlib";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import type { RawBlock } from "./types";

const MAX_IMAGES_TOTAL = 40;
const MAX_IMAGES_PER_PAGE = 3;
const MIN_IMAGE_AREA = 200_000;

// La fonction renvoie désormais les blocs et un tableau de logs
export async function parsePdfToBlocks(
  pdfPath: string,
): Promise<{ blocks: RawBlock[]; logs: string[] }> {
  const fileBuffer = await fs.readFile(pdfPath);
  const data = new Uint8Array(fileBuffer);
  const pdf = await getDocumentProxy(data);

  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pagesText = Array.isArray(text) ? text : [text];

  const blocks: RawBlock[] = [];
  const logs: string[] = [];
  let totalImages = 0;

  logs.push(`[pdf] Start parse (unpdf): ${pdfPath} (${totalPages} pages)`);

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const pageNumber = pageIndex + 1;

    // Texte de la page
    const pageText = pagesText[pageIndex] ?? "";
    blocks.push({
      kind: "text",
      pageIndex,
      order: 1,
      text: pageText,
    });

    // On arrête d’extraire les images si la limite globale est atteinte
    if (totalImages >= MAX_IMAGES_TOTAL) continue;

    let imagesOnPage = 0;
    try {
      const images = await extractImages(pdf, pageNumber);
      for (const img of images) {
        if (imagesOnPage >= MAX_IMAGES_PER_PAGE) break;
        if (totalImages >= MAX_IMAGES_TOTAL) break;

        const area = img.width * img.height;
        if (area < MIN_IMAGE_AREA) continue;

        let pngBase64: string;
        try {
          pngBase64 = encodeRGBAtoPNG({
            width: img.width,
            height: img.height,
            data: img.data,
          });
        } catch {
          continue;
        }

        blocks.push({
          kind: "image",
          pageIndex,
          order: 0,
          dataUrl: `data:image/png;base64,${pngBase64}`,
          alt: `Image p.${pageNumber}`,
        });

        imagesOnPage++;
        totalImages++;
      }

      if (imagesOnPage > 0) {
        logs.push(
          `[pdf]   Images on page ${pageNumber}: ${imagesOnPage} (total: ${totalImages})`,
        );
      }
    } catch (err) {
      logs.push(
        `[pdf]   Image extraction error on page ${pageNumber}: ${
          (err as Error).message
        }`,
      );
    }
  }

  blocks.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return a.order - b.order;
  });

  logs.push(
    `[pdf] Done parse (unpdf): ${pdfPath} (pages: ${totalPages}, images: ${totalImages})`,
  );

  return { blocks, logs };
}

// ... (encodeRGBAtoPNG reste inchangé)

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
