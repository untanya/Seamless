// app/page.tsx
"use client";

import { useState } from "react";
import { Reader } from "@/app/api/components/Reader";
import type { Novel } from "@/libs/novel/types";

export default function HomePage() {
  const [novel, setNovel] = useState<Novel | null>(null);
  const [novelId, setNovelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error || errBody?.details) {
            msg += ` – ${errBody.error ?? ""} ${errBody.details ?? ""}`;
          }
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as Novel;
      setNovel(data);
      setNovelId(`${file.name}-${file.size}-${file.lastModified}`);
    } catch (err) {
      console.error(err);
      setError("Erreur pendant la conversion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-4 space-y-4">
      <header className="max-w-3xl mx-auto space-y-2">
        <h1 className="text-2xl font-bold">LNReader</h1>
        <p className="text-sm text-muted-foreground">
          Choisis un PDF de Light Novel pour le lire dans l’interface.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
          />
          {loading && <span className="text-xs">Conversion en cours...</span>}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </header>

      {novel && novelId && (
        <section className="max-w-5xl mx-auto">
          <Reader novel={novel} novelId={novelId} />
        </section>
      )}

      {!novel && !loading && (
        <section className="max-w-3xl mx-auto text-sm text-muted-foreground">
          <p>Une fois le PDF envoyé, le serveur :</p>
          <ul className="list-disc list-inside">
            <li>
              extrait le texte (et plus tard les images) dans l&apos;ordre,
            </li>
            <li>détecte la langue et les chapitres,</li>
            <li>renvoie un JSON que le lecteur affiche.</li>
          </ul>
        </section>
      )}
    </main>
  );
}
