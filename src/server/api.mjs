import Busboy from "busboy";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createReportDocx } from "./docx.mjs";
import { complete, extractJson, llmStatus } from "./llm.mjs";
import { baseReport, generateLongReport, normalizeSections } from "./reports.mjs";
import { keyFor } from "./store.mjs";

const dropRouteReference = JSON.parse(await readFile(new URL("../../data/reference/drop-matching-routes.json", import.meta.url), "utf8"));

const json = (body, status = 200, headers = {}) => ({ status, body: JSON.stringify(body), type: "application/json; charset=utf-8", headers });
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MEDIA_TYPES = new Set(["image/jpeg","image/png","image/webp","audio/mpeg","audio/mp4","audio/x-m4a","audio/wav"]);

function validFileSignature(file) {
  if (!file?.buffer?.length) return true;
  const b=file.buffer;
  if(file.mimeType==="image/jpeg")return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if(file.mimeType==="image/png")return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(file.mimeType==="image/webp")return b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP";
  if(file.mimeType==="audio/mpeg")return b.subarray(0,3).toString()==="ID3"||(b[0]===0xff&&(b[1]&0xe0)===0xe0);
  if(["audio/mp4","audio/x-m4a"].includes(file.mimeType))return b.subarray(4,8).toString()==="ftyp";
  if(file.mimeType==="audio/wav")return b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WAVE";
  return false;
}

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

export function normalizeUploadFileName(value) {
  const original = String(value || "file");
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  const cjkCount = text => (text.match(/[\u3400-\u9fff]/g) || []).length;
  const recovered = !decoded.includes("\ufffd") && cjkCount(decoded) > cjkCount(original) ? decoded : original;
  return recovered.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim().slice(-180) || "file";
}

function objectKey(fields, file, category = "evidence") {
  const now = new Date();
  const extension = extname(file.originalName || file.storedName) || ".bin";
  const suffix = file.storedName.replace(/\.[^.]+$/, "");
  return `groups/${safeName(fields.groupId || "team-8")}/members/${safeName(fields.memberId)}/sites/${safeName(fields.companyId)}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${category}-${suffix}${extension}`;
}

async function persistBlob(fields, file, category) {
  if (!file || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await putBlob(objectKey(fields, file, category), file.buffer, { access: "private", contentType: file.mimeType, addRandomSuffix: false });
    return { pathname: result.pathname, url: result.url };
  } catch (error) {
    // A persistent self-hosted instance has already written the upload locally.
    // Keep field work available if the optional Blob mirror is suspended.
    if (!process.env.VERCEL) return null;
    throw error;
  }
}

async function extractDocument(file) {
  const extension = extname(file.originalName || "").toLowerCase();
  if ([".txt", ".md", ".markdown", ".csv"].includes(extension)) return file.buffer.toString("utf8");
  if (extension === ".json") return JSON.stringify(JSON.parse(file.buffer.toString("utf8")), null, 2);
  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  }
  if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: file.buffer });
    try { return (await parser.getText()).text; }
    finally { await parser.destroy(); }
  }
  throw Object.assign(new Error("仅支持 PDF、DOCX、Markdown、TXT、CSV 和 JSON"), { status: 415 });
}

function chunkDocument(text, size = 1200, overlap = 180) {
  const normalized = String(text ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  let offset = 0;
  while (offset < normalized.length) {
    let end = Math.min(normalized.length, offset + size);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf("。", end));
      if (boundary > offset + size * 0.55) end = boundary + 1;
    }
    chunks.push({ position: chunks.length, content: normalized.slice(offset, end).trim() });
    if (end >= normalized.length) break;
    offset = Math.max(offset + 1, end - overlap);
  }
  return chunks.filter(item => item.content);
}

