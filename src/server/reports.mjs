import { complete, extractJson } from "./llm.mjs";

export const REPORT_BLOCKS = [
  { id: "situation", title: "现状扫描", parts: ["overview", "business", "tech", "process"] },
  { id: "empathy", title: "人群共情", parts: ["stakeholders", "constraints", "voices", "fieldNotes"] },
  { id: "painPoints", title: "痛点诊断", parts: ["hypotheses", "evidence", "categories", "painSummary"] },
  { id: "conception", title: "分析对策", parts: ["opportunities", "proposals", "recommendations", "appendix"] }
];

export function emptySections() {
  return Object.fromEntries(REPORT_BLOCKS.map(block => [block.id, Object.fromEntries(block.parts.map(part => [part, []]))]));
}

export function normalizeSections(value) {
  const result = emptySections();
  for (const block of REPORT_BLOCKS) {
    for (const part of block.parts) {
      const input = value?.[block.id]?.[part];
      result[block.id][part] = Array.isArray(input) ? input.map(String).filter(Boolean) : typeof input === "string" ? input.split(/\n+/).map(item => item.trim()).filter(Boolean) : [];
    }
  }
  return result;
}

function evidenceFor(state, memberId, companyId) {
  const questions = state.researchQuestions[`${memberId}::${companyId}`] ?? [];
  const media = state.media.filter(item => item.memberId === memberId && item.companyId === companyId).slice(0, 80);
  const problems = state.problems.filter(item => item.memberId === memberId && item.companyId === companyId).slice(0, 50);
  const solutions = state.solutions.filter(item => item.memberId === memberId && item.companyId === companyId).slice(0, 30);
  const knowledge = state.knowledgeDocs.filter(item => item.tags?.includes(companyId) || item.content?.includes(companyId)).slice(0, 20);
  return { questions, media, problems, solutions, knowledge };
}

function citationsFor(evidence) {
  return [
    ...evidence.media.map(item=>({id:item.id,type:"evidence",label:item.textContent||item.caption||item.fileName||"现场留痕"})),
    ...evidence.problems.map(item=>({id:item.id,type:"problem",label:item.title||"现场痛点"})),
    ...evidence.solutions.map(item=>({id:item.id,type:"solution",label:item.title||"分析方案"}))
  ].slice(0,80);
}

function compactEvidence(evidence) {
  return JSON.stringify({
    questions: evidence.questions.map(q => ({ text: q.text, answer: q.answer, tags: q.tags, lens: q.lens })).slice(0, 24),
    fieldRecords: evidence.media.map(m => ({ title: m.title, caption: m.caption, text: m.textContent, type: m.type })).slice(0, 30),
    problems: evidence.problems.map(p => ({ title: p.title, observation: p.observation, evidence: p.evidence, outcome: p.validationOutcome })).slice(0, 24),
    solutions: evidence.solutions.map(s => ({ title: s.title, description: s.description, rationale: s.rationale, linkedProblemIds: s.linkedProblemIds })).slice(0, 16),
    knowledge: evidence.knowledge.map(k => ({ title: k.title, content: k.content })).slice(0, 10)
  }).slice(0, 55_000);
}

function findSite(state, memberId, companyId) {
  const member = state.dashboard.members?.find(item => item.memberId === memberId);
  const site = member?.sites?.find(item => item.companyId === companyId);
  return { member, site };
}

function completenessFor(sections) {
  const filled = REPORT_BLOCKS.flatMap(block => block.parts.map(part => sections?.[block.id]?.[part] ?? [])).filter(items => items.length).length;
  return { percent: Math.round(filled / 16 * 100), ready: filled >= 12, missing: [] };
}

