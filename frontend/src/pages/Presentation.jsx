import React, { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, MonitorPlay, Pause, Play, ScanSearch, Sparkles, Target } from "lucide-react";
import { useAsyncJson } from "../hooks.js";
import { TEAM } from "../team.js";
import { Loading, Progress, Tabs } from "../components/Ui.jsx";

export function Roadshow() {
  const { data, loading } = useAsyncJson("/api/research-dashboard");
  const [day, setDay] = useState("all");
  const [scene,setScene]=useState(0);const [playing,setPlaying]=useState(false);
  const scenes=["开场","章节 · 队员端","队员端 · 身份","队员端 · 路线","留痕库","章节 · 协作大屏","协作大屏 · KPI","协作大屏 · 证据链","协作大屏 · 拓扑","设计模式","章节 · 作战室","作战室","协同 Hub","章节 · 报告","调研报告 · 四核","节点库","调研报告 · AI","调研报告 · Word","章节 · 评审","教师评审 · 总览","教师评审 · 深链","扫码入口","章节 · 红小八","红小八 · 检索","红小八 · 对话","结束"];
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setScene(current=>current>=scenes.length-1?(setPlaying(false),current):current+1),2600);return()=>clearInterval(timer);},[playing]);
  if (loading) return <Loading label="准备路演数据…" />;
  const members = data?.members ?? [];
  const sites = members.flatMap(member => (member.sites ?? []).map(site => ({ ...site, memberName: member.memberName })));
  return <div className="roadshow page-pad">
    <header className="page-heading"><div><MonitorPlay size={20} /><span><small>全功能路演</small><h1>从田野问题到可验证方案</h1></span></div><strong>{TEAM.name} · {TEAM.theme}</strong></header>
    <section className="roadshow-console"><button className="roadshow-start" onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={18}/>:<Play size={18}/>}<span><strong>{playing?"暂停全功能路演":"开始全功能路演"}</strong><small>26 幕自动演示 · 幕间过渡 · 下一幕预加载 · 空格暂停</small></span></button><div><strong>{String(scene+1).padStart(2,"0")}</strong><span>/ 26</span><p>{scenes[scene]}</p></div></section>
    <nav className="scene-rail" aria-label="路演场景">{scenes.map((label,index)=><button className={scene===index?"active":""} onClick={()=>{setScene(index);setPlaying(false)}} key={`${label}-${index}`}><small>{String(index+1).padStart(2,"0")}</small><span>{label}</span></button>)}</nav>
    <section className="roadshow-stage">
      <div className="stage-number">01</div><div><h2>{data?.summary?.uniqueSiteCount || 21} 个参访节点，不做“企业打卡”</h2><p>每个站点都从调研前预设问题开始，以现场观察、访谈原声和留痕验证，最后把痛点与方案挂钩。</p></div>
      <div className="stage-metrics"><span><strong>{data?.summary?.siteAssignmentCount || 0}</strong>人次</span><span><strong>{data?.summary?.sitesQuestionsComplete || 0}</strong>问题完成</span><span><strong>{data?.summary?.uniqueSiteCount || 0}</strong>节点</span></div>
    </section>
    <section className="roadshow-flow">{[[ScanSearch,"田野证据","观察、原声、照片"],[Target,"痛点收敛","假设逐条验证"],[Sparkles,"AI 方案","只引用已验证问题"],[CheckCircle2,"评审交付","万字报告 + Word"]].map(([Icon,title,text], index) => <React.Fragment key={title}><article><Icon size={22} /><strong>{title}</strong><span>{text}</span></article>{index < 3 ? <ArrowRight size={17} /> : null}</React.Fragment>)}</section>
    <section className="roadshow-sites"><header><h2>路线总览</h2><Tabs value={day} onChange={setDay} items={[{value:"all",label:"全部"},{value:"1",label:"Day 1"},{value:"2",label:"Day 2"},{value:"3",label:"Day 3"}]} /></header><div>{sites.filter(site => day === "all" || String(site.day) === day).slice(0, 24).map(site => <article key={`${site.memberName}-${site.companyId}`}><span><strong>{site.companyName}</strong><small>{site.memberName} · {site.themeName}</small></span><Progress value={site.questionsComplete ? 100 : 40} tone={site.questionsComplete ? "cyan" : "amber"} /></article>)}</div></section>
  </div>;
}

export function DesignMode() {
  const [density, setDensity] = useState("balanced");
  const [focus, setFocus] = useState("evidence");
  const [copied,setCopied]=useState(false);
  function reset(){setDensity("balanced");setFocus("evidence")}
  async function copy(){await navigator.clipboard.writeText(JSON.stringify({density,focus},null,2));setCopied(true);setTimeout(()=>setCopied(false),1200)}
  return <div className={`design-page page-pad density-${density}`}>
    <header className="page-heading"><div><Sparkles size={20} /><span><small>设计模式</small><h1>调研呈现控制台</h1></span></div><div className="design-actions"><button onClick={reset}>恢复默认</button><button onClick={()=>void copy()}>{copied?"已复制":"复制 JSON"}</button><a href="/screen" aria-label="关闭设计模式">关闭</a></div></header>
    <section className="design-layout">
      <aside className="design-controls">
        <label>信息密度<Tabs value={density} onChange={setDensity} items={[{value:"compact",label:"紧凑"},{value:"balanced",label:"均衡"},{value:"open",label:"展开"}]} /></label>
        <label>评审焦点<Tabs value={focus} onChange={setFocus} items={[{value:"evidence",label:"证据"},{value:"people",label:"人群"},{value:"solution",label:"方案"}]} /></label>
        <div className="token-list"><span><i className="swatch cyan" />现场事实</span><span><i className="swatch rose" />人物原声</span><span><i className="swatch amber" />待验证问题</span><span><i className="swatch violet" />分析对策</span></div>
      </aside>
      <div className="design-preview"><div className="preview-header"><span>RBCC · 调研报告</span><strong>{focus === "evidence" ? "证据链视图" : focus === "people" ? "人群共情视图" : "方案验证视图"}</strong></div><div className="preview-grid">{["现状扫描","人群共情","痛点诊断","分析对策"].map((title,index) => <article key={title}><small>0{index+1}</small><h3>{title}</h3><p>{index === 0 ? "从业务、流程与数字化底数出发。" : index === 1 ? "记录一线角色、诉求与真实顾虑。" : index === 2 ? "预设问题经现场证据逐条收敛。" : "方案必须挂钩已验证问题记录。"}</p></article>)}</div></div>
    </section>
  </div>;
}
