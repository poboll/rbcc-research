import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, MonitorPlay, Pause, Play, RefreshCcw, RotateCcw, ScanSearch, Sparkles, Target } from "lucide-react";
import { AppLink } from "../components/Shell.jsx";
import { Loading, Progress, Tabs } from "../components/Ui.jsx";
import { useAsyncJson } from "../hooks.js";
import { DEFAULT_PRESENTATION, loadPresentationSettings, savePresentationSettings } from "../presentation-settings.js";
import { TEAM } from "../team.js";

const SCENES = [
  ["开场","从田野问题到可验证方案","22 个节点、5 名队员、三日七线，共用一条证据链。","overview"],
  ["章节","第一章 · 队员端","先看现场如何产生可复核材料。","chapter"],
  ["队员端","身份与路线","每名队员按日期、线路和站点获得准确任务。","field"],
  ["队员端","预设问题与现场验证","问题可编辑、标注开拓/迭代视角并保存。","field"],
  ["留痕库","图片、录音、文字证据","每条材料挂到成员与站点，后续报告直接引用。","evidence"],
  ["章节","第二章 · 协作大屏","把五个人的进度放进同一张图。","chapter"],
  ["协作大屏","全组 KPI","问题完成、双线验证、留痕和方案实时汇总。","screen"],
  ["协作大屏","问题到方案证据链","方案必须引用已验证问题，避免空泛结论。","screen"],
  ["协作大屏","队员协作拓扑","按成员、路线和站点查看材料缺口。","screen"],
  ["设计模式","大屏参数实时调节","字号、间距、画布边距自动保存，可复制 JSON。","design"],
  ["章节","第三章 · 作战室","从呈现转向日常协同。","chapter"],
  ["作战室","全组与个人视图","按 Day、成员快速聚焦，保持数据来源一致。","screen"],
  ["协同 Hub","任务、受阻项与动态","路线任务状态和现场进展集中管理。","collab"],
  ["章节","第四章 · 调研报告","把材料写成可评审的万字文档。","chapter"],
  ["调研报告","四核结构编辑","现状扫描、人群共情、痛点诊断、分析对策。","report"],
  ["节点库","背景情报与路线资产","支持日程、企业、线路和关键词筛选。","library"],
  ["调研报告","AI 辅助提炼","基于知识库、问题和留痕生成可采纳段落。","agent"],
  ["调研报告","生成并导出 Word","工作稿可编辑，管理员可上传最终 DOCX。","report"],
  ["章节","第五章 · 教师评审","用八分钟看完完整论证路径。","chapter"],
  ["教师评审","报告总览与完成度","按成员查看站点、报告状态和代表深链。","review"],
  ["教师评审","万字正文深链","目录、四核正文、引用与 Word 下载集中呈现。","review"],
  ["扫码入口","手机端现场采集","队员可直接进入身份与路线，无需理解后台结构。","field"],
  ["章节","第六章 · 红八宝","最后看知识如何反哺现场。","chapter"],
  ["红八宝","检索组内知识","优先检索挂载资料、站点情报和团队纪要。","agent"],
  ["红八宝","协作对话与提醒","回答标注来源，支持通知和语音播报。","agent"],
  ["结束","让每个结论都有现场出处","红八宝 · 八爪鱼组，把调研过程完整交付。","end"]
];

const sceneLinks = { field:"/app",evidence:"/traces",screen:"/",design:"/design",collab:"/collab",report:"/dashboard",library:"/library",agent:"/agent",review:"/review" };