export function baseReport(state, memberId, companyId, groupModeId = "iterate") {
  const key = `${memberId}::${companyId}`;
  const saved = state.generatedReports[key] ?? state.researchReports[key];
  if (saved && !saved.error) {
    const draft = state.reportDrafts[key];
    const sections = draft?.sections ?? saved.sections;
    return { ...saved, sections, ...(draft ? { draftSections: sections, hasDraft: true, draftUpdatedAt: draft.updatedAt } : {}), completeness: completenessFor(sections) };
  }
  const { member, site } = findSite(state, memberId, companyId);
  const evidence = evidenceFor(state, memberId, companyId);
  const sections = emptySections();
  sections.situation.overview = [`调研对象：${site?.companyName ?? companyId}`, `调研成员：${member?.memberName ?? memberId}`, `调研视角：${groupModeId === "pioneer" ? "开拓组" : "迭代组"}`];
  sections.empathy.voices = evidence.media.map(item => item.textContent || item.caption).filter(Boolean).slice(0, 8);
  sections.painPoints.hypotheses = evidence.questions.map(item => item.text).filter(Boolean);
  sections.painPoints.evidence = evidence.problems.map(item => item.evidence || item.observation).filter(Boolean);
  sections.conception.proposals = evidence.solutions.map(item => item.description || item.title).filter(Boolean);
  return {
    meta: { title: `${site?.companyName ?? companyId} 实地调研报告`, memberId, memberName: member?.memberName ?? memberId, companyId, companyName: site?.companyName ?? companyId, groupModeId, groupModeLabel: groupModeId === "pioneer" ? "开拓组" : "迭代组", generatedAt: new Date().toISOString(), source:"evidence", version:1 },
    sections,
    autoSections: sections,
    raw: evidence,
    citations:citationsFor(evidence),
    completeness: completenessFor(sections),
    hasDraft: false,
    pillarsAutofilled: true
  };
}

export async function generateLongReport(state, memberId, companyId, groupModeId) {
  const source = baseReport(state, memberId, companyId, groupModeId);
  const evidence = evidenceFor(state, memberId, companyId);
  const context = compactEvidence(evidence);
  const generated = normalizeSections(source.draftSections ?? source.sections);
  let usedLlm = false;
  let fallbackReason;
  for (const block of REPORT_BLOCKS) {
    try {
      const answer = await complete([
        { role: "system", content: "你是 RBCC 企业调研报告编辑。只使用提供的证据；明确区分事实、推断和待验证项。输出严格 JSON 对象，键必须是指定的四个 part key，每个值是 3-7 个完整中文段落组成的字符串数组。文字面向教师评审，避免空话和宣传腔。" },
        { role: "user", content: `为《${source.meta.title}》撰写「${block.title}」，目标 2200-2800 个汉字。键：${block.parts.join(", ")}。\n已有草稿：${JSON.stringify(generated[block.id])}\n证据：${context}` }
      ], { model: process.env.DEEPSEEK_REPORT_MODEL, maxTokens: 3200, timeoutMs: 120_000 });
      const parsed = extractJson(answer);
      if (parsed) {
        for (const part of block.parts) if (Array.isArray(parsed[part])) generated[block.id][part] = parsed[part].map(String).filter(Boolean);
        usedLlm = true;
      }
    } catch (error) {
      fallbackReason = `AI 生成未完成，已保留证据版：${error.message}`;
      break;
    }
  }
  const report = { ...source, sections: generated, generatedAt: new Date().toISOString(), citations:citationsFor(evidence), meta:{...source.meta,source:usedLlm?"ai-generated":"evidence",generatedAt:new Date().toISOString()}, llm: { mode: usedLlm ? "llm" : "fallback", fallbackReason } };
  return report;
}

export function reportText(report) {
  const lines = [report.meta?.title ?? "RBCC 实地调研报告", ""];
  for (const block of REPORT_BLOCKS) {
    lines.push(`${block.title}`, "");
    for (const part of block.parts) {
      for (const paragraph of report.sections?.[block.id]?.[part] ?? []) lines.push(paragraph, "");
    }
  }
  return lines.join("\n").trim();
}
