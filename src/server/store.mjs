import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function createStore({ root, persistent = true }) {
  const dataRoot = join(root, "data");
  const deployedRoot = join(dataRoot, "deployed");
  const stateFile = join(dataRoot, "app-state.json");
  let cached;
  let writeQueue = Promise.resolve();

  async function readJson(path, fallback) {
    try { return JSON.parse(await readFile(path, "utf8")); }
    catch { return structuredClone(fallback); }
  }

  async function seed() {
    const [teamConfig, collab, problems, solutions, dashboard, media, knowledge, feed, reports, longReports, destinations, iterations, reviewQuestions] = await Promise.all([
      readJson(join(dataRoot, "team-config.json"), null),
      readJson(join(dataRoot, "collab.json"), { groups: [], members: [], tasks: [], updates: [] }),
      readJson(join(dataRoot, "problems-team-9.json"), { problems: [] }),
      readJson(join(dataRoot, "solutions-team-9.json"), { solutions: [] }),
      readJson(join(deployedRoot, "research-dashboard.json"), { groupId: "team-9", groupName: "流光九径 · 第九组", members: [], summary: {} }),
      readJson(join(deployedRoot, "media.json"), { items: [] }),
      readJson(join(deployedRoot, "knowledge.json"), { docs: [] }),
      readJson(join(deployedRoot, "agent-feed.json"), { items: [] }),
      readJson(join(deployedRoot, "research-reports.json"), {}),
      readJson(join(deployedRoot, "member-long-reports.json"), {}),
      readJson(join(deployedRoot, "member-destinations.json"), {}),
      readJson(join(deployedRoot, "member-report-iterations.json"), {}),
      readJson(join(deployedRoot, "review-member-questions.json"), {})
    ]);
    if (teamConfig?.group?.id === "team-8") return buildTeamState(teamConfig, knowledge.docs ?? []);
    const researchQuestions = {};
    for (const member of dashboard.members ?? []) {
      for (const site of member.sites ?? []) researchQuestions[`${member.memberId}::${site.companyId}`] = site.questions ?? [];
    }
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      collab,
      problems: problems.problems ?? [],
      solutions: solutions.solutions ?? [],
      dashboard,
      media: media.items ?? [],
      knowledgeDocs: knowledge.docs ?? [],
      agentFeed: feed.items ?? [],
      researchQuestions,
      researchReports: reports,
      reportDrafts: {},
      generatedReports: {},
      finalReports: {},
      memberLongReports: longReports,
      destinations,
      iterations,
      reviewQuestions
    };
  }

  async function get() {
    if (!cached) cached = await readJson(stateFile, null) ?? await seed();
    return cached;
  }

  async function persist(value) {
    if (!persistent) return;
    const temp = `${stateFile}.${process.pid}.tmp`;
    await mkdir(dirname(stateFile), { recursive: true });
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temp, stateFile);
  }

  async function update(mutator) {
    writeQueue = writeQueue.then(async () => {
      const state = await get();
      const result = await mutator(state);
      state.updatedAt = new Date().toISOString();
      await persist(state);
      return result;
    });
    return writeQueue;
  }

  return { get, update, dataRoot, deployedRoot };
}

