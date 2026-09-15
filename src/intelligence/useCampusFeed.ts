import { useEffect, useState, useCallback } from "react";
import type { CampusFeed } from "./types";
export function useCampusFeed() {
  const [feed, setFeed] = useState<CampusFeed>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/campus/live", {
        signal: AbortSignal.timeout(27000),
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      setFeed(data);
      setError("");
      try {
        localStorage.setItem("watway-public-feed", JSON.stringify(data));
      } catch {}
    } catch {
      setError("Showing the last available campus update.");
      let cache: CampusFeed | undefined;
      try {
        cache = JSON.parse(
          localStorage.getItem("watway-public-feed") || "null",
        );
      } catch {}
      if (!cache) {
        try {
          const r = await fetch("/data/campus-feed.json");
          if (r.ok) cache = await r.json();
        } catch {}
      }
      if (cache)
        setFeed({
          ...cache,
          facilities: cache.facilities.map((f) => ({ ...f, status: "cached" })),
          sources: cache.sources.map((s) => ({ ...s, status: "cached" })),
        });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 120000);
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  return { feed, loading, error, refresh };
}
