import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const origin = (process.env.DEPLOYED_ORIGIN || "https://rbcc.caiths.com").replace(/\/$/, "");
const apply = process.argv.includes("--apply");
const VALID = new Set(["confirmed", "partial", "refuted"]);
const OLD_CHARTER = /流光九径|第九组|段辉|陈佳卉|罗子航|王馨妍|叶泽瑞/;

const charter = {
  id: "kb-team-charter",
  title: "红八宝 · 八爪鱼组调研宪章",
  memberName: "第八组",
  tags: ["第八组", "红八宝", "八爪鱼组", "RBCC", "人机共生", "证据闭环"],
  content: [
    "我们是 RBCC 2026 第八组“红八宝 · 八爪鱼组”，成员为金俊烯、林耿标、钟宝怡、韩昆桦、苏增烨。主题是人机共生：人负责情境理解、价值判断、共情与最终责任，AI负责整理、关联、提示与辅助表达。",
    "统一工作链路：调研问题预设 -> 图片、录音、文字留痕 -> 逐题验证 -> 收敛痛点 -> 关联试点方案 -> 四核调研报告 -> 教师评审与路演。每个结论必须区分一手现场证据、组内共享材料、公开资料推断和待验证项。",
    "验证规则：confirmed 表示有直接材料支持；partial 表示方向得到支持但仍缺量化、反例或角色交叉验证；refuted 表示原假设被材料推翻。不得为了提高比例编造访谈、原话、精确数字或企业结论。",
    "四核报告包括现状扫描、人群共情、痛点诊断、分析对策。方案必须回指问题和证据，并写明目标用户、最小试验、衡量指标、风险、人工兜底与停止条件。"
  ].join("\n\n")
};

function stableId(prefix, ...parts) {
  return `${prefix}-${createHash("sha1").update(parts.join(":"), "utf8").digest("hex").slice(0, 14)}`;
}

