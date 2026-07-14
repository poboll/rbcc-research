import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Lightbulb, RefreshCw, Route, Search, ShieldCheck } from "lucide-react";
import { json } from "../api.js";
import { ReportRows } from "../components/ReportRows.jsx";
import { ErrorState, Loading, Progress, StatusDot } from "../components/Ui.jsx";
import { TEAM } from "../team.js";

function Metric({ value, label, tone }) {
  return <span className={`metric ${tone || ""}`}><strong>{value}</strong><small>{label}</small></span>;
}

export function WarRoom({ screen = false }) {
  const [state, setState] = useState({ loading: true, error: null, dashboard: null, media: null, problems: null, solutions: null });
  const load = async () => {
    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const [dashboard, media, problems, solutions] = await Promise.all([
        json("/api/research-dashboard"), json(`/api/media?groupId=${TEAM.id}&stats=1`), json(`/api/problems?groupId=${TEAM.id}`), json(`/api/solutions?groupId=${TEAM.id}`)
      ]);
      setState({ loading: false, error: null, dashboard, media, problems, solutions });
    } catch (error) { setState(current => ({ ...current, loading: false, error: error.message })); }
  };
  useEffect(() => { void load(); }, []);
  const summary = state.dashboard?.summary ?? {};
  const problemCount = state.problems?.problems?.length ?? 0;
  const solutionCount = state.solutions?.solutions?.length ?? 0;
  const linked = state.solutions?.solutions?.filter(item => item.linkedProblemIds?.length).length ?? 0;
  const reportPercent = Math.round((summary.sitesQuestionsComplete || 0) / Math.max(1, summary.siteAssignmentCount || 47) * 100);
  const lanes = useMemo(() => state.dashboard?.members ?? [], [state.dashboard]);
  if (state.loading) return <Loading label="加载作战室数据…" />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  return <div className={screen ? "warroom screen-mode" : "warroom"}>
    <section className="overview-bar">
      <span>全组视图</span>
      <span className="muted">· 以队员为起点 · 公司 · 调研内容 · 素材</span>
    </section>
    <section className="kpi-bar">
      <small>八组 KPI</small>
      <Metric value="59%" label="综合" tone="green" />
      <Metric value={`${summary.sitesQuestionsComplete || 0}/${summary.siteAssignmentCount || 47}`} label="问题" tone="cyan" />
      <Metric value={`0/${summary.siteAssignmentCount || 47}`} label="双线" tone="violet" />
      <Metric value={state.media?.total || 0} label="留痕" tone="amber" />
      <Metric value={problemCount} label="问题库" />
      <Progress value={59} />
      <button className="quiet-button" onClick={() => void load()}><RefreshCw size={13} />同步</button>
    </section>
    <section className="flow-strip">
      <div><Search size={14} /><span><strong>① 田野调研</strong><small>每人选站点 · 每站留证据</small></span></div>
      <div><Lightbulb size={14} /><span><strong>② 提出方案</strong><small>必须引用问题记录</small></span><StatusDot label="" /></div>
      <div><ShieldCheck size={14} /><span><strong>③ 验证答辩</strong><small>方案到引用闭环</small></span></div>
    </section>
    <section className="evidence-strip">
      <div><Link2 size={14} /><span>证据链</span><strong>田野问题 {problemCount} 条</strong></div>
      <div><span>方案</span><strong>{solutionCount} 份</strong><span>已挂钩</span><strong>{linked} 条</strong></div>
      <div className="report-progress"><span>报告完整度</span><strong>{reportPercent}%</strong><Progress value={reportPercent} tone="violet" /></div>
    </section>
    <ReportRows compact />
    <section className="topology">
      <header><div><Route size={15} /><strong>调研协作拓扑</strong><span>队员 → 参访企业 → 四核板块 → 素材</span></div><button className="quiet-button"><RefreshCw size={13} />适应画布</button></header>
      <div className="lane-board">
        {lanes.map(member => <article className="member-lane" key={member.memberId}>
          <div className="lane-owner"><strong>{member.memberName}</strong><small>{member.sitesComplete}/{member.totalSites} 站问题</small></div>
          <div className="lane-sites">{member.sites?.map(site => <span key={site.companyId} className={site.questionsComplete ? "complete" : "pending"} title={site.companyName}><CheckCircle2 size={11} />{site.companyName}</span>)}</div>
        </article>)}
      </div>
    </section>
    <footer className="statusbar">实时 · {TEAM.name} · 小组就绪 · 数据更新 {new Date(state.dashboard.updatedAt).toLocaleString("zh-CN")}</footer>
  </div>;
}
