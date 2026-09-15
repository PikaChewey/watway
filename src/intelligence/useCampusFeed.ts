import { createDemoFeed } from "./demo";
import { useEffect, useState, useCallback, useRef } from "react";
import type { CampusFeed } from "./types";
export function useCampusFeed(demoDate?: Date) {
  const demoTimestamp = demoDate?.getTime();
  const [liveEnabled, setLiveEnabledState] = useState(() => {
    try {
      if (demoDate) return false;
      return localStorage.getItem("watway-live-feeds") === "true";
    } catch {
      return false;
    }
  });
  const setLiveEnabled = (enabled: boolean) => {
    try {
      localStorage.setItem("watway-live-feeds", String(enabled));
    } catch {}
    setLiveEnabledState(enabled);
  };
  const [feed, setFeed] = useState<CampusFeed>(() => createDemoFeed(demoDate)),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    if (!liveEnabled) {
      setFeed(createDemoFeed(demoTimestamp === undefined ? undefined : new Date(demoTimestamp)));
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/campus/live", {
        signal: AbortSignal.timeout(27000),
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (id !== requestId.current) return;
      setFeed({ ...data, mode: "live" });
      setError("");
      try {
        localStorage.setItem("watway-public-feed", JSON.stringify(data));
      } catch {}
    } catch {
      if (id !== requestId.current) return;
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
      if (cache && id === requestId.current)
        setFeed({
          ...cache,
          mode: "live",
          facilities: cache.facilities.map((f) => ({ ...f, status: "cached" })),
          sources: cache.sources.map((s) => ({ ...s, status: "cached" })),
        });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [liveEnabled, demoTimestamp]);
  useEffect(() => {
    refresh();
    if (!liveEnabled) return;
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
  }, [refresh, liveEnabled]);
  return { feed, loading, error, refresh, liveEnabled, setLiveEnabled };
}
