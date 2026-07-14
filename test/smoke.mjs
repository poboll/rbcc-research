import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4317;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
server.stderr.on("data", chunk => { stderr += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(origin)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${stderr}`);
}

async function expectOk(path, options) {
  const response = await fetch(`${origin}${path}`, options);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}

try {
  await waitForServer();
  const routes = ["/", "/screen", "/screen/roadshow", "/design", "/review", "/review/report?memberId=member-jin&companyId=co-xinyuan-logistics", "/app", "/library", "/agent", "/traces", "/dashboard", "/collab", "/admin"];
  for (const route of routes) {
    const html = await (await expectOk(route)).text();
    if (!html.includes('id="root"') || !html.includes('/assets/')) throw new Error(`${route}: not served by the React source build`);
  }
  const team = await (await expectOk("/api/team-config")).json();
  if (team.group?.id !== "team-8" || team.members?.length !== 5 || team.routes?.length !== 7) throw new Error("team config migration mismatch");
  const admin = await (await expectOk("/api/admin/summary")).json();
  if (admin.counts?.members !== 5 || admin.counts?.assignments !== 48) throw new Error("admin summary contract mismatch");
  const dashboard = await (await expectOk("/api/research-dashboard?memberId=member-jin")).json();
  if (dashboard.members?.length !== 1 || dashboard.members[0].sites?.length !== 10 || dashboard.summary?.siteAssignmentCount !== 48 || dashboard.summary?.uniqueSiteCount !== 22) throw new Error("dashboard member/site contract mismatch");
  const report = await (await expectOk("/api/research-report?memberId=member-jin&companyId=co-xinyuan-logistics&groupModeId=iterate")).json();
  if (!report.sections?.situation || !report.sections?.conception) throw new Error("report block contract mismatch");
  const chat = await (await expectOk("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "总结证据", memberId: "member-jin", companyId: "co-xinyuan-logistics", companyName: "信源物流" }) })).json();
  if (!chat.reply || !["knowledge", "llm"].includes(chat.mode)) throw new Error("agent fallback contract mismatch");
  const docx = await expectOk("/api/research-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId: "member-jin", companyId: "co-xinyuan-logistics", groupModeId: "iterate", useLlm: false, format: "docx" }) });
  if (!(docx.headers.get("content-type") ?? "").includes("wordprocessingml")) throw new Error("docx content type mismatch");
  const bytes = new Uint8Array(await docx.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("docx is not a ZIP package");
  console.log("smoke: 13 pages, admin, team-8 routes, dashboard, report, agent fallback, and DOCX passed");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
