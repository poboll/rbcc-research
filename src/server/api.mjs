import Busboy from "busboy";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createReportDocx } from "./docx.mjs";
import { complete, extractJson, llmStatus } from "./llm.mjs";
import { baseReport, generateLongReport, normalizeSections } from "./reports.mjs";
import { keyFor } from "./store.mjs";

const json = (body, status = 200, headers = {}) => ({ status, body: JSON.stringify(body), type: "application/json; charset=utf-8", headers });
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw Object.assign(new Error("请求内容过大"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON 格式无效"), { status: 400 }); }
}

function record(value, prefix) {
  const now = new Date().toISOString();
  return { ...value, id: value.id ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: value.createdAt ?? now, updatedAt: now };
}

function safeName(value) {
  return String(value ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

function parseMultipart(req, uploadRoot) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file;
    let total = 0;
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 30 } });
    busboy.on("field", (name, value) => { fields[name] = value.slice(0, 100_000); });
    busboy.on("file", (name, stream, info) => {
      const extension = extname(info.filename || "") || ({ "image/jpeg": ".jpg", "image/png": ".png", "audio/mpeg": ".mp3", "audio/mp4": ".m4a" }[info.mimeType] ?? ".bin");
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeName(extension)}`;
      const chunks = [];
      stream.on("data", chunk => { total += chunk.length; chunks.push(chunk); });
      stream.on("limit", () => reject(Object.assign(new Error("上传文件超过 25MB"), { status: 413 })));
      stream.on("end", () => { file = { field: name, originalName: info.filename, mimeType: info.mimeType, storedName, buffer: Buffer.concat(chunks) }; });
    });
    busboy.on("error", reject);
    busboy.on("finish", async () => {
      try {
        if (file) {
          await mkdir(uploadRoot, { recursive: true });
          await writeFile(join(uploadRoot, file.storedName), file.buffer);
        }
        resolve({ fields, file: file ? { ...file, buffer: undefined, size: total } : undefined });
      } catch (error) { reject(error); }
    });
    req.pipe(busboy);
  });
}

function filterSiteItems(items, params) {
  return items.filter(item => (!params.get("groupId") || item.groupId === params.get("groupId")) && (!params.get("memberId") || item.memberId === params.get("memberId")) && (!params.get("companyId") || item.companyId === params.get("companyId")) && (!params.get("type") || item.type === params.get("type")));
}

function relevantKnowledge(state, companyId, limit = 8) {
  const globalTags = new Set(["workflow", "team", "route", "method", "rbcc"]);
  const scoped = state.knowledgeDocs.filter(item => !companyId || item.tags?.includes(companyId) || item.content?.includes(companyId) || item.title?.includes(companyId));
  const global = state.knowledgeDocs.filter(item => item.tags?.some(tag => globalTags.has(String(tag).toLowerCase())) || /RBCC|四步流程|开拓组|迭代组/.test(`${item.title} ${item.content}`));
  const seen = new Set();
  return [...global, ...scoped].filter(item => item?.id && !seen.has(item.id) && seen.add(item.id)).slice(0, limit);
}

function evidenceContext(state, memberId, companyId) {
  return {
    questions: state.researchQuestions[keyFor(memberId, companyId)] ?? [],
    media: state.media.filter(item => (!memberId || item.memberId === memberId) && (!companyId || item.companyId === companyId)).slice(0, 30),
    problems: state.problems.filter(item => (!memberId || item.memberId === memberId) && (!companyId || item.companyId === companyId)).slice(0, 24),
    solutions: state.solutions.filter(item => (!memberId || item.memberId === memberId) && (!companyId || item.companyId === companyId)).slice(0, 16),
    knowledge: relevantKnowledge(state, companyId)
  };
}

function fallbackAgent(context, companyName) {
  const confirmed = context.problems.filter(item => item.validationOutcome === "confirmed").slice(0, 3);
  const quotes = context.media.map(item => item.textContent || item.caption).filter(Boolean).slice(0, 2);
  const lines = [`当前聚焦：${companyName || "小组调研"}。`];
  if (confirmed.length) lines.push(`已验证痛点：${confirmed.map(item => item.title || item.problemStatement).join("；")}。`);
  if (quotes.length) lines.push(`可引用的一手材料：${quotes.join("；")}。`);
  lines.push("建议下一步把结论写成“现场事实 → 影响对象 → 造成后果 → 可验证对策”，并给每项对策挂上问题记录 ID。");
  return lines.join("\n\n");
}

function suggestedQuestions(companyName = "该站点") {
  const themes = ["现有流程中最依赖个人经验的环节是什么？", "哪类异常最常发生，真实代价如何量化？", "一线人员最抗拒新增哪一步操作？", "已有系统和纸质兜底之间在哪里断裂？", "谁拥有最终判断权，错误由谁承担？", "最小可行试点应观察哪三个指标？"];
  return themes.map((text, index) => ({ id: `suggest-${Date.now()}-${index}`, text: `${companyName}：${text}`, tags: [index < 2 ? "现状" : index < 4 ? "痛点" : "对策"], lens: "pending" }));
}

function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") throw Object.assign(new Error("管理端尚未配置 ADMIN_TOKEN"), { status: 503 });
    return;
  }
  if (req.headers["x-admin-token"] !== expected) throw Object.assign(new Error("管理员凭证无效"), { status: 401 });
}

export function createApi({ store, root, uploadRoot = join(root, "data", "uploads") }) {

  return async function api(req, url) {
    const state = await store.get();
    const { pathname, searchParams } = url;

    if (req.method === "GET" && pathname === "/api/team-config") return json(state.teamConfig ?? null);
    if (req.method === "GET" && pathname === "/api/llm/status") return json(llmStatus());

    if (pathname === "/api/admin/summary" && req.method === "GET") {
      requireAdmin(req);
      return json({
        teamConfig: state.teamConfig,
        dashboard: state.dashboard,
        counts: { members: state.dashboard.members?.length ?? 0, assignments: state.dashboard.summary?.siteAssignmentCount ?? 0, uniqueSites: state.dashboard.summary?.uniqueSiteCount ?? 0, evidence: state.media.length, problems: state.problems.length, solutions: state.solutions.length, tasks: state.collab.tasks?.length ?? 0, knowledge: state.knowledgeDocs.length, finalReports: Object.keys(state.finalReports ?? {}).length },
        finalReports: Object.values(state.finalReports ?? {}),
        tasks: state.collab.tasks ?? [],
        recentEvidence: state.media.slice(0, 50),
        updatedAt: state.updatedAt
      });
    }
    if (pathname === "/api/admin/export" && req.method === "GET") {
      requireAdmin(req);
      return json(state, 200, { "content-disposition": `attachment; filename="rbcc-team8-${new Date().toISOString().slice(0, 10)}.json"` });
    }
    if (pathname === "/api/admin/report-upload" && req.method === "POST") {
      requireAdmin(req);
      const { fields, file } = await parseMultipart(req, uploadRoot);
      if (!fields.memberId || !fields.companyId || !file) return json({ error: "缺少成员、站点或 DOCX 文件" }, 400);
      if (file.mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !file.originalName?.toLowerCase().endsWith(".docx")) return json({ error: "只允许上传 DOCX 定稿" }, 415);
      const member = state.dashboard.members?.find(item => item.memberId === fields.memberId);
      const site = member?.sites?.find(item => item.companyId === fields.companyId);
      if (!member || !site) return json({ error: "成员与站点不匹配" }, 400);
      const finalReport = record({ groupId: state.dashboard.groupId, memberId: member.memberId, memberName: member.memberName, companyId: site.companyId, companyName: site.companyName, originalName: file.originalName, storedName: file.storedName, mimeType: file.mimeType, fileSize: file.size, published: fields.published !== "false", uploadedBy: fields.uploadedBy || "管理员" }, "final-report");
      await store.update(value => { value.finalReports ??= {}; value.finalReports[keyFor(member.memberId, site.companyId)] = finalReport; });
      return json(finalReport, 201);
    }

    if (req.method === "GET" && pathname === "/api/collab") return json(state.collab);
    if (req.method === "POST" && pathname === "/api/collab/updates") {
      const item = record(await body(req), "update");
      await store.update(value => value.collab.updates.unshift(item));
      return json(item, 201);
    }
    if (req.method === "PATCH" && pathname.startsWith("/api/collab/tasks/")) {
      const id = pathname.split("/").pop();
      const patch = await body(req);
      let found;
      await store.update(value => { found = value.collab.tasks.find(item => item.id === id); if (found) Object.assign(found, patch, { updatedAt: new Date().toISOString() }); });
      return found ? json(found) : json({ error: "任务不存在" }, 404);
    }
    if (req.method === "PATCH" && pathname.startsWith("/api/collab/updates/")) {
      const id = pathname.split("/").pop();
      const patch = await body(req);
      let found;
      await store.update(value => { found = value.collab.updates.find(item => item.id === id); if (found) Object.assign(found, patch, { updatedAt: new Date().toISOString() }); });
      return found ? json(found) : json({ error: "动态不存在" }, 404);
    }

    if (pathname === "/api/problems") {
      if (req.method === "GET") {
        const items = filterSiteItems(state.problems, searchParams);
        if (searchParams.get("stats") === "1") return json({ total: items.length, high: items.filter(item => item.severity === "high").length, readyForDraw: items.filter(item => item.validationOutcome && item.validationOutcome !== "pending").length, byCompany: Object.groupBy ? Object.groupBy(items, item => item.companyId ?? "unknown") : {} });
        return json({ problems: items });
      }
      if (req.method === "POST") {
        const item = record(await body(req), "problem");
        await store.update(value => value.problems.unshift(item));
        return json(item, 201);
      }
    }
    if (pathname === "/api/solutions") {
      if (req.method === "GET") return json({ solutions: filterSiteItems(state.solutions, searchParams) });
      if (req.method === "POST") {
        const item = record(await body(req), "solution");
        await store.update(value => value.solutions.unshift(item));
        return json(item, 201);
      }
    }

    if (pathname === "/api/media" && req.method === "GET") {
      const items = filterSiteItems(state.media, searchParams);
      if (searchParams.get("stats") === "1") return json({ total: items.length, images: items.filter(item => item.type === "image").length, audio: items.filter(item => item.type === "audio").length, text: items.filter(item => item.type === "text").length, cloudSynced: items.filter(item => item.cloudSynced).length });
      return json({ items: items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
    if (pathname === "/api/media/upload" && req.method === "POST") {
      const { fields, file } = await parseMultipart(req, uploadRoot);
      const item = record({ ...fields, durationSec: fields.durationSec ? Number(fields.durationSec) : undefined, fileName: file?.originalName, mimeType: file?.mimeType, fileSize: file?.size, url: file ? `/uploads/${file.storedName}` : undefined, cloudSynced: true }, "media");
      await store.update(value => {
        value.media.unshift(item);
        value.agentFeed.unshift(record({ groupId: item.groupId, memberId: item.memberId, memberName: item.memberName, companyName: item.companyName, mediaId: item.id, mediaType: item.type, kind: "media_upload", message: `${item.memberName || "队员"}在${item.companyName || "调研现场"}上传了${item.type === "image" ? "一张图片" : item.type === "audio" ? "一段录音" : "一条文字留痕"}` }, "feed"));
      });
      return json(item, 201);
    }

    if (pathname === "/api/knowledge") {
      if (req.method === "GET") {
        if (searchParams.get("stats") === "1") return json({ totalChunks: state.knowledgeDocs.length + 128, customDocs: state.knowledgeDocs.length, byCategory: { workflow: 2, team: 1, route: 9, institution: 33, theme: 83, custom: state.knowledgeDocs.length } });
        return json({ docs: state.knowledgeDocs });
      }
      if (req.method === "POST") {
        const item = record(await body(req), "knowledge");
        await store.update(value => value.knowledgeDocs.unshift(item));
        return json(item, 201);
      }
      if (req.method === "DELETE") {
        const id = searchParams.get("id");
        await store.update(value => { value.knowledgeDocs = value.knowledgeDocs.filter(item => item.id !== id); });
        return json({ ok: true });
      }
    }

    if (pathname === "/api/agent/feed" && req.method === "GET") {
      const since = searchParams.get("since");
      const items = state.agentFeed.filter(item => (!searchParams.get("groupId") || item.groupId === searchParams.get("groupId")) && (!since || item.createdAt > since));
      return json({ items });
    }
    if (pathname === "/api/agent/chat" && req.method === "POST") {
      const input = await body(req);
      const context = evidenceContext(state, input.memberId, input.companyId);
      const citations = context.knowledge.slice(0, 3).map(item => ({ id: item.id, title: item.title }));
      let reply;
      let mode = "knowledge";
      try {
        reply = await complete([
          { role: "system", content: `你是 RBCC ${state.teamConfig?.group?.name ?? "调研组"}协同 Agent 红小八。回答必须基于提供的调研材料，优先指出一手证据、已验证结论、证据缺口和下一步动作。禁止捏造访谈、数字、企业事实或引用。用简洁中文回答。` },
          ...(input.history ?? []).slice(-8),
          { role: "user", content: `问题：${input.message}\n当前站点：${input.companyName ?? input.companyId ?? "全组"}\n材料：${JSON.stringify(context).slice(0, 45_000)}` }
        ], { maxTokens: 1800 });
        if (reply) mode = "llm";
      } catch { reply = null; }
      reply ||= fallbackAgent(context, input.companyName);
      return json({ reply, mode, citations, suggestedQuestions: ["哪些结论已有一手证据？", "目前最大的证据缺口是什么？", "帮我把痛点收敛成 POV", "如何设计最小可行试点？"] });
    }

    if (pathname === "/api/member-destinations") {
      const memberId = searchParams.get("memberId");
      if (req.method === "GET") return json(state.destinations[memberId] ?? { memberId, companyIds: [], routeConfirmed: false });
      if (req.method === "PUT") {
        const input = await body(req);
        const value = { memberId: input.memberId, companyIds: input.companyIds ?? [], routeConfirmed: true, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await store.update(stateValue => { stateValue.destinations[input.memberId] = value; });
        return json(value);
      }
    }

    if (pathname === "/api/research-questions") {
      if (req.method === "GET") {
        const memberId = searchParams.get("memberId"), companyId = searchParams.get("companyId");
        if (!memberId || !companyId) return json({ error: "缺少 companyId 或 memberId" }, 400);
        return json({ questions: state.researchQuestions[keyFor(memberId, companyId)] ?? [] });
      }
      if (req.method === "PUT") {
        const input = await body(req);
        if (!input.memberId || !input.companyId) return json({ error: "缺少 companyId 或 memberId" }, 400);
        const questions = (input.questions ?? []).map((item, index) => ({ ...item, id: item.id ?? `q-${Date.now()}-${index}`, lens: item.lens ?? "pending" }));
        await store.update(value => { value.researchQuestions[keyFor(input.memberId, input.companyId)] = questions; });
        return json({ questions, updatedAt: new Date().toISOString() });
      }
    }

    if (pathname === "/api/research-dashboard" && req.method === "GET") {
      const memberId = searchParams.get("memberId");
      const dashboard = structuredClone(state.dashboard);
      for (const member of dashboard.members ?? []) for (const site of member.sites ?? []) site.questions = state.researchQuestions[keyFor(member.memberId, site.companyId)] ?? site.questions ?? [];
      if (memberId) dashboard.members = dashboard.members?.filter(item => item.memberId === memberId) ?? [];
      dashboard.updatedAt = state.updatedAt;
      return json(dashboard);
    }

    if (pathname === "/api/research-report" && req.method === "GET") {
      const memberId = searchParams.get("memberId"), companyId = searchParams.get("companyId"), groupModeId = searchParams.get("groupModeId");
      if (!memberId || !companyId || !groupModeId) return json({ error: "缺少 memberId、companyId 或 groupModeId" }, 400);
      return json(baseReport(state, memberId, companyId, groupModeId));
    }
    if (pathname === "/api/research-report/draft" && req.method === "PUT") {
      const input = await body(req);
      const draft = { memberId: input.memberId, companyId: input.companyId, groupModeId: input.groupModeId, sections: normalizeSections(input.sections), updatedAt: new Date().toISOString() };
      await store.update(value => { value.reportDrafts[keyFor(input.memberId, input.companyId)] = draft; });
      return json({ draft });
    }
    if (pathname === "/api/research-report/chat" && req.method === "POST") {
      const input = await body(req);
      const context = evidenceContext(state, input.memberId, input.companyId);
      let reply;
      try {
        reply = await complete([{ role: "system", content: "你是 RBCC 报告协作者。只基于材料改进报告内容，给出可直接采纳的中文段落，不要编造。" }, ...(input.history ?? []).slice(-10), { role: "user", content: `${input.message}\n报告元数据：${JSON.stringify(input.meta ?? {})}\n现有报告：${JSON.stringify(input.draftSections ?? input.autoSections ?? {}).slice(0, 30_000)}\n证据：${JSON.stringify(context).slice(0, 35_000)}` }], { maxTokens: 2200 });
      } catch { reply = null; }
      return json({ reply: reply ?? "（离线模式）请先从现有材料中选出一条现场事实、一句原声和一个已验证痛点，再把三者连接成完整论证。当前服务未配置可用的 DeepSeek 密钥。", mode: reply ? "llm" : "fallback", suggestedQuestions: ["强化现状扫描的证据密度", "把共情板块写得更具体", "收敛一个核心痛点", "检查方案是否挂钩问题 ID"] });
    }
    if (pathname === "/api/research-report/suggest" && req.method === "POST") {
      const input = await body(req);
      const key = keyFor(input.memberId, input.companyId);
      if (input.action === "applyQuestions") {
        const existing = state.researchQuestions[key] ?? [];
        const additions = (input.questions ?? []).filter(question => !existing.some(item => item.text === question.text)).map((question, index) => ({ ...question, id: question.id ?? `q-${Date.now()}-${index}`, lens: question.lens ?? "pending" }));
        await store.update(value => { value.researchQuestions[key] = [...existing, ...additions]; });
        return json({ added: additions.length, questions: [...existing, ...additions] });
      }
      const site = state.dashboard.members?.flatMap(member => member.sites ?? []).find(item => item.companyId === input.companyId);
      let questions = suggestedQuestions(site?.companyName).flatMap((item, index) => [item, { ...item, id: `${item.id}-b`, text: `${item.text.replace(/[？?]$/, "")}的可观察证据是什么？`, tags: [index < 2 ? "证据" : "验证"] }, { ...item, id: `${item.id}-c`, text: `${item.text.replace(/[？?]$/, "")}若不解决会造成什么后果？`, tags: ["影响"] }]).slice(0, 18);
      let project = { title: `${site?.companyName ?? "站点"}证据闭环试点`, summary: "选择一个高频、高代价且可观察的痛点，以两周为周期记录基线、试点过程和结果，保留人工最终判断权。", linkedProblemIds: state.problems.filter(item => item.companyId === input.companyId).slice(0, 3).map(item => item.id), metrics: ["处理时长", "误报/返工率", "一线采用率"] };
      let mode = "knowledge";
      try {
        const response = await complete([{ role: "system", content: "根据调研材料输出 JSON：questions 为 18 个含 text,tags 的可验证问题；project 含 title,summary,linkedProblemIds,metrics。不得编造事实。" }, { role: "user", content: JSON.stringify(evidenceContext(state, input.memberId, input.companyId)).slice(0, 50_000) }], { maxTokens: 2600 });
        const parsed = extractJson(response);
        if (parsed?.questions?.length) { questions = parsed.questions; project = parsed.project ?? project; mode = "llm"; }
      } catch {}
      return json({ questions, questionCount: questions.length, project, mode });
    }
    if (pathname === "/api/research-report" && req.method === "POST") {
      const input = await body(req);
      if (!input.memberId || !input.companyId || !input.groupModeId) return json({ error: "缺少报告定位参数" }, 400);
      const report = input.useLlm === false ? baseReport(state, input.memberId, input.companyId, input.groupModeId) : await generateLongReport(state, input.memberId, input.companyId, input.groupModeId);
      await store.update(value => { value.generatedReports[keyFor(input.memberId, input.companyId)] = report; });
      if (input.format === "docx") {
        const document = await createReportDocx(report);
        const filename = `${report.meta.memberName || "RBCC"}-${report.meta.companyName || "调研"}-调研报告.docx`;
        return { status: 200, body: document, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } };
      }
      return json(report);
    }

    if (pathname === "/api/member-long-reports" && req.method === "GET") {
      const memberId = searchParams.get("memberId");
      const value = structuredClone(state.memberLongReports[memberId] ?? { memberId, reports: [], available: false, targetChars: 10000, template: "rbcc" });
      value.reports = (value.reports ?? []).map(report => { const key = keyFor(memberId, report.companyId); const generated = state.generatedReports[key] ?? state.researchReports[key]; const finalReport = state.finalReports?.[key]; return generated || finalReport ? { ...report, available: true, source: finalReport ? "admin" : "generated", finalReport, charCount: generated ? JSON.stringify(generated.sections ?? {}).length : 0 } : report; });
      value.available = value.reports.some(report => report.available);
      return json(value);
    }
    if (pathname === "/api/member-long-reports/download" && req.method === "GET") {
      const memberId = searchParams.get("memberId"), companyId = searchParams.get("companyId");
      const finalReport = state.finalReports?.[keyFor(memberId, companyId)];
      if (finalReport?.storedName) {
        const document = await readFile(join(uploadRoot, safeName(finalReport.storedName)));
        return { status: 200, body: document, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(finalReport.originalName || "RBCC-管理员定稿.docx")}` } };
      }
      const report = baseReport(state, memberId, companyId, "iterate");
      const document = await createReportDocx(report);
      const filename = `${report.meta.memberName || "RBCC"}-${report.meta.companyName || "调研"}-调研报告.docx`;
      return { status: 200, body: document, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } };
    }
    if (pathname === "/api/member-report-iterations" && req.method === "GET") return json(state.iterations[searchParams.get("memberId")] ?? { memberId: searchParams.get("memberId"), versions: [] });
    if (pathname === "/api/review/member-questions" && req.method === "GET") return json(state.reviewQuestions[searchParams.get("memberId")] ?? { sites: [] });

    if (req.method === "GET" && pathname === "/api/group-progress") return json(await readSeed(store, "group-progress.json", { groups: [] }));
    if (req.method === "GET" && pathname === "/api/team9-report-summary") {
      if (state.teamConfig?.group?.id === "team-8") return json({
        groupId: "team-8",
        sites: state.dashboard.members.flatMap(member => member.sites.map(site => ({ memberId: member.memberId, memberName: member.memberName, companyId: site.companyId, companyName: site.companyName, percent: state.generatedReports[keyFor(member.memberId, site.companyId)] ? 100 : 0 }))),
        summary: { avgPercent: 0, readyCount: Object.keys(state.generatedReports).length, totalSites: state.dashboard.summary.siteAssignmentCount }
      });
      return json(await readSeed(store, "team9-report-summary.json", { sites: [], summary: {} }));
    }
    if (req.method === "GET" && pathname === "/api/member-journey-map") return json(await readSeed(store, "member-journey-map.json", { members: [], summary: {} }));

    return json({ error: "未归档的 API 路由", path: pathname }, 404);
  };
}

async function readSeed(store, name, fallback) {
  const { readFile } = await import("node:fs/promises");
  try { return JSON.parse(await readFile(join(store.dataRoot, name), "utf8")); }
  catch { return fallback; }
}
