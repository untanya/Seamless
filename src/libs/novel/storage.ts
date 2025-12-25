// libs/novel/storage.ts
import { createStore, del, get, keys, set } from "idb-keyval";
import type { Novel } from "@/libs/novel/types";

const novelStore = createStore("seamless-db", "novels");

export async function saveNovelToDb(novelId: string, novel: Novel) {
  await set(novelId, novel, novelStore);
}

export async function loadNovelFromDb(novelId: string): Promise<Novel | null> {
  const res = (await get(novelId, novelStore)) as Novel | undefined;
  return res ?? null;
}

export async function deleteNovelFromDb(novelId: string) {
  await del(novelId, novelStore);
}

export async function listNovelIds(): Promise<string[]> {
  const allKeys = (await keys(novelStore)) as string[];
  return allKeys;
}
