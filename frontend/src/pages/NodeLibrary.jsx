import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Search, Sparkles, Users } from "lucide-react";
import { json } from "../api.js";
import { ErrorState, Loading, Tabs } from "../components/Ui.jsx";
import { TEAM } from "../team.js";

export function NodeLibraryPage() {
  const [state, setState] = useState({ loading: true, error: "", dashboard: null, knowledge: null, teamConfig: null });
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("all");
  const [routeId, setRouteId] = useState("all");
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState("");

  useEffect(() => {
    Promise.all([json("/api/research-dashboard"), json("/api/knowledge"), json("/api/team-config")])
      .then(([dashboard, knowledge, teamConfig]) => setState({ loading: false, error: "", dashboard, knowledge, teamConfig }))
      .catch(error => setState(current => ({ ...current, loading: false, error: error.message })));
  }, []);

  const routeLabels = useMemo(() => Object.fromEntries((state.teamConfig?.routes ?? []).map(route => [route.id, `Day ${route.day} · ${route.label}`])), [state.teamConfig]);
  const nodes = useMemo(() => {
    const docs = state.knowledge?.docs ?? [];
    const result = [];
    for (const member of state.dashboard?.members ?? []) {
      for (const site of member.sites ?? []) {
        const doc = docs.find(item => item.tags?.includes(site.companyId) || item.title?.includes(site.companyName));
        result.push({
          ...site,
          id: `${member.memberId}:${site.companyId}:${site.routeId}`,
          memberId: member.memberId,
          memberName: member.memberName,
          description: (doc?.content || `${site.companyName}是${TEAM.theme}已定参访站点，围绕${site.themeName || "企业数字化与人机协作"}开展问题预设、现场验证与方案收敛。`).replace(/\n+/g, " ")
        });
      }
    }
    return result;
  }, [state.dashboard, state.knowledge]);
  const filtered = useMemo(() => nodes.filter(node =>
    (day === "all" || String(node.day) === day) &&
    (routeId === "all" || node.routeId === routeId) &&
    `${node.companyName} ${node.themeName} ${node.description}`.toLowerCase().includes(query.toLowerCase())
  ), [nodes, day, routeId, query]);

  if (state.loading) return <Loading label="加载节点库与调研路线…" />;
  if (state.error) return <ErrorState message={state.error} />;
  const routeTabs = [{ value: "all", label: "全部线路" }, ...(state.teamConfig?.routes ?? []).map(route => ({ value: route.id, label: `D${route.day} ${route.label}` }))];

  return <div className="node-library page-pad">
    <header className="node-library-heading"><div><Sparkles size={18}/><span><small>节点库 · Node Library</small><h1>{TEAM.event}</h1><p>按日程、线路和企业节点查阅路线、背景材料与调研状态。</p></span></div><strong>{TEAM.name} · {TEAM.theme}</strong></header>
    <section className="node-filters"><label><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索站点、企业、标签…"/></label><Tabs value={day} onChange={setDay} items={[{value:"all",label:"全部"},{value:"1",label:"Day 1"},{value:"2",label:"Day 2"},{value:"3",label:"Day 3"}]}/><Tabs value={routeId} onChange={setRouteId} items={routeTabs}/><Tabs value={kind} onChange={setKind} items={[{value:"all",label:"全部"},{value:"schedule",label:"日程"},{value:"company",label:"企业"}]}/></section>
    <section className="node-intro"><span><Sparkles size={23}/></span><div><small>探索中 · {TEAM.name}</small><h2>{TEAM.event}</h2><p>点击日程与企业节点查看过程资产与留痕</p></div><div><strong>{filtered.length}</strong><small>当前节点</small></div></section>
    {kind !== "company" ? <section className="schedule-rails">{[1,2,3].filter(value => day === "all" || Number(day) === value).map(value => <article key={value}><span>Day {value}</span><strong>{filtered.filter(node => node.day === value).length} 个分配节点</strong><small>{[...new Set(filtered.filter(node => node.day === value).map(node => routeLabels[node.routeId]))].join(" · ") || "自由调研"}</small></article>)}</section> : null}
    {kind !== "schedule" ? <section className="node-sections">{[1,2,3].filter(value => day === "all" || Number(day) === value).map(value => { const dayNodes = filtered.filter(node => node.day === value); return dayNodes.length ? <section key={value}><header><CalendarDays size={16}/><div><h2>Day {value}</h2><p>{[...new Set(dayNodes.map(node => routeLabels[node.routeId]))].join(" · ")}</p></div></header><div className="node-grid">{dayNodes.map(node => <button className={selected === node.id ? "selected" : ""} onClick={() => setSelected(current => current === node.id ? "" : node.id)} key={node.id}><div><span className="node-status">{node.closurePercent ? `闭环 ${node.closurePercent}%` : "待走访"}</span><small>{node.themeName || "企业调研"}</small></div><h3>{node.companyName}</h3><p>{node.description}</p><footer><span><Users size={12}/>{node.memberName}</span><span><MapPin size={12}/>{routeLabels[node.routeId]}</span></footer>{selected === node.id ? <aside><strong>过程资产</strong><span>逐题验证 {node.validatedQuestionCount || 0}/{node.questions?.length || 0} · {node.questionValidationPercent||0}%</span><span>现场证据 {node.evidenceCount||0} · 确认痛点 {node.confirmedProblemCount||0}</span><span>关联方案 {node.linkedSolutionCount||0} · 试验结论 {node.testedSolutionCount||0}</span><a href={`/dashboard?memberId=${node.memberId}&companyId=${node.companyId}`}>打开调研报告</a></aside> : null}</button>)}</div></section> : null; })}</section> : null}
  </div>;
}
