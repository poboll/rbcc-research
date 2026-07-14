import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./src/server/api.mjs";
import { createStore } from "./src/server/store.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publicRoot = join(root, "public");
const webRoot = join(root, "web-dist");
const uploadRoot = join(root, "data", "uploads");
const store = createStore({ root });
const api = createApi({ store, root });
const mime = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json; charset=utf-8", ".woff2": "font/woff2"
};

async function fromRoot(base, relative) {
  const candidate = normalize(join(base, relative));
  if (!candidate.startsWith(base)) return null;
  let target = candidate;
  try { if ((await stat(target)).isDirectory()) target = join(target, "index.html"); } catch {}
  try {
    await access(target);
    return { body: await readFile(target), type: mime[extname(target)] ?? "application/octet-stream" };
  } catch { return null; }
}

async function staticResponse(pathname) {
  const isUpload = pathname.startsWith("/uploads/");
  if (isUpload) return fromRoot(uploadRoot, pathname.replace(/^\/uploads\/+/, ""));
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const webExact = await fromRoot(webRoot, relative);
  if (webExact) return webExact;
  if (!extname(relative)) return fromRoot(webRoot, "index.html");
  const referenceAsset = await fromRoot(publicRoot, relative);
  if (referenceAsset) return referenceAsset;
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    const response = url.pathname.startsWith("/api/") ? await api(req, url) : await staticResponse(url.pathname);
    if (!response) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const cacheControl = url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(response.status ?? 200, { "content-type": response.type, "cache-control": cacheControl, ...(response.headers ?? {}) });
    res.end(response.body);
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "服务错误" }));
  }
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => console.log(`RBCC recovered site: http://127.0.0.1:${port}`));
