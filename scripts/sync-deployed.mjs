import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(root, "public");
const dataRoot = join(root, "data", "deployed");
const origin = (process.env.DEPLOYED_ORIGIN ?? "https://dropaigc.com").replace(/\/$/, "");
const routes = [
  "/", "/screen", "/screen/roadshow", "/design", "/review", "/review/report",
  "/app", "/library", "/agent", "/traces", "/dashboard", "/collab"
];

async function fetchOk(path) {
  const response = await fetch(`${origin}${path}`, { headers: { "user-agent": "rbcc-recovery/2.0" } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function routeFile(route) {
  return route === "/" ? join(publicRoot, "index.html") : join(publicRoot, route.slice(1), "index.html");
}

async function syncFrontend() {
  const assets = new Set(["/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png", "/icons/apple-touch-icon.png"]);
  for (const route of routes) {
    const query = route === "/review/report" ? "?memberId=member-duan&companyId=co-chengzhi" : "";
    const html = await (await fetchOk(`${route}${query}`)).text();
    await write(routeFile(route), html);
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+|\/icons\/[^"?]+|\/favicon\.ico)/g)) {
      assets.add(match[1]);
    }
  }
  for (const asset of assets) {
    const bytes = Buffer.from(await (await fetchOk(asset)).arrayBuffer());
    await write(join(publicRoot, asset.slice(1)), bytes);
  }
  return { routes: routes.length, assets: assets.size };
}

async function json(path) {
  return (await fetchOk(path)).json();
}

async function syncData() {
  await mkdir(dataRoot, { recursive: true });
  const dashboard = await json("/api/research-dashboard");
  const fixed = {
    "research-dashboard.json": dashboard,
    "media.json": await json("/api/media?groupId=team-9"),
    "media-stats.json": await json("/api/media?groupId=team-9&stats=1"),
    "knowledge.json": await json("/api/knowledge"),
    "knowledge-stats.json": await json("/api/knowledge?stats=1"),
    "agent-feed.json": await json("/api/agent/feed?groupId=team-9"),
    "llm-status.json": await json("/api/llm/status")
  };
  for (const [name, value] of Object.entries(fixed)) {
    await write(join(dataRoot, name), `${JSON.stringify(value, null, 2)}\n`);
  }

  const memberReports = {};
  const destinations = {};
  const iterations = {};
  const reviewQuestions = {};
  const reports = {};
  const reportMembers = [...(dashboard.members ?? []), { memberId: "team-9", sites: [] }];
  for (const member of reportMembers) {
    const memberId = member.memberId;
    memberReports[memberId] = await json(`/api/member-long-reports?memberId=${encodeURIComponent(memberId)}`);
    if (memberId !== "team-9") {
      destinations[memberId] = await json(`/api/member-destinations?memberId=${encodeURIComponent(memberId)}`);
      iterations[memberId] = await json(`/api/member-report-iterations?memberId=${encodeURIComponent(memberId)}`);
      reviewQuestions[memberId] = await json(`/api/review/member-questions?memberId=${encodeURIComponent(memberId)}`);
    }
    const reportSites = memberId === "team-9"
      ? (memberReports[memberId].reports ?? []).map(item => ({ companyId: item.companyId, groupModeId: "iterate" }))
      : (member.sites ?? []);
    for (const site of reportSites) {
      const key = `${memberId}::${site.companyId}`;
      const params = new URLSearchParams({ memberId, companyId: site.companyId, groupModeId: site.groupModeId ?? "iterate" });
      try { reports[key] = await json(`/api/research-report?${params}`); }
      catch (error) { reports[key] = { error: error.message }; }
    }
  }
  for (const [name, value] of Object.entries({
    "member-long-reports.json": memberReports,
    "member-destinations.json": destinations,
    "member-report-iterations.json": iterations,
    "review-member-questions.json": reviewQuestions,
    "research-reports.json": reports
  })) {
    await write(join(dataRoot, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  return { members: reportMembers.length, reports: Object.keys(reports).length };
}

const frontend = await syncFrontend();
const data = await syncData();
console.log(JSON.stringify({ origin, frontend, data }, null, 2));
