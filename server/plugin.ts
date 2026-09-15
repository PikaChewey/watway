import type { Plugin } from "vite";
import { campusFeed, importPublicEvent } from "./feeds";
export function campusApi(): Plugin {
  const mount = (server: any) => {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (!url.pathname.startsWith("/api/campus/")) return next();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      try {
        if (req.method === "GET" && url.pathname === "/api/campus/live") {
          res.end(JSON.stringify(await campusFeed()));
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/campus/event") {
          res.end(
            JSON.stringify(
              await importPublicEvent(url.searchParams.get("url") || ""),
            ),
          );
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
      } catch (e) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: e instanceof Error ? e.message : "Source unavailable",
          }),
        );
      }
    });
  };
  return {
    name: "watway-campus-api",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