function buildTeamState(config, legacyKnowledge) {
  const memberMap = new Map(config.members.map(member => [member.id, member]));
  const sitesByMember = new Map(config.members.map(member => [member.id, []]));
  const destinations = {};
  const researchQuestions = {};
  const tasks = [];
  const knowledgeDocs = legacyKnowledge.filter(item => item.tags?.some(tag => ["workflow", "team", "route", "method", "rbcc"].includes(String(tag).toLowerCase())));
  for (const route of config.routes) {
    for (const memberId of route.memberIds) {
      const list = sitesByMember.get(memberId) ?? [];
      for (const stop of route.stops) {
        const site = { ...stop, day: route.day, date: route.date, routeId: route.id, routeLabel: route.label, questionsSaved: false, questionsComplete: false, questions: [], questionValidation: [], questionsValidatedCount: 0, pioneerTaggedCount: 0, iterateTaggedCount: 0, pendingTaggedCount: 0 };
        list.push(site);
        researchQuestions[keyFor(memberId, stop.companyId)] = [];
      }
      sitesByMember.set(memberId, list);
      const companyIds = new Set(destinations[memberId]?.companyIds ?? []);
      for (const stop of route.stops) companyIds.add(stop.companyId);
      destinations[memberId] = { memberId, companyIds: [...companyIds], routeConfirmed: true, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    tasks.push({ id: `task-${route.id}`, groupId: config.group.id, title: `Day ${route.day} · ${route.label} 行前确认`, description: `${route.memberIds.map(id => memberMap.get(id)?.name).join("、")}：确认集合、访谈分工、拍摄边界与问题清单`, status: "active", createdAt: new Date().toISOString() });
    for (const stop of route.stops) {
      if (!knowledgeDocs.some(item => item.id === `site-${stop.companyId}`)) knowledgeDocs.push({ id: `site-${stop.companyId}`, title: `${stop.companyName} · 路线节点`, content: `【站点】${stop.companyName}\n【日期】${route.date} · Day ${route.day}\n【线路】${route.label}\n【主题】${stop.themeName}\n【安排】${stop.time ? `${stop.time} · ` : ""}${stop.activity}${stop.meetingPoint ? `\n【集合】${stop.meetingPoint}` : ""}\n走访前需补充企业基本面、关键角色、可验证问题与拍摄边界。`, tags: [stop.companyId, "route", `day-${route.day}`, config.group.id], memberName: "系统", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  }
  const members = config.members.map(member => { const sites = sitesByMember.get(member.id) ?? []; return { memberId: member.id, memberName: member.name, sites, sitesComplete: 0, totalSites: sites.length }; });
  const assignmentCount = members.reduce((sum, member) => sum + member.totalSites, 0);
  const uniqueStops = new Map(config.routes.flatMap(route => route.stops).map(stop => [stop.companyId, stop]));
  const memberLongReports = Object.fromEntries(config.members.map(member => [member.id, { memberId: member.id, memberName: member.name, template: "rbcc", templateLabel: "RBCC 四板块调研报告", targetChars: 10000, generatedAt: new Date().toISOString(), available: false, reports: (sitesByMember.get(member.id) ?? []).map(site => ({ companyId: site.companyId, placeName: site.companyName, filename: `${member.name}-${site.companyName}-调研报告.docx`, day: site.day, groupModeId: "iterate", charCount: 0, available: false })) }]));
  memberLongReports[config.group.id] = { memberId: config.group.id, memberName: config.group.name, template: "rbcc", templateLabel: "第八组场景整合报告", targetChars: 10000, generatedAt: new Date().toISOString(), available: false, reports: [] };
  return {
    version: 3, updatedAt: new Date().toISOString(), teamConfig: config,
    collab: { groups: [{ id: config.group.id, name: config.group.name }], members: config.members.map(member => ({ memberId: member.id, memberName: member.name, role: member.role })), tasks, updates: [{ id: "update-team8-migration", groupId: config.group.id, memberName: config.group.name, message: "第八组新路线已更新，请各成员按 Day 1–3 分线补充预设问题与现场留痕。", status: "active", createdAt: new Date().toISOString() }] },
    problems: [], solutions: [], media: [], agentFeed: [], knowledgeDocs, researchQuestions,
    dashboard: { groupId: config.group.id, groupName: config.group.name, members, summary: { memberCount: config.members.length, uniqueSiteCount: uniqueStops.size, siteAssignmentCount: assignmentCount, sitesQuestionsComplete: 0, sitesValidatedPioneer: 0, sitesValidatedIterate: 0, sitesDualValidated: 0 }, updatedAt: new Date().toISOString() },
    researchReports: {}, reportDrafts: {}, generatedReports: {}, finalReports: {}, memberLongReports, destinations, iterations: {}, reviewQuestions: {}
  };
}

export function keyFor(memberId, companyId) {
  return `${memberId}::${companyId}`;
}
