import { useEffect, useMemo, useRef, useState } from "react";
import { searchCampus, type SearchResult } from "../semantic";
import { buildings, places, categoryNames } from "../data/campus";
export function useCampusSearch(query: string) {
  const base = useMemo(() => searchCampus(query, 20), [query]);
  const [semantic, setSemantic] = useState<{
    query: string;
    scores: Record<string, number>;
  }>();
  const worker = useRef<Worker | null>(null),
    ready = useRef(false),
    latest = useRef(query);
  latest.current = query;
  useEffect(() => {
    if (query.trim().length < 9) return;
    const timer = setTimeout(() => {
      if (!worker.current) {
        const w = new Worker(
          new URL("../semantic.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = w;
        w.onmessage = (e) => {
          if (e.data.type === "ready") {
            ready.current = true;
            w.postMessage({
              type: "query",
              id: latest.current,
              text: latest.current,
            });
          }
          if (e.data.type === "results")
            setSemantic({ query: e.data.id, scores: e.data.scores });
        };
        w.postMessage({
          type: "init",
          documents: [
            ...buildings.map((b) => ({
              id: b.id,
              text: `${b.shortName}. ${b.name}. ${b.description}`,
            })),
            ...places
              .filter((p) => p.category !== "room")
              .map((p) => ({
                id: p.id,
                text: `${p.name}. ${p.category}. ${p.tags.join(" ")}. ${p.description}`,
              })),
          ],
        });
      } else if (ready.current)
        worker.current.postMessage({ type: "query", id: query, text: query });
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => () => worker.current?.terminate(), []);
  return useMemo(() => {
    if (semantic?.query !== query || query.trim().length < 9) return base;
    const results = [...base];
    for (const p of places.filter((p) => p.category !== "room")) {
      const score = semantic.scores[p.id] || 0;
      if (score > 0.37 && !results.some((r) => r.id === p.id))
        results.push({
          id: p.id,
          name: p.name,
          subtitle: `${categoryNames[p.category]} · ${p.building} · Floor ${p.floor}`,
          category: p.category,
          building: p.building,
          place: p,
          score: score * 25,
        });
    }
    return results
      .map((r) => ({
        ...r,
        score: r.score + (semantic.scores[r.id] || 0) * 18,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [base, semantic, query]);
}