export function Roadshow() {
  const { data, loading } = useAsyncJson("/api/research-dashboard");
  const [day, setDay] = useState("all");
  const [scene,setScene]=useState(0);
  const [playing,setPlaying]=useState(false);
  const current=SCENES[scene];
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setScene(value=>value>=SCENES.length-1?(setPlaying(false),value):value+1),4200);return()=>clearInterval(timer);},[playing]);
  useEffect(()=>{const keydown=event=>{if(event.code==="Space"){event.preventDefault();setPlaying(value=>!value)}if(event.key==="ArrowRight")setScene(value=>Math.min(SCENES.length-1,value+1));if(event.key==="ArrowLeft")setScene(value=>Math.max(0,value-1))};window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown)},[]);
  if (loading) return <Loading label="准备路演数据…" />;
  const members = data?.members ?? [];
  const sites = members.flatMap(member => (member.sites ?? []).map(site => ({ ...site, memberName: member.memberName })));
  const next=()=>setScene(value=>Math.min(SCENES.length-1,value+1));
  const previous=()=>setScene(value=>Math.max(0,value-1));
  return <div className="roadshow page-pad">
    <header className="page-heading"><div><MonitorPlay size={20}/><span><small>全功能路演</small><h1>从田野问题到可验证方案</h1></span></div><strong>{TEAM.name} · {TEAM.theme}</strong></header>
    <section className="roadshow-console"><button className="roadshow-start" onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={18}/>:<Play size={18}/>}<span><strong>{playing?"暂停全功能路演":"开始全功能路演"}</strong><small>26 幕自动演示 · 方向键切换 · 空格暂停</small></span></button><div className="roadshow-transport"><button title="上一幕" disabled={scene===0} onClick={previous}><ArrowLeft/></button><button title={playing?"暂停":"播放"} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause/>:<Play/>}</button><button title="下一幕" disabled={scene===SCENES.length-1} onClick={next}><ArrowRight/></button><button title="从头播放" onClick={()=>{setScene(0);setPlaying(true)}}><RotateCcw/></button><strong>{String(scene+1).padStart(2,"0")}</strong><span>/ {SCENES.length}</span></div></section>
    <nav className="scene-rail" aria-label="路演场景">{SCENES.map(([label,title],index)=><button className={scene===index?"active":""} onClick={()=>{setScene(index);setPlaying(false)}} key={`${label}-${index}`}><small>{String(index+1).padStart(2,"0")}</small><span>{label}<em>{title}</em></span></button>)}</nav>
    <section className={`roadshow-stage scene-${current[3]}`} key={scene}><div className="stage-number">{String(scene+1).padStart(2,"0")}</div><div><small>{current[0]}</small><h2>{current[1]}</h2><p>{current[2]}</p>{sceneLinks[current[3]]?<AppLink className="scene-link" href={sceneLinks[current[3]]}>打开对应功能 <ArrowRight size={14}/></AppLink>:null}</div><div className="stage-metrics"><span><strong>{data?.summary?.averageClosurePercent || 0}%</strong>闭环</span><span><strong>{data?.summary?.questionValidationPercent || 0}%</strong>逐题验证</span><span><strong>{data?.summary?.evidenceCount || 0}</strong>证据</span></div></section>
    <section className="roadshow-flow">{[[ScanSearch,"田野证据","观察、原声、照片"],[Target,"痛点收敛","假设逐条验证"],[Sparkles,"AI 方案","只引用已验证问题"],[CheckCircle2,"评审交付","万字报告 + Word"]].map(([Icon,title,text],index)=><React.Fragment key={title}><article><Icon size={22}/><strong>{title}</strong><span>{text}</span></article>{index<3?<ArrowRight size={17}/>:null}</React.Fragment>)}</section>
    <section className="roadshow-sites"><header><h2>路线总览</h2><Tabs value={day} onChange={setDay} items={[{value:"all",label:"全部"},{value:"1",label:"Day 1"},{value:"2",label:"Day 2"},{value:"3",label:"Day 3"}]}/></header><div>{sites.filter(site=>day==="all"||String(site.day)===day).slice(0,24).map(site=><article key={`${site.memberName}-${site.routeId}-${site.companyId}`}><span><strong>{site.companyName}</strong><small>{site.memberName} · 验证 {site.questionValidationPercent||0}% · 闭环 {site.closurePercent||0}%</small></span><Progress value={site.closurePercent||0} tone={site.closurePercent>=60?"cyan":"amber"}/></article>)}</div></section>
  </div>;
}

const controls = [
  ["memberX","队员节点 X",0,80,1,""],["companyX","企业区起始 X",80,220,2,""],["companyWidth","企业列宽",120,260,2,"px"],
  ["columnGap","列间距",8,64,2,"px"],["rowHeight","企业行高",42,90,2,"px"],["expandOffset","展开向下偏移",20,100,2,"px"],
  ["coreGap","四核板块间距",4,32,1,"px"],["assetGap","素材列间距",16,96,2,"px"],["fitPadding","画布适应边距",0,24,1,"%"],["fontScale","节点字号比例",80,125,5,"%"]
];

export function DesignMode() {
  const [settings,setSettings]=useState(loadPresentationSettings);
  const [copied,setCopied]=useState(false);
  function update(key,value){const next={...settings,[key]:Number(value)};setSettings(next);savePresentationSettings(next)}
  function reset(){setSettings({...DEFAULT_PRESENTATION});savePresentationSettings({...DEFAULT_PRESENTATION})}
  async function copy(){await navigator.clipboard.writeText(JSON.stringify(settings,null,2));setCopied(true);setTimeout(()=>setCopied(false),1200)}
  return <div className="design-page page-pad"><header className="page-heading"><div><Sparkles size={20}/><span><small>设计模式</small><h1>协作大屏布局控制台</h1></span></div><div className="design-actions"><button onClick={reset}><RefreshCcw size={13}/>恢复默认</button><button onClick={()=>void copy()}><Copy size={13}/>{copied?"已复制":"复制 JSON"}</button><AppLink href="/screen">关闭</AppLink></div></header><section className="design-layout"><aside className="design-controls"><header><h2>泳道布局（个人视图）</h2><p>拖动滑块 · 实时预览 · 自动保存</p></header>{controls.map(([key,label,min,max,step,suffix])=><label className="range-control" key={key}><span>{label}<strong>{settings[key]}{suffix}</strong></span><input aria-label={`${label} ${settings[key]}`} type="range" min={min} max={max} step={step} value={settings[key]} onChange={event=>update(key,event.target.value)}/></label>)}</aside><div className="design-preview live"><div className="preview-header"><span>RBCC · 全组协作拓扑</span><strong>{settings.fontScale}%</strong></div><div className="preview-lane" style={{"--member-x":`${settings.memberX}px`,"--company-x":`${settings.companyX}px`,"--company-w":`${settings.companyWidth}px`,"--column-gap":`${settings.columnGap}px`,"--row-h":`${settings.rowHeight}px`,fontSize:`${settings.fontScale}%`}}><strong>林耿标</strong>{["速腾聚创","信源物流","安必平医药"].map(name=><span key={name}>{name}</span>)}</div><div className="preview-grid" style={{gap:settings.coreGap}}>{["现状扫描","人群共情","痛点诊断","分析对策"].map((title,index)=><article key={title}><small>0{index+1}</small><h3>{title}</h3><p>事实、原声、判断与待验证项分层呈现。</p></article>)}</div></div></section></div>;
}