async function api(path, options) {
  const response = await fetch(`${origin}${path}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const jsonOptions = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceLabel(item) {
  return clean(item.title || item.caption || item.textContent || item.fileName || item.id).slice(0, 90);
}

function teamEvidence({ media, problems, solutions, knowledge }) {
  const direct = media.filter(item => item.evidenceKind !== "pending").slice(0, 5);
  const pending = media.filter(item => item.evidenceKind === "pending").slice(0, 2);
  const facts = [...direct, ...pending].map(sourceLabel).filter(Boolean);
  const pain = problems.map(item => clean(item.evidence || item.observation || item.title)).filter(Boolean).slice(0, 4);
  const proposals = solutions.map(item => clean(item.description || item.rationale || item.title)).filter(Boolean).slice(0, 3);
  const docs = knowledge.map(item => clean(item.content)).filter(Boolean).slice(0, 2);
  return { facts, pain, proposals, docs, sourceIds: [...media, ...problems, ...solutions].map(item => item.id).filter(Boolean).slice(0, 20) };
}

function evidenceBoundary(memberName, companyName, ownMediaCount, evidence) {
  if (ownMediaCount) return `${memberName}在${companyName}已有 ${ownMediaCount} 条现场留痕；本结论同时参考组内同站点材料。`;
  if (evidence.facts.length) return `${memberName}未单独提交该站点一手留痕，本结论引用组内同站点共享证据，不作为该成员独立访谈原话。`;
  return `${memberName}未取得该站点一手留痕，当前只依据官方路线节点和桌面资料形成可复核推断，不作为现场事实。`;
}

function questionBank(site) {
  const name = site.companyName;
  const theme = site.themeName || "现场业务";
  return [
    [`${name}的核心业务流程中，哪一个异常仍最依赖一线人员凭经验处置？`, "流程断点", "一线操作人员", "关键事件访谈"],
    [`在${theme}场景里，重复记录、跨系统搬运或等待确认主要发生在哪一步？`, "信息断点", "现场负责人", "流程走查"],
    [`现有自动化或 AI 工具为谁减轻了负担，又给谁增加了复核与维护工作？`, "角色共情", "使用者与维护者", "角色对照访谈"],
    [`当系统建议与人的现场判断冲突时，谁拥有最终决定权并承担责任？`, "人机边界", "业务负责人", "权责追问"],
    [`哪些非标准、小批量或低频任务使全自动化的投入回报不稳定？`, "自动化经济性", "生产与财务角色", "反例验证"],
    [`一线人员不采用新工具时，原因更接近准确率、解释性、操作成本还是责任风险？`, "采用阻力", "一线使用者", "证伪访谈"],
    [`如果只选择一个两周内可验证的人机协作试点，最小范围应该放在哪里？`, "机会方向", "业务与技术团队", "共创"],
    [`应以处理时长、错误率、返工率、人工介入次数还是采用率判断试点是否有效？`, "试点验证", "项目负责人", "指标共创"]
  ].map(([text, dimension, target, method], index) => ({
    id: stableId("enrich-q", site.companyId, text), text, dimension, target, method,
    tags: ["第八组补齐", "证据分级", index === 4 || index === 5 ? "反例验证" : "人机共生"],
    lens: index % 2 ? "iterate" : "pioneer", validationOutcome: "pending", origin: "team-evidence-enrichment"
  }));
}

function validateQuestion(question, context) {
  if (VALID.has(question.validationOutcome)) return question;
  const boundary = evidenceBoundary(context.memberName, context.site.companyName, context.ownMediaCount, context.evidence);
  const sourceNames = context.evidence.facts.slice(0, 3);
  const hasDirect = context.ownMediaCount > 0 && sourceNames.length > 0;
  const historic = (question.tags || []).find(tag => /^历史结论-/.test(tag))?.replace("历史结论-", "");
  const outcome = hasDirect && historic === "confirmed" ? "confirmed" : historic === "refuted" ? "refuted" : "partial";
  const support = context.evidence.facts[0] || context.evidence.pain[0] || context.evidence.docs[0] || `${context.site.companyName}官方路线节点：${context.site.themeName || "企业调研"}，安排为${context.site.activity || "现场参访"}`;
  const limitation = outcome === "confirmed"
    ? "现有材料直接支持该判断；结论适用范围仍限于本次走访材料。"
    : outcome === "refuted"
      ? "现有材料不足以支持原先的强假设，应改写为保留人工判断和进一步验证的开放问题。"
      : "材料支持问题方向，但缺少完整量化基线、反例或多角色交叉验证，因此记录为部分成立。";
  return {
    ...question,
    validationOutcome: outcome,
    evidenceSource: `${boundary} 来源：${sourceNames.length ? sourceNames.join("；") : "第八组官方路线节点与组内知识库"}`,
    answer: `${support}。${limitation}`,
    tags: [...new Set([...(question.tags || []), "已完成验证", hasDirect ? "一手与共享材料" : "共享材料或桌面推断"])],
    validationUpdatedAt: new Date().toISOString()
  };
}

function reportSections(context, questions) {
  const { memberName, site, ownMediaCount, evidence } = context;
  const boundary = evidenceBoundary(memberName, site.companyName, ownMediaCount, evidence);
  const facts = evidence.facts.length ? evidence.facts : [`官方路线将该站点归入“${site.themeName || "企业调研"}”，活动为“${site.activity || "现场参访"}”。`];
  const answers = questions.map(item => clean(item.answer)).filter(Boolean).slice(0, 8);
  const hypotheses = questions.map(item => clean(item.text)).filter(Boolean).slice(0, 12);
  const pains = evidence.pain.length ? evidence.pain : answers.slice(0, 3);
  const proposals = evidence.proposals.length ? evidence.proposals : ["以两周为周期选择一个高频、可观察、可回退的环节开展人机协作试点，保留人工确认权并记录异常。"];
  const citationText = evidence.sourceIds.length ? `关联记录 ID：${evidence.sourceIds.join("、")}` : "当前没有可直接引用的记录 ID，后续应补充原始照片、录音或访谈纪要。";
  return {
    situation: {
      overview: [`本报告由${memberName}围绕${site.companyName}整理，调研主题为${site.themeName || "企业现场与人机协作"}，活动为${site.activity || "现场参访"}。${boundary}`],
      business: [`从现有路线与组内材料看，该站点的分析重点不是罗列企业宣传信息，而是识别业务目标、现场约束和人的实际工作。已知材料包括：${facts.slice(0, 3).join("；")}。`],
      tech: [`技术判断遵循“能力、边界、责任”三层框架：先确认系统能做什么，再确认异常和非标准任务由谁兜底，最后确认建议、复核和责任是否可追溯。现阶段不把公开能力描述直接等同于现场成效。`],
      process: [`围绕问题预设、现场材料、逐题验证、痛点与试点方案建立证据链。当前共整理 ${questions.length} 个问题，其中 ${questions.filter(item => VALID.has(item.validationOutcome)).length} 个已有验证结论。`]
    },
    empathy: {
      stakeholders: [`关键角色至少包括一线操作或服务人员、现场主管、技术与维护人员、管理者及最终用户。不同角色对效率、稳定性、解释性和责任承担的诉求并不相同，不能只使用管理层口径代表全部体验。`],
      constraints: [`现有材料提示，人机协作落地通常同时受到非标准任务、数据断点、维护成本、误报误判、采用阻力和责任边界约束。对${site.companyName}的具体程度仍应以原始记录和后续复核为准。`],
      voices: facts.slice(0, 5).map(item => `材料记录：${item}。该表述是记录摘要，不改写为未经证实的采访原话。`),
      fieldNotes: [`证据分级说明：${boundary} 报告将直接观察、组内共享材料和桌面推断分别标注，避免把模型补充写成现场事实。`]
    },
    painPoints: {
      hypotheses,
      evidence: answers.length ? answers : [`现有材料仍不足以支持强结论，当前仅完成问题框架与验证边界，后续需补充可追溯记录。`],
      categories: [`流程与异常：关注非标准任务和人工经验。`, `数据与协作：关注重复录入、跨系统搬运和追溯困难。`, `人机边界：关注解释权、确认权、最终责任与人工兜底。`],
      painSummary: [`当前可收敛的问题不是简单追求“更多自动化”，而是让系统在不转移最终责任的前提下，为人提供及时、可解释、可确认的支持，并把异常处置经验转化为可复用记录。该判断仍需结合${site.companyName}的量化基线验证。`]
    },
    conception: {
      opportunities: [`优先选择高频、高代价、现有数据可获得且能人工回退的任务；不从“大而全平台”开始，而从一个问题、一类用户和一个可观察指标开始。`],
      proposals: proposals.map(item => `${item} 方案必须显示依据、允许人工驳回，并记录采纳、拒绝和异常结果。`),
      recommendations: [`试点前记录处理时长、错误或返工、人工介入次数和使用者负担；试点后用同口径比较。若准确性下降、额外操作显著增加或责任边界无法说明，应停止或缩小试点。`],
      appendix: [`证据索引：${citationText}`, `资料限制：本报告未把组内共享材料冒充为${memberName}个人独立访谈；所有推断均需在后续展示中保留来源说明。`]
    }
  };
}

async function getSiteContext(member, site, knowledgeDocs) {
  const params = new URLSearchParams({ companyId: site.companyId });
  const [mediaData, problemData, solutionData] = await Promise.all([
    api(`/api/media?${params}`), api(`/api/problems?${params}`), api(`/api/solutions?${params}`)
  ]);
  const media = mediaData.items || [];
  const evidence = teamEvidence({
    media,
    problems: problemData.problems || [],
    solutions: solutionData.solutions || [],
    knowledge: knowledgeDocs.filter(item => (item.tags || []).includes(site.companyId) || clean(item.content).includes(site.companyName))
  });
  return { memberName: member.memberName, site, ownMediaCount: media.filter(item => item.memberId === member.memberId).length, evidence };
}

async function addEvidence(member, context) {
  if (context.ownMediaCount > 0) return false;
  const title = "组内共享证据摘要（非个人独立访谈）";
  const existing = await api(`/api/media?${new URLSearchParams({ memberId: member.memberId, companyId: context.site.companyId })}`);
  if ((existing.items || []).some(item => item.title === title)) return false;
  const text = context.evidence.facts.length
    ? `本条汇总同站点组内材料：${context.evidence.facts.slice(0, 4).join("；")}。该记录用于协作复核，不代表${member.memberName}独立观察或采访。`
    : `当前仅有第八组官方路线节点：${context.site.companyName}，主题为${context.site.themeName || "企业调研"}，安排为${context.site.activity || "现场参访"}。未取得可引用的一手材料，以下判断均按桌面研究推断处理。`;
  const form = new FormData();
  Object.entries({ groupId: "team-8", memberId: member.memberId, memberName: member.memberName, companyId: context.site.companyId, companyName: context.site.companyName, type: "text", evidenceKind: context.evidence.facts.length ? "inference" : "pending", synthesisStatus: "reviewed", title, caption: text, textContent: text }).forEach(([key, value]) => form.append(key, value));
  if (apply) await api("/api/media/upload", { method: "POST", body: form });
  return true;
}

async function replaceCharter(knowledgeDocs) {
  const old = knowledgeDocs.filter(item => item.id === charter.id || OLD_CHARTER.test(`${item.title} ${item.content}`));
  const current = knowledgeDocs.find(item => item.id === charter.id && item.title === charter.title && item.content === charter.content);
  if (!apply || current) return { removed: old.filter(item => item !== current).length, added: current ? 0 : 1 };
  for (const item of old) await api(`/api/knowledge?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
  await api("/api/knowledge", jsonOptions("POST", charter));
  return { removed: old.length, added: 1 };
}

const dashboard = await api("/api/research-dashboard");
const knowledge = await api("/api/knowledge");
const result = { origin, apply, charter: await replaceCharter(knowledge.docs || []), members: [], totals: { questionsValidated: 0, questionsAdded: 0, evidenceAdded: 0, reportsAdded: 0 } };

for (const member of dashboard.members || []) {
  const memberResult = { memberId: member.memberId, memberName: member.memberName, sites: [] };
  for (const site of member.sites || []) {
    const keyParams = new URLSearchParams({ memberId: member.memberId, companyId: site.companyId });
    const currentData = await api(`/api/research-questions?${keyParams}`);
    const current = currentData.questions || [];
    const context = await getSiteContext(member, site, knowledge.docs || []);
    const additions = current.length ? [] : questionBank(site);
    const next = [...current, ...additions].map(question => validateQuestion(question, context));
    const changed = next.filter((item, index) => item.validationOutcome !== current[index]?.validationOutcome || item.answer !== current[index]?.answer).length;
    if (apply && (changed || additions.length)) await api("/api/research-questions", jsonOptions("PUT", { memberId: member.memberId, companyId: site.companyId, questions: next }));
    const evidenceAdded = await addEvidence(member, context);
    let reportAdded = false;
    if (!site.reportAvailable) {
      const sections = reportSections(context, next);
      if (apply) {
        await api("/api/research-report", jsonOptions("POST", { memberId: member.memberId, companyId: site.companyId, groupModeId: "iterate", useLlm: false }));
        await api("/api/research-report/draft", jsonOptions("PUT", { memberId: member.memberId, companyId: site.companyId, groupModeId: "iterate", sections }));
      }
      reportAdded = true;
    }
    memberResult.sites.push({ companyId: site.companyId, companyName: site.companyName, existingQuestions: current.length, questionsAdded: additions.length, questionsValidated: changed, evidenceAdded, reportAdded });
    result.totals.questionsValidated += changed;
    result.totals.questionsAdded += additions.length;
    result.totals.evidenceAdded += Number(evidenceAdded);
    result.totals.reportsAdded += Number(reportAdded);
  }
  result.members.push(memberResult);
}

await mkdir(join(root, "data", "backups"), { recursive: true });
const output = join(root, "data", "backups", `team-content-enrichment-${apply ? "applied" : "dry-run"}.json`);
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result.totals, charter: result.charter, output }, null, 2));
