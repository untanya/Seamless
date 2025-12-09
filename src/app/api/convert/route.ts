// app/api/convert/route.ts

import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { detect as detectLanguage } from "tinyld";
import { convertBlocksToNovel } from "@/libs/novel/converter";
import { parsePdfToBlocks } from "@/libs/novel/pdf";
import type { LanguageCode } from "@/libs/novel/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let tempPath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    tempPath = join(tmpdir(), `${Date.now()}-${file.name}`);
    await writeFile(tempPath, buffer);

    const rawBlocks = await parsePdfToBlocks(tempPath);

    const sampleText = rawBlocks
      .filter((b) => b.kind === "text")
      .slice(0, 3)
      // biome-ignore lint/suspicious/noExplicitAny: texte interne
      .map((b: any) => b.text)
      .join("\n");

    const langDetected =
      (sampleText ? detectLanguage(sampleText) : null) || "en";
    const language = (
      ["fr", "en", "ja"].includes(langDetected) ? langDetected : "en"
    ) as LanguageCode;

    const novel = convertBlocksToNovel(rawBlocks, {
      title: file.name.replace(/\.pdf$/i, ""),
      language,
    });

    return NextResponse.json(novel);
  } catch (e) {
    const err = e as Error;
    console.error("Erreur /api/convert:", err?.message, err?.stack);
    return NextResponse.json(
      {
        error: "Conversion error",
        details: err?.message ?? String(e),
      },
      { status: 500 },
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
