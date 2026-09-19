"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";
import type { HistoryItem } from "@/components/player/types";
import { acknowledge, type ProgressMap, writeLegacyPosition } from "./local";
import { bookKey, type ChapterProgress, type ProgressRecord } from "./types";

function readJson(key: string, fallback: unknown = {}) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

export function useLibrary() {
  const [client] = useState(browserSupabase);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!client);
  const [hydrated, setHydrated] = useState(!client);
  const [status, setStatus] = useState("Saved on this device");
  const [entries, setEntries] = useState<HistoryItem[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const map = useRef<ProgressMap>({});
  const userRef = useRef<string | null>(null);
  const flushing = useRef(false);
  const latestCapture = useRef(new Map<string, string>());

  const publish = useCallback(() => {
    const id = userRef.current;
    if (!id) return;
    try { localStorage.setItem(`nab:cloud:${id}`, JSON.stringify(map.current)); } catch { setStatus("Device storage is full; keep this tab open to sync"); }
    setConflict(Object.keys(map.current).find((url) => map.current[url].conflict) ?? null);
    setEntries(Object.values(map.current).flatMap((local) => {
      const p = local.pending ?? local.record?.payload;
      if (!p) return [];
      return [{ url: p.chapterUrl, title: p.title, source: p.source, coverSeed: p.bookTitle || p.title,
        bookTitle: p.bookTitle, chapterLabel: p.chapterLabel, bookId: p.bookKey,
        lastAt: local.pending ? local.modifiedAt ?? 0 : local.record ? Date.parse(local.record.updated_at) : 0,
        audioTime: p.audioTime, mode: p.mode }];
    }).sort((a, b) => b.lastAt - a.lastAt));
  }, []);

  const flush = useCallback(async () => {
    if (!client || !userRef.current || flushing.current || !navigator.onLine) return;
    const owner = userRef.current;
    flushing.current = true;
    try {
      for (const [url, local] of Object.entries(map.current)) {
        if (!local.pending || local.conflict || owner !== userRef.current) continue;
        const sent = local.pending;
        setStatus("Saving…");
        const { data, error } = await client.rpc("save_progress", { p: sent, expected_revision: local.record?.revision ?? 0, importing: !!local.importing });
        if (owner !== userRef.current) return;
        if (error) throw error;
        const result = data as { accepted: boolean; record: ProgressRecord };
        map.current[url] = acknowledge(map.current[url], sent, result.record, result.accepted);
        publish();
      }
      setStatus(Object.values(map.current).some((v) => v.conflict) ? "Choose which stopping point to keep" : "Library synced");
    } catch {
      if (owner === userRef.current) setStatus("Saved on this device · sync will retry");
    } finally { flushing.current = false; }
  }, [client, publish]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => { if (active) { setUser(data.user); setReady(true); } });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setReady(true); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    const id = user?.id ?? null;
    userRef.current = id;
    latestCapture.current.clear();
    if (!client || !id) { map.current = {}; setEntries([]); setConflict(null); setHydrated(!client); return; }
    setHydrated(false);
    let cancelled = false;
    map.current = readJson(`nab:cloud:${id}`) as ProgressMap;
    publish();
    const load = async () => {
      try {
        const records: ProgressRecord[] = [];
        // Supabase responses are paginated: libraries must survive more than 1,000 chapters.
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await client.from("chapter_progress").select("chapter_url,book_key,payload,revision,updated_at").order("chapter_url").range(offset, offset + 499);
          if (error) throw error;
          records.push(...data as ProgressRecord[]);
          if (data.length < 500) break;
        }
        if (cancelled) return;
        for (const record of records) {
          const local = map.current[record.chapter_url];
          if (!local?.pending) map.current[record.chapter_url] = { record };
        }
        const importedKey = `nab:imported:${id}`;
        if (!localStorage.getItem(importedKey)) {
          const history = readJson("nab:history", []) as HistoryItem[];
          const byUrl = new Map(history.map((h) => [h.url, h]));
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            const prefix = ["nab:pos:", "nab:rsvp:", "nab:reader:"].find((p) => key.startsWith(p));
            if (!prefix) continue;
            const url = key.slice(prefix.length);
            if (!byUrl.has(url)) {
              try { byUrl.set(url, { url, title: "Saved chapter", source: new URL(url).hostname, coverSeed: url, lastAt: 0 }); } catch { /* Invalid old entry */ }
            }
          }
          for (const item of [...byUrl.values()].sort((a, b) => a.lastAt - b.lastAt)) {
            if (map.current[item.url]) continue;
            try {
              const pos = readJson(`nab:pos:${item.url}`) as { time?: number };
              const rsvp = readJson(`nab:rsvp:${item.url}`) as { wordIndex?: number };
              const reader = readJson(`nab:reader:${item.url}`) as { chunk?: number; offset?: number };
              map.current[item.url] = { importing: true, modifiedAt: item.lastAt || 0, pending: {
                chapterUrl: item.url, bookKey: bookKey(item), title: item.title,
                bookTitle: item.bookTitle, chapterLabel: item.chapterLabel, source: item.source,
                mode: "audio", audioTime: Math.max(0, pos.time || 0), voice: localStorage.getItem("nab:voice") || "en-US-AvaNeural",
                readerChunk: Math.max(0, reader.chunk || 0), readerOffset: Math.max(0, reader.offset || 0), wordIndex: Math.max(0, rsvp.wordIndex || 0),
              } };
            } catch { /* Keep malformed legacy entries untouched. */ }
          }
          publish();
          localStorage.setItem(importedKey, "1");
        }
        publish();
        setStatus("Library synced");
        await flush();
      } catch { if (!cancelled) setStatus("Saved on this device · sync will retry"); }
      finally { if (!cancelled) setHydrated(true); }
    };
    void load();
    const timer = setInterval(() => void flush(), 10_000);
    const sync = () => void flush();
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); else sync(); };
    window.addEventListener("online", sync);
    window.addEventListener("pagehide", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("online", sync); window.removeEventListener("pagehide", sync); document.removeEventListener("visibilitychange", onVisibility); };
  }, [user?.id, client, flush, publish]);

  const capture = useCallback((p: ChapterProgress) => {
    if (!userRef.current) return;
    const signature = JSON.stringify(p);
    if (latestCapture.current.get(p.chapterUrl) === signature) return;
    latestCapture.current.set(p.chapterUrl, signature);
    const local = map.current[p.chapterUrl] ?? {};
    map.current[p.chapterUrl] = { ...local, pending: p, importing: false, modifiedAt: Date.now() };
    publish();
  }, [publish]);

  const restore = useCallback((url: string): ChapterProgress | undefined => {
    const local = map.current[url];
    return local?.pending ?? local?.record?.payload;
  }, []);

  const resolve = useCallback((keepDevice: boolean) => {
    if (!conflict) return;
    const local = map.current[conflict];
    if (!local?.conflict) return;
    map.current[conflict] = { record: local.conflict, pending: keepDevice ? local.pending : undefined, modifiedAt: local.modifiedAt };
    if (!keepDevice) {
      writeLegacyPosition(local.conflict.payload);
      window.dispatchEvent(new CustomEvent("nab:restore-cloud", { detail: local.conflict.payload }));
    }
    publish();
    void flush();
  }, [conflict, publish, flush]);

  return { enabled: !!client, ready, hydrated, user, status, entries, conflict, capture, restore, flush, resolve,
    signIn: async (email: string, password: string) => {
      if (!client) return;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      await flush();
      await client?.auth.signOut();
    },
  };
}