function searchKnowledge(state, query, limit = 20) {
  const terms = String(query ?? "").toLowerCase().split(/[\s，、,。；;：:]+/).filter(term => term.length > 1);
  if (!terms.length) return [];
  const indexedSourceIds = new Set((state.knowledgeChunks ?? []).map(chunk => chunk.sourceId).filter(Boolean));
  const entries = [
    ...(state.knowledgeChunks ?? []).map(chunk => ({ ...chunk, sourceKind:"mounted" })),
    ...state.knowledgeDocs.filter(doc => !doc.sourceId || !indexedSourceIds.has(doc.sourceId)).map(doc => ({ ...doc, position:0, sourceKind:"custom" }))
  ];
  return entries.map(entry => {
    const haystack = `${entry.title ?? ""} ${entry.content ?? ""} ${(entry.tags ?? []).join(" ")}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 + haystack.split(term).length - 2 : 0), 0);
    return { ...entry, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.position - b.position).slice(0, limit);
}

function parseMultipart(req, uploadRoot) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file;
    let total = 0;
    const busboy = Busboy({ headers: req.headers, defParamCharset: "utf8", limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 30 } });
    busboy.on("field", (name, value) => { fields[name] = value.slice(0, 100_000); });
    busboy.on("file", (name, stream, info) => {
      const originalName = normalizeUploadFileName(info.filename);
      const extension = extname(originalName) || ({ "image/jpeg": ".jpg", "image/png": ".png", "audio/mpeg": ".mp3", "audio/mp4": ".m4a" }[info.mimeType] ?? ".bin");
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeName(extension)}`;
      const chunks = [];
      stream.on("data", chunk => { total += chunk.length; chunks.push(chunk); });
      stream.on("limit", () => reject(Object.assign(new Error("上传文件超过 25MB"), { status: 413 })));
      stream.on("end", () => { file = { field: name, originalName, mimeType: info.mimeType, storedName, buffer: Buffer.concat(chunks) }; });
    });
    busboy.on("error", reject);
    busboy.on("finish", async () => {
      try {
        if (file) {
          await mkdir(uploadRoot, { recursive: true });
          await writeFile(join(uploadRoot, file.storedName), file.buffer);
        }
        resolve({ fields, file: file ? { ...file, size: total } : undefined });
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

function evidenceRefs(context) {
  return [...context.media, ...context.problems, ...context.solutions].map(item => item.id).filter(Boolean);
}

const VALIDATED_OUTCOMES = new Set(["confirmed", "partial", "refuted"]);

function siteProgress({ questions = [], evidenceCount = 0, confirmedProblemCount = 0, solutions = [] }) {
  const validatedQuestionCount = questions.filter(item => VALIDATED_OUTCOMES.has(item.validationOutcome)).length;
  const confirmedQuestionCount = questions.filter(item => item.validationOutcome === "confirmed").length;
  const partialQuestionCount = questions.filter(item => item.validationOutcome === "partial").length;
  const refutedQuestionCount = questions.filter(item => item.validationOutcome === "refuted").length;
  const linkedSolutionCount = solutions.filter(item => item.linkedProblemIds?.length).length;
  const testedSolutionCount = solutions.filter(item => ["validated", "iterate"].includes(item.validationStatus)).length;
  const questionValidationPercent = questions.length ? Math.round(validatedQuestionCount / questions.length * 100) : 0;
  const closurePercent = Math.round(
    (questions.length ? 15 : 0) +
    (questions.length ? validatedQuestionCount / questions.length * 25 : 0) +
    (evidenceCount ? 20 : 0) +
    (confirmedProblemCount ? 15 : 0) +
    (linkedSolutionCount ? 15 : 0) +
    (testedSolutionCount ? 10 : 0)
  );
  return { validatedQuestionCount, questionsValidatedCount:validatedQuestionCount, confirmedQuestionCount, partialQuestionCount, refutedQuestionCount, questionValidationPercent, linkedSolutionCount, testedSolutionCount, closurePercent };
}

function fallbackObservations(context) {
  return context.media.map(item => ({
    text: item.textContent || item.caption || item.title || item.fileName,
    sourceId: item.id,
    kind: item.type === "audio" ? "quote" : "fact",
    confidence: item.textContent || item.caption ? "direct" : "needs-review"
  })).filter(item => item.text).slice(0, 8);
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

const QUESTION_BLUEPRINTS = [
  ["场景扫描", "一线执行者", "观察", "请带我走一遍最典型的工作流程，哪一步最容易停顿、绕行或返工？"],
  ["场景扫描", "现场负责人", "追问", "今天的运行状态和高峰、异常或赶工时相比，哪些地方最不一样？"],
  ["角色共情", "一线执行者", "访谈", "哪件看似简单的事最消耗注意力，外部人员通常看不见这种负担？"],
  ["角色共情", "新手员工", "对比", "新手最容易误解哪条规则，熟手又依靠什么隐性经验避开错误？"],
  ["流程断点", "上下游协作者", "追踪", "信息从谁传给谁时最容易丢失、延迟或需要重复确认？"],
  ["流程断点", "系统使用者", "观察", "纸张、表格、聊天和业务系统之间，哪次重复录入最没有价值？"],
  ["异常成本", "现场负责人", "关键事件", "请回忆最近一次典型异常：最早出现了什么信号，后来付出了哪些时间或资源？"],
  ["异常成本", "受影响者", "量化", "如果这个问题一周发生多次，分别影响谁，可用什么数字记录损失？"],
  ["权责机制", "决策者", "访谈", "信息不完整时谁做最终判断，判断错了如何发现、纠正和复盘？"],
  ["权责机制", "一线执行者", "反事实", "如果允许你绕开一条规定完成任务，你会选哪条，为什么它阻碍了真实工作？"],
  ["人机边界", "系统使用者", "边界测试", "哪些判断可以交给 AI 提醒或推荐，哪些必须由人确认并保留解释权？"],
  ["人机边界", "受影响者", "风险探针", "如果 AI 在这里判断错误，谁最先受影响，哪种错误绝对不能接受？"],
  ["人机边界", "现场负责人", "信任校准", "AI 给出建议时，现场人员需要看到哪些依据，才会采用、质疑或推翻它？"],
  ["既有尝试", "项目负责人", "复盘", "过去为解决这个问题试过什么，为什么没有持续使用或没有达到预期？"],
  ["既有尝试", "一线执行者", "例外", "有没有人已经用自己的小办法解决了一部分，它在什么条件下才有效？"],
  ["反例验证", "现场负责人", "反例", "什么时候这个问题不会发生？那些成功时刻具备哪些不同条件？"],
  ["反例验证", "受影响者", "证伪", "什么现场证据会证明我们对问题的理解是错的，而不是继续支持原假设？"],
  ["机会方向", "一线执行者", "共创", "如果只能减少一个步骤、一次等待或一种重复劳动，你最希望先改哪一个？"],
  ["机会方向", "决策者", "优先级", "在影响范围、发生频率和改造难度之间，你会怎样排序当前问题？"],
  ["试点验证", "项目负责人", "实验", "两周内能做的最小试点是什么，必须保留哪些人工兜底？"],
  ["试点验证", "受影响者", "指标", "试点成功除了更快，还应改善准确性、体验或信任中的哪一项？"],
  ["未来想象", "一线执行者", "未来回望", "假设一年后工作明显变好，你每天最先感受到的变化会是什么？"],
  ["未来想象", "决策者", "约束", "若预算、数据权限或组织协同受限，哪个条件最可能让方案无法落地？"],
  ["关系生态", "外部协作者", "生态图", "这个现场之外还有谁影响结果，却从未进入现有讨论或数据记录？"],
  ["价值冲突", "多方角色", "权衡", "效率、质量、安全与人的感受发生冲突时，目前实际优先保护哪一个？"]
];

function normalizedQuestionText(text = "") {
  return String(text).toLowerCase().replace(/[\s，。！？、：；,.!?:;（）()“”"'《》【】\-]/g, "");
}

function questionSimilarity(left, right) {
  const a = normalizedQuestionText(left), b = normalizedQuestionText(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const grams = value => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const ag = grams(a), bg = grams(b);
  const common = [...ag].filter(value => bg.has(value)).length;
  return common / Math.max(1, ag.size + bg.size - common);
}

function diverseQuestions(companyName = "该站点", candidates = [], existing = []) {
  const fallback = QUESTION_BLUEPRINTS.map(([dimension, target, method, text], index) => ({ id: `suggest-${Date.now()}-${index}`, text: `${companyName}：${text}`, dimension, target, method, tags: [dimension, method], lens: "pending" }));
  const prepared = [...candidates, ...fallback].map((item, index) => ({ ...item, id: item.id ?? `suggest-${Date.now()}-${index}`, text: String(item.text ?? "").trim(), dimension: item.dimension ?? item.tags?.[0] ?? "现场探索", target: item.target ?? "现场相关者", method: item.method ?? "访谈", tags: [...new Set([...(item.tags ?? []), item.dimension, item.method].filter(Boolean))].slice(0, 4), lens: item.lens ?? "pending" })).filter(item => item.text.length >= 12);
  const selected = [];
  const dimensionCounts = new Map();
  const dimensionLimit = dimension => dimension === "人机边界" ? 3 : 2;
  for (const item of prepared) {
    if (existing.some(saved => questionSimilarity(item.text, saved.text) >= .62)) continue;
    if (selected.some(saved => questionSimilarity(item.text, saved.text) >= .62)) continue;
    if ((dimensionCounts.get(item.dimension) ?? 0) >= dimensionLimit(item.dimension)) continue;
    selected.push(item);
    dimensionCounts.set(item.dimension, (dimensionCounts.get(item.dimension) ?? 0) + 1);
    if (selected.length === 18) break;
  }
  if (selected.length < 18) for (const item of fallback) {
    if ((dimensionCounts.get(item.dimension) ?? 0) >= dimensionLimit(item.dimension)) continue;
    if (!selected.some(saved => questionSimilarity(item.text, saved.text) >= .62)) {
      selected.push(item);
      dimensionCounts.set(item.dimension, (dimensionCounts.get(item.dimension) ?? 0) + 1);
    }
    if (selected.length === 18) break;
  }
  return selected;
}

function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") throw Object.assign(new Error("管理端尚未配置 ADMIN_TOKEN"), { status: 503 });
    return;
  }
  if (req.headers["x-admin-token"] !== expected) throw Object.assign(new Error("管理员凭证无效"), { status: 401 });
}

function syncTeamState(state) {
  const existingSites = new Map((state.dashboard.members ?? []).flatMap(member => (member.sites ?? []).map(site => [`${member.memberId}:${site.routeId}:${site.companyId}`, site])));
  const members = state.teamConfig.members.map(member => {
    const sites = [];
    for (const route of state.teamConfig.routes) {
      if (!route.memberIds.includes(member.id)) continue;
      for (const stop of route.stops) {
        const previous = existingSites.get(`${member.id}:${route.id}:${stop.companyId}`) ?? {};
        sites.push({ questionsSaved:false, questionsComplete:false, questions:[], questionValidation:[], questionsValidatedCount:0, pioneerTaggedCount:0, iterateTaggedCount:0, pendingTaggedCount:0, ...previous, ...stop, day:route.day, date:route.date, routeId:route.id, routeLabel:route.label });
      }
    }
    return { memberId:member.id, memberName:member.name, sites, sitesComplete:sites.filter(site=>site.questionsComplete).length, totalSites:sites.length };
  });
  const uniqueSites = new Set(state.teamConfig.routes.flatMap(route => route.stops.map(stop => stop.companyId))).size;
  state.dashboard.members = members;
  state.dashboard.groupName = state.teamConfig.group.name;
  state.dashboard.summary = { ...state.dashboard.summary, memberCount:members.length, uniqueSiteCount:uniqueSites, siteAssignmentCount:members.reduce((sum,member)=>sum+member.totalSites,0), sitesQuestionsComplete:members.flatMap(member=>member.sites).filter(site=>site.questionsComplete).length };
  state.dashboard.updatedAt = new Date().toISOString();
  state.collab.members = state.teamConfig.members.map(member => ({ memberId:member.id, memberName:member.name, role:member.role }));
  state.destinations = Object.fromEntries(members.map(member => [member.memberId, { ...(state.destinations[member.memberId] ?? {}), memberId:member.memberId, companyIds:[...new Set(member.sites.map(site=>site.companyId))], routeConfirmed:true, updatedAt:new Date().toISOString() }]));
  for (const member of members) {
    const current = state.memberLongReports[member.memberId] ?? {};
    state.memberLongReports[member.memberId] = { ...current, memberId:member.memberId, memberName:member.memberName, targetChars:10000, template:"rbcc", reports:member.sites.map(site => ({ ...(current.reports?.find(report=>report.companyId===site.companyId) ?? {}), companyId:site.companyId, placeName:site.companyName, filename:`${member.memberName}-${site.companyName}-调研报告.docx`, day:site.day, groupModeId:"iterate" })) };
  }
}

export function createApi({ store, root, uploadRoot = join(root, "data", "uploads") }) {

  return async function api(req, url) {
    const state = await store.get();
    const { pathname, searchParams } = url;

    if (pathname === "/api/agent-icon" && req.method === "GET") {
      const response = await fetch("https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEXVSxqWMufYhdzMwUsUu83WWjOFYaH1wACei0AAm1OwFavQ2V2NGQbkj0E.png");
      if (!response.ok) return json({ error:"Agent 图标暂时不可用" },502);
      return { status:200, body:Buffer.from(await response.arrayBuffer()), type:"image/png", headers:{"cache-control":"public, max-age=86400, s-maxage=31536000, immutable"} };
    }
    if (req.method === "GET" && pathname === "/api/team-config") return json(state.teamConfig ?? null);
    if (req.method === "GET" && pathname === "/api/llm/status") return json(llmStatus());
    if (req.method === "GET" && pathname === "/api/reference-questions") {
      const companyId = searchParams.get("companyId");
      const site = companyId ? dropRouteReference.sites[companyId] : null;
      return json({ source:dropRouteReference.source, companyId, matched:Boolean(site), questions:(site?.questions ?? []).map(item => ({ ...item, tags:["external-reference", "待现场复核"], validationOutcome:"pending", provenance:{ sourceUrl:dropRouteReference.source.url, sourceTeam:"team-9", sourceSite:site.sourceSite } })), clues:(site?.clues ?? []).map(item => ({ ...item, tags:["external-reference", "待现场复核"], provenance:{ sourceUrl:dropRouteReference.source.url, sourceTeam:"team-9", sourceSite:site.sourceSite } })) });
    }

    if (pathname === "/api/admin/summary" && req.method === "GET") {
      requireAdmin(req);
      const usesBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
      const localPersistent = !process.env.VERCEL;
      return json({
        teamConfig: state.teamConfig,
        dashboard: state.dashboard,
        counts: { members: state.dashboard.members?.length ?? 0, assignments: state.dashboard.summary?.siteAssignmentCount ?? 0, uniqueSites: state.dashboard.summary?.uniqueSiteCount ?? 0, evidence: state.media.length, problems: state.problems.length, solutions: state.solutions.length, tasks: state.collab.tasks?.length ?? 0, knowledge: state.knowledgeDocs.length, knowledgeSources: state.knowledgeSources?.length ?? 0, knowledgeChunks: state.knowledgeChunks?.length ?? 0, finalReports: Object.keys(state.finalReports ?? {}).length, reportVersions:Object.values(state.iterations??{}).reduce((sum,item)=>sum+(item.versions?.length??0),0) },
        storage:{mode:usesBlob?"private-blob":"local-json",persistent:usesBlob||localPersistent,warning:usesBlob?"私有 Blob 已连接；并发整份 JSON 写入仍可能后写覆盖先写。":localPersistent?"生产数据已持久化到服务器本地 JSON 与 uploads；发布前后应保留完整备份。":"当前未连接生产持久存储。"},
        knowledgeSources: state.knowledgeSources ?? [],
        finalReports: Object.values(state.finalReports ?? {}).map(report => { const version=(state.iterations[keyFor(report.memberId,report.companyId)]?.versions??[]).find(item=>item.source==="admin-final");return{...report,versionLabel:version?.label??"管理员定稿",versionId:version?.id}; }),
        tasks: state.collab.tasks ?? [],
        recentEvidence: state.media.slice(0, 50),
        updatedAt: state.updatedAt
      });
    }
    if (pathname === "/api/admin/export" && req.method === "GET") {
      requireAdmin(req);
      return json(state, 200, { "content-disposition": `attachment; filename="rbcc-team8-${new Date().toISOString().slice(0, 10)}.json"` });
    }
    if (pathname.startsWith("/api/admin/members/") && req.method === "PATCH") {
      requireAdmin(req);
      const id = pathname.split("/").pop(), patch = await body(req);
      const member = state.teamConfig.members.find(item => item.id === id);
      if (!member) return json({ error:"成员不存在" },404);
      await store.update(value => {
        const target=value.teamConfig.members.find(item=>item.id===id);Object.assign(target,{name:String(patch.name||target.name).trim(),role:String(patch.role||target.role).trim()});
        for(const list of [value.media,value.problems,value.solutions,value.collab.updates])for(const item of list??[])if(item.memberId===id)item.memberName=target.name;
        syncTeamState(value);
      });
      return json(state.teamConfig.members.find(item=>item.id===id));
    }
    if (pathname.startsWith("/api/admin/routes/") && req.method === "PATCH") {
      requireAdmin(req);
      const id=pathname.split("/").pop(),patch=await body(req);const route=state.teamConfig.routes.find(item=>item.id===id);if(!route)return json({error:"路线不存在"},404);
      await store.update(value=>{const target=value.teamConfig.routes.find(item=>item.id===id);Object.assign(target,{label:String(patch.label??target.label).trim(),date:patch.date??target.date,capacity:Number(patch.capacity??target.capacity),memberIds:Array.isArray(patch.memberIds)?patch.memberIds:target.memberIds});const task=value.collab.tasks.find(item=>item.id===`task-${id}`);if(task){task.title=`Day ${target.day} · ${target.label} 行前确认`;task.description=`${target.memberIds.map(memberId=>value.teamConfig.members.find(member=>member.id===memberId)?.name).filter(Boolean).join("、")}：确认集合、访谈分工、拍摄边界与问题清单`;}syncTeamState(value)});
      return json(state.teamConfig.routes.find(item=>item.id===id));
    }
    if (pathname.startsWith("/api/admin/stops/") && req.method === "PATCH") {
      requireAdmin(req);
      const [routeId,companyId]=pathname.replace("/api/admin/stops/","").split("/");const patch=await body(req);const route=state.teamConfig.routes.find(item=>item.id===routeId);const stop=route?.stops.find(item=>item.companyId===companyId);if(!stop)return json({error:"站点不存在"},404);
      await store.update(value=>{const target=value.teamConfig.routes.find(item=>item.id===routeId).stops.find(item=>item.companyId===companyId);for(const key of ["companyName","themeName","activity","time","meetingPoint"])if(key in patch)target[key]=String(patch[key]??"").trim();syncTeamState(value)});
      return json(stop);
    }
    if (pathname.startsWith("/api/admin/evidence/") && req.method === "DELETE") {
      requireAdmin(req);const id=pathname.split("/").pop();await store.update(value=>{value.media=value.media.filter(item=>item.id!==id);value.agentFeed=value.agentFeed.filter(item=>item.mediaId!==id)});return json({ok:true});
    }
    if (pathname.startsWith("/api/admin/final-reports/") && req.method === "DELETE") {
      requireAdmin(req);const rawKey=decodeURIComponent(pathname.split("/").pop());const key=rawKey.includes("::")?rawKey:rawKey.replace(/^([^:]+):(.+)$/,"$1::$2");let removed=false;await store.update(value=>{removed=Boolean(value.finalReports[key]);delete value.finalReports[key]});return removed?json({ok:true,key}):json({error:"管理员定稿不存在"},404);
    }
    if (pathname === "/api/admin/report-upload" && req.method === "POST") {
      requireAdmin(req);
      const { fields, file } = await parseMultipart(req, uploadRoot);
      if (!fields.memberId || !fields.companyId || !file) return json({ error: "缺少成员、站点或 DOCX 文件" }, 400);
      if (file.mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !file.originalName?.toLowerCase().endsWith(".docx")) return json({ error: "只允许上传 DOCX 定稿" }, 415);
      const member = state.dashboard.members?.find(item => item.memberId === fields.memberId);
      const site = member?.sites?.find(item => item.companyId === fields.companyId);
      if (!member || !site) return json({ error: "成员与站点不匹配" }, 400);
      const blob = await persistBlob({ ...fields, groupId: state.dashboard.groupId }, file, "final-report");
      const finalReport = record({ groupId: state.dashboard.groupId, memberId: member.memberId, memberName: member.memberName, companyId: site.companyId, companyName: site.companyName, originalName: file.originalName, storedName: file.storedName, blobPathname: blob?.pathname, mimeType: file.mimeType, fileSize: file.size, published: fields.published !== "false", uploadedBy: fields.uploadedBy || "管理员" }, "final-report");
      await store.update(value => { const key=keyFor(member.memberId,site.companyId);value.finalReports ??= {}; value.finalReports[key] = finalReport;value.iterations[key]??={memberId:member.memberId,companyId:site.companyId,versions:[]};const version=value.iterations[key].versions.length+1;value.iterations[key].versions.unshift({id:`final-v${version}-${Date.now()}`,version,source:"admin-final",label:`管理员定稿 v${version}`,filename:file.originalName,createdAt:new Date().toISOString()}) });
      return json(finalReport, 201);
    }

    if (req.method === "GET" && pathname === "/api/collab") return json(state.collab);
    if (req.method === "POST" && pathname === "/api/collab/updates") {
      const item = record(await body(req), "update");
      await store.update(value => value.collab.updates.unshift(item));
      return json(item, 201);
    }
    if (req.method === "PATCH" && pathname.startsWith("/api/collab/tasks/")) {
      if (req.headers["x-admin-token"]) requireAdmin(req);
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
        const input = await body(req);
        const item = record({ validationStatus:"draft", ...input, metrics:Array.isArray(input.metrics)?input.metrics:String(input.metrics??"").split(/[，,]/).map(value=>value.trim()).filter(Boolean) }, "solution");
        await store.update(value => value.solutions.unshift(item));
        return json(item, 201);
      }
    }

    if (pathname === "/api/media" && req.method === "GET") {
      const items = filterSiteItems(state.media, searchParams);
      if (searchParams.get("stats") === "1") return json({ total: items.length, images: items.filter(item => item.type === "image").length, audio: items.filter(item => item.type === "audio").length, text: items.filter(item => item.type === "text").length, cloudSynced: items.filter(item => item.cloudSynced).length });
      return json({ items: items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
    if (pathname.startsWith("/api/media/file/") && req.method === "GET") {
      const id=pathname.split("/").pop();const item=state.media.find(value=>value.id===id);if(!item)return json({error:"现场文件不存在"},404);
      let document;if(item.storedName&&!process.env.VERCEL)document=await readFile(join(uploadRoot,safeName(item.storedName)));else if(item.blobPathname&&process.env.BLOB_READ_WRITE_TOKEN){const blob=await getBlob(item.blobPathname,{access:"private"});if(!blob)return json({error:"现场文件不存在"},404);document=Buffer.from(await new Response(blob.stream).arrayBuffer())}else if(item.storedName)document=await readFile(join(uploadRoot,safeName(item.storedName)));else return json({error:"该留痕没有附件"},404);
      return {status:200,body:document,type:item.mimeType||"application/octet-stream",headers:{"cache-control":"public, max-age=31536000, immutable","content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(item.fileName||"evidence")}`}};
    }
    if (pathname === "/api/media/upload" && req.method === "POST") {
      const { fields, file } = await parseMultipart(req, uploadRoot);
      if(file&&(!MEDIA_TYPES.has(file.mimeType)||!validFileSignature(file)))return json({error:"文件类型或文件内容不受支持"},415);
      if(file&&fields.type==="image"&&file.size>2*1024*1024)return json({error:"图片仍大于 2MB，请刷新队员端后重新选择，系统会自动压缩为 WebP"},413);
      const blob = await persistBlob(fields, file, "evidence");
      const item = record({ ...fields, evidenceKind: fields.evidenceKind || (fields.type === "audio" ? "quote" : "observation"), synthesisStatus:"pending", linkedProblemIds:[], durationSec: fields.durationSec ? Number(fields.durationSec) : undefined, fileName: file?.originalName, storedName:file?.storedName, mimeType: file?.mimeType, fileSize: file?.size, blobPathname: blob?.pathname, cloudSynced: Boolean(blob) || !process.env.VERCEL }, "media");
      if(file)item.url=`/api/media/file/${item.id}`;
      await store.update(value => {
        value.media.unshift(item);
        value.agentFeed.unshift(record({ groupId: item.groupId, memberId: item.memberId, memberName: item.memberName, companyName: item.companyName, mediaId: item.id, mediaType: item.type, kind: "media_upload", message: `${item.memberName || "队员"}在${item.companyName || "调研现场"}上传了${item.type === "image" ? "一张图片" : item.type === "audio" ? "一段录音" : "一条文字留痕"}` }, "feed"));
      });
      return json(item, 201);
    }

    if (pathname === "/api/evidence/synthesize" && req.method === "POST") {
      const input = await body(req);
      if (!input.memberId || !input.companyId) return json({ error:"缺少成员或站点" },400);
      const context = evidenceContext(state,input.memberId,input.companyId);
      if (input.action === "observations") {
        let observations=fallbackObservations(context),mode="knowledge";
        try {
          const answer=await complete([{role:"system",content:"只基于输入留痕提取结构化观察点，输出 JSON observations 数组，每项包含 text,sourceId,kind(fact|quote|inference|pending),confidence(direct|inferred|needs-review)。不得新增事实。"},{role:"user",content:JSON.stringify(context.media).slice(0,40000)}],{maxTokens:1800});
          const parsed=extractJson(answer);if(parsed?.observations?.length){observations=parsed.observations;mode="llm"}
        } catch {}
        await store.update(value=>{for(const media of value.media.filter(item=>item.memberId===input.memberId&&item.companyId===input.companyId)){media.synthesisStatus="reviewed";media.updatedAt=new Date().toISOString()}});
        return json({observations,mode,sourceIds:context.media.map(item=>item.id)});
      }
      if (input.action === "problem") {
        const observations=(input.observations??fallbackObservations(context)).filter(item=>item.text);
        const validatedQuestions=(state.researchQuestions[keyFor(input.memberId,input.companyId)]??[]).filter(item=>item.validationOutcome&&item.validationOutcome!=="pending");
        if(!observations.length&&!validatedQuestions.length)return json({error:"请先完成至少一条逐题验证，或上传并提炼现场留痕"},422);
        const questionEvidence=validatedQuestions.map(item=>`[${item.validationOutcome}] ${item.text}${item.answer?`：${item.answer}`:""}${item.evidenceSource?`（${item.evidenceSource}）`:""}`);
        const item=record({groupId:state.dashboard.groupId,memberId:input.memberId,memberName:input.memberName,companyId:input.companyId,companyName:input.companyName,title:input.title||`${input.companyName||"该站点"}现场流程痛点`,evidence:[...observations.map(item=>item.text),...questionEvidence].join("；"),observationIds:observations.map(item=>item.sourceId).filter(Boolean),questionIds:validatedQuestions.map(item=>item.id).filter(Boolean),validationOutcome:"pending",severity:"normal",source:"agent"},"problem");
        await store.update(value=>value.problems.unshift(item));return json(item,201);
      }
      if (input.action === "solution") {
        const confirmed=context.problems.filter(item=>item.validationOutcome==="confirmed");
        if(!confirmed.length)return json({error:"至少确认一条痛点后才能生成方案"},422);
        const item=record({groupId:state.dashboard.groupId,memberId:input.memberId,memberName:input.memberName,companyId:input.companyId,companyName:input.companyName,title:input.title||`${input.companyName||"该站点"}人机协同最小试点`,description:input.description||"围绕已验证痛点建立小范围试点，保留人工最终判断权，并比较处理时长、返工率与一线采用率。",linkedProblemIds:confirmed.map(item=>item.id).slice(0,5),metrics:["处理时长","返工率","一线采用率"],testPlan:"选取一个可控场景记录基线，以人工兜底运行两周，对比试点前后指标并访谈一线使用者。",validationStatus:"draft",source:"agent"},"solution");
        await store.update(value=>value.solutions.unshift(item));return json(item,201);
      }
      if (input.action === "report") {
        const key=keyFor(input.memberId,input.companyId);const base=baseReport(state,input.memberId,input.companyId,"iterate");const sections=normalizeSections(state.reportDrafts[key]?.sections??base.sections);
        const refs=evidenceRefs(context);sections.empathy.fieldNotes=[...new Set([...sections.empathy.fieldNotes,...context.media.map(item=>item.textContent||item.caption).filter(Boolean)])];sections.painPoints.evidence=[...new Set([...sections.painPoints.evidence,...context.problems.map(item=>`[${item.id}] ${item.evidence||item.title}`).filter(Boolean)])];sections.conception.proposals=[...new Set([...sections.conception.proposals,...context.solutions.map(item=>`[${item.id}] ${item.description||item.title}`).filter(Boolean)])];
        const draft={memberId:input.memberId,companyId:input.companyId,groupModeId:"iterate",sections,evidenceRefs:refs,source:"evidence-chain",updatedAt:new Date().toISOString()};await store.update(value=>{value.reportDrafts[key]=draft});return json({draft,addedRefs:refs.length});
      }
      return json({error:"未知提炼动作"},400);
    }

    if (pathname.startsWith("/api/problems/") && req.method === "PATCH") {
      const id=pathname.split("/").pop(),patch=await body(req);let found;
      const current=state.problems.find(item=>item.id===id);
      if(patch.validationOutcome==="confirmed"&&!String(patch.validationNote??current?.validationNote??current?.evidence??"").trim())return json({error:"确认痛点前必须填写验证依据"},422);
      await store.update(value=>{found=value.problems.find(item=>item.id===id);if(found)Object.assign(found,{validationOutcome:patch.validationOutcome??found.validationOutcome,validationNote:patch.validationNote??found.validationNote,updatedAt:new Date().toISOString()})});
      return found?json(found):json({error:"痛点不存在"},404);
    }

    if (pathname.startsWith("/api/solutions/") && req.method === "PATCH") {
      const id=pathname.split("/").pop(),patch=await body(req);let found;
      const allowed=new Set(["draft","testing","validated","iterate"]);
      if(patch.validationStatus&&!allowed.has(patch.validationStatus))return json({error:"方案验证状态无效"},400);
      if(["validated","iterate"].includes(patch.validationStatus)&&!String(patch.validationResult??"").trim())return json({error:"结束试验前必须记录验证结果"},422);
      await store.update(value=>{found=value.solutions.find(item=>item.id===id);if(found)Object.assign(found,{validationStatus:patch.validationStatus??found.validationStatus,validationResult:patch.validationResult??found.validationResult,testPlan:patch.testPlan??found.testPlan,metrics:patch.metrics??found.metrics,updatedAt:new Date().toISOString()})});
      return found?json(found):json({error:"方案不存在"},404);
    }

    if (pathname === "/api/knowledge") {
      if (req.method === "GET") {
        if (searchParams.get("stats") === "1") return json({ totalChunks: (state.knowledgeChunks?.length ?? 0) + state.knowledgeDocs.length, customDocs: state.knowledgeDocs.length, mountedSources: state.knowledgeSources?.length ?? 0, indexedChunks: state.knowledgeChunks?.length ?? 0, byCategory: { workflow: 2, team: 1, route: 7, source: state.knowledgeChunks?.length ?? 0, custom: state.knowledgeDocs.length } });
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
    if (pathname === "/api/knowledge/sources" && req.method === "GET") return json({ sources: state.knowledgeSources ?? [], chunks: state.knowledgeChunks?.length ?? 0 });
    if (pathname === "/api/knowledge/search" && req.method === "GET") return json({ query: searchParams.get("q") ?? "", results: searchKnowledge(state, searchParams.get("q"), Number(searchParams.get("limit") || 20)) });
    if (pathname === "/api/knowledge/upload" && req.method === "POST") {
      const { fields, file } = await parseMultipart(req, uploadRoot);
      if (!file) return json({ error: "请选择要挂载的资料文件" }, 400);
      const text = await extractDocument(file);
      if (text.trim().length < 20) return json({ error: "资料中没有足够的可索引文字" }, 422);
      const source = record({ groupId: fields.groupId || state.dashboard.groupId, title: fields.title || file.originalName, originalName: file.originalName, mimeType: file.mimeType, fileSize: file.size, status: "indexed", charCount: text.length, tags: String(fields.tags || "").split(/[,，、]/).map(item => item.trim()).filter(Boolean), uploadedBy: fields.uploadedBy || "组内成员" }, "source");
      const blob = await persistBlob({ ...fields, groupId: source.groupId, memberId: fields.memberId || "knowledge", companyId: fields.companyId || "shared" }, file, "knowledge-source");
      source.blobPathname = blob?.pathname;
      const chunks = chunkDocument(text).map(item => record({ ...item, sourceId: source.id, title: source.title, tags: source.tags, groupId: source.groupId }, "chunk"));
      await store.update(value => {
        value.knowledgeSources ??= [];
        value.knowledgeChunks ??= [];
        value.knowledgeSources.unshift(source);
        value.knowledgeChunks.push(...chunks);
        value.knowledgeDocs.unshift(record({ title: source.title, content: chunks.slice(0, 2).map(item => item.content).join("\n\n"), tags: [...source.tags, "mounted-source"], sourceId: source.id, memberName: source.uploadedBy }, "knowledge"));
      });
      return json({ source, chunkCount: chunks.length }, 201);
    }
    if (pathname === "/api/knowledge/sources" && req.method === "DELETE") {
      if (req.headers["x-admin-token"]) requireAdmin(req);
      const id = searchParams.get("id");
      await store.update(value => {
        value.knowledgeSources = (value.knowledgeSources ?? []).filter(item => item.id !== id);
        value.knowledgeChunks = (value.knowledgeChunks ?? []).filter(item => item.sourceId !== id);
        value.knowledgeDocs = value.knowledgeDocs.filter(item => item.sourceId !== id);
      });
      return json({ ok: true });
    }

    if (pathname === "/api/agent/feed" && req.method === "GET") {
      const since = searchParams.get("since");
      const items = state.agentFeed.filter(item => (!searchParams.get("groupId") || item.groupId === searchParams.get("groupId")) && (!since || item.createdAt > since));
      return json({ items });
    }
    if (pathname === "/api/agent/chat" && req.method === "POST") {
      const input = await body(req);
      const context = evidenceContext(state, input.memberId, input.companyId);
      const mountedKnowledge = searchKnowledge(state, input.message, 6);
      if (mountedKnowledge.length) context.knowledge = [...mountedKnowledge, ...context.knowledge].slice(0, 10);
      const citations = context.knowledge.slice(0, 3).map(item => ({ id: item.id, title: item.title }));
      let reply;
      let mode = "knowledge";
      try {
        reply = await complete([
          { role: "system", content: `你是 RBCC ${state.teamConfig?.group?.name ?? "调研组"}协同 Agent 红八宝。优先使用提供的本组调研材料回答，并区分一手证据、已验证结论、证据缺口和下一步动作。如果材料没有覆盖用户问题，可以使用模型通识知识完整回答，但必须在对应内容前标注“通识补充（非本组现场证据）”。不得把通识内容伪装成访谈、企业事实、本组数字或引用；涉及具体企业现场情况时明确说明仍待现场验证。用清晰、直接的中文回答。` },
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

    if (pathname.startsWith("/api/research-questions/") && req.method === "DELETE") {
      const memberId = searchParams.get("memberId"), companyId = searchParams.get("companyId"), id = decodeURIComponent(pathname.split("/").pop());
      if (!memberId || !companyId || !id) return json({ error:"缺少成员、站点或问题 ID" },400);
      let removed = false;
      await store.update(value => {
        const key = keyFor(memberId, companyId), questions = value.researchQuestions[key] ?? [];
        const next = questions.filter(item => item.id !== id); removed = next.length !== questions.length;
        if (removed) value.researchQuestions[key] = next;
      });
      return removed ? json({ deleted:true, id }) : json({ error:"问题不存在或已删除" },404);
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
        const incompleteValidation = questions.find(item => item.validationOutcome && item.validationOutcome !== "pending" && !String(item.evidenceSource ?? "").trim() && !String(item.answer ?? "").trim());
        if (incompleteValidation) return json({ error: "填写逐题验证结论时，必须同时记录证据来源或认知变化" }, 422);
        await store.update(value => { value.researchQuestions[keyFor(input.memberId, input.companyId)] = questions; });
        return json({ questions, updatedAt: new Date().toISOString() });
      }
    }

    if (pathname === "/api/research-dashboard" && req.method === "GET") {
      const memberId = searchParams.get("memberId");
      const dashboard = structuredClone(state.dashboard);
      for (const member of dashboard.members ?? []) for (const site of member.sites ?? []) {
        site.questions = state.researchQuestions[keyFor(member.memberId, site.companyId)] ?? site.questions ?? [];
        site.questionsComplete=site.questions.length>0;
        site.pioneerTaggedCount=site.questions.filter(item=>item.lens==="pioneer").length;site.iterateTaggedCount=site.questions.filter(item=>item.lens==="iterate").length;
        site.evidenceCount=state.media.filter(item=>item.memberId===member.memberId&&item.companyId===site.companyId).length;site.problemCount=state.problems.filter(item=>item.memberId===member.memberId&&item.companyId===site.companyId).length;site.confirmedProblemCount=state.problems.filter(item=>item.memberId===member.memberId&&item.companyId===site.companyId&&item.validationOutcome==="confirmed").length;const siteSolutions=state.solutions.filter(item=>item.memberId===member.memberId&&item.companyId===site.companyId);site.solutionCount=siteSolutions.length;Object.assign(site,siteProgress({questions:site.questions,evidenceCount:site.evidenceCount,confirmedProblemCount:site.confirmedProblemCount,solutions:siteSolutions}));site.reportAvailable=Boolean(state.generatedReports[keyFor(member.memberId,site.companyId)]||state.finalReports?.[keyFor(member.memberId,site.companyId)]);
      }
      for (const member of dashboard.members ?? []) {
        member.totalSites = member.sites?.length ?? 0;
        member.sitesComplete = member.sites?.filter(site => site.questionsComplete).length ?? 0;
      }
      const allSites=dashboard.members?.flatMap(member=>member.sites??[])??[];const reportKeys=new Set([...Object.keys(state.generatedReports??{}),...Object.keys(state.finalReports??{})]);dashboard.summary={...dashboard.summary,sitesQuestionsComplete:allSites.filter(site=>site.questionsComplete).length,sitesDualValidated:allSites.filter(site=>site.pioneerTaggedCount&&site.iterateTaggedCount).length,validatedQuestionCount:allSites.reduce((sum,site)=>sum+site.validatedQuestionCount,0),questionCount:allSites.reduce((sum,site)=>sum+site.questions.length,0),questionValidationPercent:allSites.reduce((sum,site)=>sum+site.questions.length,0)?Math.round(allSites.reduce((sum,site)=>sum+site.validatedQuestionCount,0)/allSites.reduce((sum,site)=>sum+site.questions.length,0)*100):0,averageClosurePercent:allSites.length?Math.round(allSites.reduce((sum,site)=>sum+site.closurePercent,0)/allSites.length):0,evidenceCount:state.media.length,problemCount:state.problems.length,confirmedProblemCount:state.problems.filter(item=>item.validationOutcome==="confirmed").length,solutionCount:state.solutions.length,linkedSolutionCount:state.solutions.filter(item=>item.linkedProblemIds?.length).length,testedSolutionCount:state.solutions.filter(item=>["validated","iterate"].includes(item.validationStatus)).length,reportReadyCount:reportKeys.size};
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
      const key=keyFor(input.memberId,input.companyId);const previous=state.iterations[key]?.versions?.length??0;
      const draft = { memberId: input.memberId, companyId: input.companyId, groupModeId: input.groupModeId, sections: normalizeSections(input.sections), source:"manual-draft", version:previous+1, updatedAt: new Date().toISOString() };
      await store.update(value => { value.reportDrafts[key] = draft;value.iterations[key]??={memberId:input.memberId,companyId:input.companyId,versions:[]};value.iterations[key].versions.unshift({id:`draft-v${draft.version}-${Date.now()}`,version:draft.version,source:draft.source,label:`工作稿 v${draft.version}`,createdAt:draft.updatedAt}) });
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
      const existingQuestions = state.researchQuestions[key] ?? [];
      let questions = diverseQuestions(site?.companyName, [], existingQuestions);
      let project = { title: `${site?.companyName ?? "站点"}证据闭环试点`, summary: "选择一个高频、高代价且可观察的痛点，以两周为周期记录基线、试点过程和结果，保留人工最终判断权。", linkedProblemIds: state.problems.filter(item => item.companyId === input.companyId).slice(0, 3).map(item => item.id), metrics: ["处理时长", "误报/返工率", "一线采用率"] };
      let mode = "knowledge";
      try {
        const response = await complete([{ role: "system", content: `你是资深设计研究员，为企业现场走访设计 18 个高信息增益问题。输出严格 JSON：questions 数组每项含 text、dimension、target、method、tags；project 含 title、summary、linkedProblemIds、metrics。
要求：覆盖场景扫描、角色共情、流程断点、异常成本、权责机制、人机边界、既有尝试、反例验证、机会方向、试点验证中的至少 9 类；混合观察、关键事件访谈、追问、量化、反事实、证伪和共创，不得只是改写同一个母题；每题只问一件事，并指向明确角色或可观察现场；至少 3 题寻找反例或证伪，至少 3 题讨论 AI 的授权、解释权、人工兜底与风险；避开已有问题，不预设企业事实，不编造数字、访谈或结论。` }, { role: "user", content: JSON.stringify({ site: { companyName: site?.companyName, themeName: site?.themeName, activity: site?.activity }, existingQuestions, evidence: evidenceContext(state, input.memberId, input.companyId) }).slice(0, 50_000) }], { maxTokens: 3600 });
        const parsed = extractJson(response);
        if (parsed?.questions?.length) { questions = diverseQuestions(site?.companyName, parsed.questions, existingQuestions); project = parsed.project ?? project; mode = "llm"; }
      } catch {}
      const dimensions = [...new Set(questions.map(item => item.dimension).filter(Boolean))];
      return json({ questions, questionCount: questions.length, dimensions, dimensionCount: dimensions.length, avoidedExistingCount: existingQuestions.length, project, mode });
    }
    if (pathname === "/api/research-report" && req.method === "POST") {
      const input = await body(req);
      if (!input.memberId || !input.companyId || !input.groupModeId) return json({ error: "缺少报告定位参数" }, 400);
      const report = input.useLlm === false ? baseReport(state, input.memberId, input.companyId, input.groupModeId) : await generateLongReport(state, input.memberId, input.companyId, input.groupModeId);
      const key=keyFor(input.memberId,input.companyId);const version=(state.iterations[key]?.versions?.length??0)+1;report.meta={...report.meta,version,source:report.llm?.mode==="llm"?"ai-generated":"evidence"};
      await store.update(value => { value.generatedReports[key] = report;value.iterations[key]??={memberId:input.memberId,companyId:input.companyId,versions:[]};value.iterations[key].versions.unshift({id:`report-v${version}-${Date.now()}`,version,source:report.meta.source,label:report.meta.source==="ai-generated"?`AI 生成版 v${version}`:`证据版 v${version}`,citationCount:report.citations?.length??0,createdAt:new Date().toISOString()}) });
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
      if (finalReport?.blobPathname || finalReport?.storedName) {
        let document;
        if (finalReport.blobPathname && process.env.BLOB_READ_WRITE_TOKEN) {
          const blob = await getBlob(finalReport.blobPathname, { access: "private" });
          if (!blob) return json({ error: "管理员定稿文件不存在" }, 404);
          document = Buffer.from(await new Response(blob.stream).arrayBuffer());
        } else document = await readFile(join(uploadRoot, safeName(finalReport.storedName)));
        return { status: 200, body: document, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(finalReport.originalName || "RBCC-管理员定稿.docx")}` } };
      }
      const report = baseReport(state, memberId, companyId, "iterate");
      const document = await createReportDocx(report);
      const filename = `${report.meta.memberName || "RBCC"}-${report.meta.companyName || "调研"}-调研报告.docx`;
      return { status: 200, body: document, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } };
    }
    if (pathname === "/api/member-report-iterations" && req.method === "GET") {const memberId=searchParams.get("memberId"),companyId=searchParams.get("companyId");if(companyId)return json(state.iterations[keyFor(memberId,companyId)]??{memberId,companyId,versions:[]});return json({memberId,versions:Object.values(state.iterations??{}).filter(item=>item.memberId===memberId).flatMap(item=>item.versions??[]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))})}
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
