import React, { useEffect, useMemo, useState } from "react";
import { Bot, Download, FileText, RefreshCw, Save, Sparkles } from "lucide-react";
import { api, downloadBlob, json, jsonOptions } from "../api.js";
import { ErrorState, Loading, Progress } from "../components/Ui.jsx";
import { AgentChat } from "./KnowledgeAgent.jsx";
import { DEFAULT_MEMBER, TEAM } from "../team.js";

const BLOCKS = [
  {id:"situation",index:"一",title:"现状扫描",subtitle:"还原业务形态、流程机制与数字化底数",parts:[["overview","调研概况"],["business","企业/产地基本面"],["tech","技术与智能化水平"],["process","核心流程与组织"]]},
  {id:"empathy",index:"二",title:"人群共情",subtitle:"走近服务对象、一线角色与利益相关方",parts:[["stakeholders","关键角色与诉求"],["constraints","现场约束与顾虑"],["voices","访谈原声与观察"],["fieldNotes","走访留痕与笔记"]]},
  {id:"painPoints",index:"三",title:"痛点诊断",subtitle:"预设问题 → 现场验证 → 收敛核心痛点",parts:[["hypotheses","走访前预设问题"],["evidence","现场验证与证据链"],["categories","痛点归类"],["painSummary","痛点陈述（验证后收敛）"]]},
  {id:"conception",index:"四",title:"分析对策",subtitle:"围绕已验证痛点提出 AI 解决方案",parts:[["opportunities","方案机会"],["proposals","解决方案构想"],["recommendations","结论与推进建议"],["appendix","附录"]]}
];

function sectionsToTexts(sections) {
  const result = {};
  for (const block of BLOCKS) for (const [key] of block.parts) result[`${block.id}.${key}`] = (sections?.[block.id]?.[key] ?? []).join("\n");
  return result;
}
function textsToSections(texts) {
  const result = {};
  for (const block of BLOCKS) { result[block.id] = {}; for (const [key] of block.parts) result[block.id][key] = (texts[`${block.id}.${key}`] || "").split(/\n+/).map(item=>item.trim()).filter(Boolean); }
  return result;
}

export function DashboardPage({search=""}) {
  const initialParams=useMemo(()=>new URLSearchParams(search),[search]);
  const [dashboard, setDashboard] = useState(null);
  const [memberId, setMemberId] = useState(()=>initialParams.get("memberId")||DEFAULT_MEMBER.id);
  const [companyId, setCompanyId] = useState(()=>initialParams.get("companyId")||"");
  const [report, setReport] = useState(null);
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(()=>{json("/api/research-dashboard").then(value=>{setDashboard(value);if(!companyId){const selected=value.members?.find(item=>item.memberId===memberId)??value.members?.[0];setCompanyId(selected?.sites?.[0]?.companyId||"");}}).catch(e=>setError(e.message));},[]);
  const member = dashboard?.members?.find(item=>item.memberId===memberId) ?? dashboard?.members?.[0];
  const sites = member?.sites ?? [];
  const site = sites.find(item=>item.companyId===companyId) ?? sites[0];
  useEffect(()=>{if(!site)return;setBusy("load");setError("");json(`/api/research-report?memberId=${member.memberId}&companyId=${site.companyId}&groupModeId=iterate`).then(value=>{setReport(value);setTexts(sectionsToTexts(value.draftSections??value.sections));}).catch(e=>setError(e.message)).finally(()=>setBusy(""));},[member?.memberId,site?.companyId]);
  const completion = useMemo(()=>{let filled=0;for(const block of BLOCKS)for(const [key]of block.parts)if((texts[`${block.id}.${key}`]||"").trim())filled++;return Math.round(filled/16*100);},[texts]);
  if(!dashboard)return error?<ErrorState message={error}/>:<Loading label="加载调研报告工作台…"/>;
  async function save(){setBusy("save");try{const result=await json("/api/research-report/draft",jsonOptions("PUT",{memberId:member.memberId,companyId:site.companyId,groupModeId:"iterate",sections:textsToSections(texts)}));setReport(current=>({...current,draftSections:result.draft.sections,hasDraft:true,draftUpdatedAt:result.draft.updatedAt}));}catch(e){setError(e.message);}finally{setBusy("");}}
  async function generate(){setBusy("generate");setError("");try{const value=await json("/api/research-report",jsonOptions("POST",{memberId:member.memberId,companyId:site.companyId,groupModeId:"iterate",groupId:TEAM.id,useLlm:true}));setReport(value);setTexts(sectionsToTexts(value.sections));}catch(e){setError(e.message);}finally{setBusy("");}}
  async function download(){setBusy("download");try{const response=await api("/api/research-report",jsonOptions("POST",{memberId:member.memberId,companyId:site.companyId,groupModeId:"iterate",groupId:TEAM.id,useLlm:false,format:"docx"}));await downloadBlob(response,`${site.companyName}-调研报告.docx`);}finally{setBusy("");}}
  return <div className="dashboard-page page-pad"><header className="page-heading"><div><FileText size={20}/><span><small>调研报告</small><h1>四核报告工作台</h1></span></div><div className="dashboard-actions"><button onClick={()=>void save()} disabled={!!busy}><Save size={14}/>{busy==="save"?"保存中…":"保存修正"}</button><button className="primary-button" onClick={()=>void generate()} disabled={!!busy}><Sparkles size={14}/>{busy==="generate"?"AI 分段生成中…":"生成万字报告"}</button><button onClick={()=>void download()} disabled={!!busy}><Download size={14}/>导出 Word</button></div></header>
    <section className="dashboard-context"><label>调研成员<select value={member.memberId} onChange={event=>{setMemberId(event.target.value);const next=dashboard.members.find(item=>item.memberId===event.target.value);setCompanyId(next?.sites?.[0]?.companyId||"");}}>{dashboard.members.map(item=><option key={item.memberId} value={item.memberId}>{item.memberName}</option>)}</select></label><label>走访站点<select value={site?.companyId||""} onChange={event=>setCompanyId(event.target.value)}>{sites.map(item=><option key={item.companyId} value={item.companyId}>{item.companyName}</option>)}</select></label><div className="completion"><span>当前完整度 <strong>{completion}%</strong></span><Progress value={completion}/></div></section>
    {error?<ErrorState message={error}/>:null}{busy==="load"?<Loading label="加载站点报告…"/>:null}
    {report?<div className="dashboard-grid"><section className="report-editor">{BLOCKS.map(block=><article className={`editor-block ${block.id}`} key={block.id}><header><span>{block.index}</span><div><h2>{block.title}</h2><p>{block.subtitle}</p></div></header>{block.parts.map(([key,title])=><label key={key}><span>{title}<small>{(report.autoSections?.[block.id]?.[key]??[]).length} 条系统参考</small></span><textarea rows={Math.min(10,Math.max(4,(texts[`${block.id}.${key}`]||"").split("\n").length+1))} value={texts[`${block.id}.${key}`]||""} onChange={event=>setTexts(current=>({...current,[`${block.id}.${key}`]:event.target.value}))} placeholder="每行一条：修正或补充现场一手信息…"/></label>)}</article>)}</section><aside className="report-agent"><AgentChat memberId={member.memberId} memberName={member.memberName} companyId={site.companyId} companyName={site.companyName}/></aside></div>:null}
  </div>;
}
