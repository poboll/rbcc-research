import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "../src/server/api.mjs";
import { createStore } from "../src/server/store.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const store = createStore({ root, persistent: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : false });
const api = createApi({ store, root, uploadRoot: "/tmp/rbcc-uploads" });

export default async function handler(req, res) {
  try {
    const incoming = new URL(req.url ?? "/api", `https://${req.headers.host ?? "localhost"}`);
    const rewrittenPath = incoming.searchParams.get("path");
    if (rewrittenPath) {
      incoming.pathname = `/api/${rewrittenPath}`;
      incoming.searchParams.delete("path");
    }
    const response = await api(req, incoming);
    res.statusCode = response.status ?? 200;
    res.setHeader("content-type", response.type);
    res.setHeader("cache-control", "no-store");
    for (const [name, value] of Object.entries(response.headers ?? {})) res.setHeader(name, value);
    res.end(response.body);
  } catch (error) {
    res.statusCode = Number(error?.status) || 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "服务错误" }));
  }
}
