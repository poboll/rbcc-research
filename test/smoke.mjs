import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4317;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "", RBCC_EPHEMERAL: "1" }, stdio: ["ignore", "pipe", "pipe"] });
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
  const routes = ["/", "/screen", "/screen/roadshow", "/design", "/review", "/review/report?memberId=member-jin&companyId=co-xinyuan-logistics", "/app", "/library", "/knowledge", "/install", "/agent", "/traces", "/dashboard", "/collab", "/admin"];
  for (const route of routes) {
    const html = await (await expectOk(route)).text();
    if (!html.includes('id="root"') || !html.includes('/assets/')) throw new Error(`${route}: not served by the React source build`);
  }
  const team = await (await expectOk("/api/team-config")).json();
  if (team.group?.id !== "team-8" || team.members?.length !== 5 || team.routes?.length !== 7) throw new Error("team config migration mismatch");
  const admin = await (await expectOk("/api/admin/summary")).json();
  if (admin.counts?.members !== 5 || admin.counts?.assignments !== 48) throw new Error("admin summary contract mismatch");
  const knowledgeForm = new FormData();
  knowledgeForm.set("groupId", "team-8");
  knowledgeForm.set("title", "冒烟测试知识");
  knowledgeForm.set("tags", "测试,信源物流");
  knowledgeForm.set("file", new Blob(["信源物流现场调研应关注生产线、研发制造交流、流程异常和一线人员的真实证据。该资料仅用于自动化冒烟测试。"], { type: "text/plain" }), "smoke-knowledge.txt");
  const mounted = await (await expectOk("/api/knowledge/upload", { method: "POST", body: knowledgeForm })).json();
  if (!mounted.source?.id || mounted.chunkCount < 1) throw new Error("knowledge mounting contract mismatch");
  const search = await (await expectOk(`/api/knowledge/search?q=${encodeURIComponent("生产线 流程异常")}`)).json();
  if (!search.results?.some(item => item.sourceId === mounted.source.id)) throw new Error("knowledge search contract mismatch");
  await expectOk(`/api/knowledge/sources?id=${encodeURIComponent(mounted.source.id)}`, { method: "DELETE" });
  const dashboard = await (await expectOk("/api/research-dashboard?memberId=member-jin")).json();
  if (dashboard.members?.length !== 1 || dashboard.members[0].sites?.length !== 10 || dashboard.summary?.siteAssignmentCount !== 48 || dashboard.summary?.uniqueSiteCount !== 22) throw new Error("dashboard member/site contract mismatch");
  const generatedQuestions = Array.from({ length: 18 }, (_, index) => ({ text: `冒烟问题 ${index + 1}`, lens: "pending", tags: ["验证"] }));
  await expectOk("/api/research-questions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId: "member-jin", companyId: "co-xinyuan-logistics", questions: generatedQuestions }) });
  const persistedQuestions = await (await expectOk("/api/research-questions?memberId=member-jin&companyId=co-xinyuan-logistics")).json();
  if (persistedQuestions.questions?.length !== 18) throw new Error("research question persistence mismatch");
  const report = await (await expectOk("/api/research-report?memberId=member-jin&companyId=co-xinyuan-logistics&groupModeId=iterate")).json();
  if (!report.sections?.situation || !report.sections?.conception) throw new Error("report block contract mismatch");
  const evidenceForm=new FormData();evidenceForm.set("groupId","team-8");evidenceForm.set("memberId","member-jin");evidenceForm.set("memberName","金俊烯");evidenceForm.set("companyId","co-xinyuan-logistics");evidenceForm.set("companyName","信源物流");evidenceForm.set("type","text");evidenceForm.set("evidenceKind","observation");evidenceForm.set("textContent","分拣异常发生后需要人工跨三个表格重复登记，现场记录一次处理约十二分钟。");
  const evidence=await(await expectOk("/api/media/upload",{method:"POST",body:evidenceForm})).json();if(!evidence.id||evidence.synthesisStatus!=="pending")throw new Error("evidence upload contract mismatch");
  const observations=await(await expectOk("/api/evidence/synthesize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"observations",memberId:"member-jin",memberName:"金俊烯",companyId:"co-xinyuan-logistics",companyName:"信源物流"})})).json();if(!observations.observations?.length||observations.observations[0].sourceId!==evidence.id)throw new Error("observation synthesis contract mismatch");
  const problem=await(await expectOk("/api/evidence/synthesize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"problem",memberId:"member-jin",memberName:"金俊烯",companyId:"co-xinyuan-logistics",companyName:"信源物流",observations:observations.observations})})).json();await expectOk(`/api/problems/${problem.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({validationOutcome:"confirmed"})});
  const solution=await(await expectOk("/api/evidence/synthesize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"solution",memberId:"member-jin",memberName:"金俊烯",companyId:"co-xinyuan-logistics",companyName:"信源物流"})})).json();if(!solution.linkedProblemIds?.includes(problem.id))throw new Error("solution linkage contract mismatch");
  const applied=await(await expectOk("/api/evidence/synthesize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"report",memberId:"member-jin",memberName:"金俊烯",companyId:"co-xinyuan-logistics",companyName:"信源物流"})})).json();if(applied.addedRefs<3||!applied.draft.sections?.painPoints?.evidence?.some(item=>item.includes(problem.id)))throw new Error("report evidence application mismatch");
  const enriched=await(await expectOk("/api/research-dashboard?memberId=member-jin")).json();const enrichedSite=enriched.members[0].sites.find(item=>item.companyId==="co-xinyuan-logistics");if(enrichedSite.evidenceCount!==1||enrichedSite.confirmedProblemCount!==1||enrichedSite.solutionCount!==1)throw new Error("dynamic dashboard counts mismatch");
  const chat = await (await expectOk("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "总结证据", memberId: "member-jin", companyId: "co-xinyuan-logistics", companyName: "信源物流" }) })).json();
  if (!chat.reply || !["knowledge", "llm"].includes(chat.mode)) throw new Error("agent fallback contract mismatch");
  const docx = await expectOk("/api/research-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId: "member-jin", companyId: "co-xinyuan-logistics", groupModeId: "iterate", useLlm: false, format: "docx" }) });
  if (!(docx.headers.get("content-type") ?? "").includes("wordprocessingml")) throw new Error("docx content type mismatch");
  const bytes = new Uint8Array(await docx.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("docx is not a ZIP package");
  console.log("smoke: 15 pages, knowledge, evidence chain, dynamic topology, report versions, Agent, and DOCX passed");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
