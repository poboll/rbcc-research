import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Lightbulb, Maximize2, Minus, Play, Plus, RefreshCw, Route, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import { json } from "../api.js";
import { ReportRows } from "../components/ReportRows.jsx";
import { ErrorState, Loading, Progress, StatusDot } from "../components/Ui.jsx";
import { TEAM } from "../team.js";
import { loadPresentationSettings } from "../presentation-settings.js";

function Metric({ value, label, tone }) {
  return <span className={`metric ${tone || ""}`}><strong>{value}</strong><small>{label}</small></span>;
}

export function WarRoom({ screen = false, search = "" }) {
  const initialMemberId = new URLSearchParams(search).get("memberId") || "";
  const [state, setState] = useState({ loading: true, error: null, dashboard: null, media: null, problems: null, solutions: null });
  const [view,setView]=useState(initialMemberId ? "member" : "all");
  const [day,setDay]=useState("all");
  const [memberId,setMemberId]=useState(initialMemberId);
  const [zoom,setZoom]=useState(1);
  const [demo,setDemo]=useState(false);
  const [settings,setSettings]=useState(loadPresentationSettings);
  const [selectedSite,setSelectedSite]=useState(null);
  const load = async () => {
    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const [dashboard, media, problems, solutions] = await Promise.all([
        json("/api/research-dashboard"), json(`/api/media?groupId=${TEAM.id}`), json(`/api/problems?groupId=${TEAM.id}`), json(`/api/solutions?groupId=${TEAM.id}`)
      ]);
      setState({ loading: false, error: null, dashboard, media, problems, solutions });
    } catch (error) { setState(current => ({ ...current, loading: false, error: error.message })); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const refresh = event => { if (event.type === "rbcc:research-updated" || event.key === "rbcc-research-updated") void load(); };
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("rbcc:research-updated", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("rbcc:research-updated", refresh); window.removeEventListener("storage", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(()=>{const listener=event=>setSettings(event.detail);window.addEventListener("rbcc:presentation-settings",listener);return()=>window.removeEventListener("rbcc:presentation-settings",listener)},[]);
  useEffect(()=>{if(!demo)return;const timer=setInterval(()=>setDay(value=>value==="all"?"1":value==="1"?"2":value==="2"?"3":"all"),3200);return()=>clearInterval(timer)},[demo]);
  const summary = state.dashboard?.summary ?? {};
  const problemCount = state.problems?.problems?.length ?? 0;
  const solutionCount = state.solutions?.solutions?.length ?? 0;
  const linked = state.solutions?.solutions?.filter(item => item.linkedProblemIds?.length).length ?? 0;
  const reportPercent = Math.round((summary.reportReadyCount || 0) / Math.max(1, summary.siteAssignmentCount || 1) * 100);
  const evidenceCount=state.media?.items?.length??0;
  const questionPercent=summary.questionValidationPercent||0;
  const evidencePercent=Math.min(100,Math.round(evidenceCount/Math.max(1,summary.siteAssignmentCount||1)*100));
  const solutionPercent=Math.min(100,Math.round(linked/Math.max(1,problemCount)*100));
  const overall=summary.averageClosurePercent||0;
  const lanes = useMemo(() => (state.dashboard?.members ?? []).filter(member=>(view==="all"||member.memberId===memberId)).map(member=>({...member,sites:(member.sites??[]).filter(site=>day==="all"||String(site.day)===day)})), [state.dashboard,view,memberId,day]);
  if (state.loading) return <Loading label="加载作战室数据…" />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  return <div className={screen ? "warroom screen-mode" : "warroom"}>
    <section className="overview-bar warroom-controls">
      <div className="view-switch"><button className={view==="all"?"active":""} onClick={()=>setView("all")}><Users size={12}/>全组视图</button><button className={view==="member"?"active":""} onClick={()=>{setView("member");setMemberId(value=>value||lanes[0]?.memberId||state.dashboard?.members?.[0]?.memberId)}}><UserRound size={12}/>个人泳道</button></div>
      {view==="member"?<select aria-label="选择队员" value={memberId} onChange={event=>setMemberId(event.target.value)}>{state.dashboard.members.map(member=><option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}</select>:null}
      <div className="day-switch">{["all","1","2","3"].map(value=><button className={day===value?"active":""} onClick={()=>setDay(value)} key={value}>{value==="all"?"全部":`Day ${value}`}</button>)}</div>
      <button className={demo?"active":""} onClick={()=>setDemo(value=>!value)}><Play size={12}/>{demo?"停止演示":"Day 演示"}</button>
    </section>
    <section className="kpi-bar">
      <small>八组 KPI</small>
      <Metric value={`${overall}%`} label="综合" tone="green" />
      <Metric value={`${questionPercent}%`} label="逐题验证" tone="cyan" />
      <Metric value={`${summary.sitesDualValidated || 0}/${summary.siteAssignmentCount || 0}`} label="双线" tone="violet" />
      <Metric value={evidenceCount} label="留痕" tone="amber" />
      <Metric value={problemCount} label="问题库" />
      <Progress value={overall} />
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
      <header><div><Route size={15} /><strong>调研协作拓扑</strong><span>队员 → 参访企业 → 四核板块 → 素材</span></div><div className="canvas-tools"><button title="缩小" onClick={()=>setZoom(value=>Math.max(.7,value-.1))}><Minus/></button><span>{Math.round(zoom*100)}%</span><button title="放大" onClick={()=>setZoom(value=>Math.min(1.3,value+.1))}><Plus/></button><button title="适应画布" onClick={()=>setZoom(1)}><Maximize2/></button></div></header>
      <div className="lane-viewport" style={{padding:`${settings.fitPadding}px`}}><div className="lane-board" style={{transform:`scale(${zoom})`,transformOrigin:"top left",fontSize:`${settings.fontScale}%`,gap:settings.coreGap}}>
        {lanes.map(member => <article className="member-lane" key={member.memberId}>
          <div className="lane-owner"><strong>{member.memberName}</strong><small>{member.sitesComplete}/{member.totalSites} 站问题</small></div>
          <div className="lane-sites">{member.sites?.map(site => <button key={`${site.routeId}:${site.companyId}`} className={site.closurePercent ? "complete" : "pending"} title={site.companyName} onClick={()=>setSelectedSite({memberId:member.memberId,memberName:member.memberName,...site})}><CheckCircle2 size={11} />{site.companyName}<small>{site.questionValidationPercent||0}%验证 · {site.closurePercent||0}%闭环</small></button>)}</div>
        </article>)}
      </div></div>
      {selectedSite?<aside className="topology-inspector"><header><div><small>{selectedSite.memberName} · Day {selectedSite.day} · 闭环 {selectedSite.closurePercent||0}%</small><h3>{selectedSite.companyName}</h3></div><button onClick={()=>setSelectedSite(null)}>×</button></header><div className="topology-chain"><span>逐题验证<strong>{selectedSite.validatedQuestionCount||0}/{selectedSite.questions?.length||0}</strong></span><i>→</i><span>现场证据<strong>{selectedSite.evidenceCount||0}</strong></span><i>→</i><span>确认痛点<strong>{selectedSite.confirmedProblemCount||0}</strong></span><i>→</i><span>关联方案<strong>{selectedSite.linkedSolutionCount||0}</strong></span><i>→</i><span>试验结论<strong>{selectedSite.testedSolutionCount||0}</strong></span></div><div><a href={`/app?memberId=${selectedSite.memberId}`}>补充现场材料</a><a href={`/dashboard?memberId=${selectedSite.memberId}&companyId=${selectedSite.companyId}`}>打开报告工作台</a></div></aside>:null}
    </section>
    <footer className="statusbar">实时 · {TEAM.name} · 小组就绪 · 数据更新 {new Date(state.dashboard.updatedAt).toLocaleString("zh-CN")}</footer>
  </div>;
}
