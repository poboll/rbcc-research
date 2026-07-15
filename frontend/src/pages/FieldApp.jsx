import React, { useEffect, useRef, useState } from "react";
import { Bot, Camera, CheckCircle2, ChevronRight, Download, Lightbulb, Link2, MapPin, Mic, Plus, RefreshCw, Route, Smartphone, Trash2, Upload, UserRound } from "lucide-react";
import { json, jsonOptions } from "../api.js";
import { AppLink } from "../components/Shell.jsx";
import { Empty, Loading, StatusDot, Tabs } from "../components/Ui.jsx";
import { AgentChat } from "./KnowledgeAgent.jsx";
import { MEMBERS, TEAM } from "../team.js";

export function FieldApp({ search }) {
  const [memberId, setMemberId] = useState(() => new URLSearchParams(search).get("memberId") || localStorage.getItem("rbcc-member-id") || "");
  const [tab, setTab] = useState(() => new URLSearchParams(search).get("tab") === "agent" ? "agent" : "route");
  const member = MEMBERS.find(item => item.id === memberId);
  useEffect(() => { if (memberId) localStorage.setItem("rbcc-member-id", memberId); }, [memberId]);
  if (!member) return <IdentityPicker onSelect={setMemberId} />;
  return <div className="field-app"><DesktopLinks/><header className="mobile-header"><div><small>{TEAM.shortName} · 队员端</small><strong>{member.name}</strong></div><button onClick={() => setMemberId("")}><UserRound size={16}/>切换身份</button></header><div className="field-content">{tab === "agent" ? <AgentChat memberId={memberId} memberName={member.name} mobile/> : <RouteCapture member={member}/>}</div><nav className="mobile-nav"><button className={tab === "route" ? "active" : ""} onClick={() => setTab("route")}><Route size={21}/>走访路线</button><button className={tab === "agent" ? "active" : ""} onClick={() => setTab("agent")}><Bot size={21}/>红小八</button></nav></div>;
}

function IdentityPicker({ onSelect }) {
  return <div className="identity-page"><DesktopLinks/><header><div><small>{TEAM.shortName} · 队员端</small><span>请先选择身份</span></div><button title="检查并加载最新版本"><RefreshCw size={15}/>立即更新</button></header><main><div className="phone-mark"><Smartphone size={30}/></div><h1>选择你的身份</h1><p>{TEAM.name} · {TEAM.theme}</p><small className="route-label"><i/>{TEAM.mascot}</small><div className="identity-list">{MEMBERS.map(member => <button key={member.id} onClick={() => onSelect(member.id)}><span className="avatar"><UserRound size={19}/></span><span><strong>{member.name}</strong><small>{member.role}</small></span><ChevronRight size={19}/></button>)}</div><section className="install-hint"><Download size={22}/><span><strong>安装到手机桌面</strong><p>使用浏览器菜单中的「添加到主屏幕」或「安装应用」。</p></span></section></main><nav><span><Route size={21}/>走访路线</span><span><Bot size={21}/>红小八</span></nav></div>;
}

function DesktopLinks(){return <aside className="field-desktop-links"><AppLink href="/screen"><Smartphone size={18}/><span><strong>智能呈现 · 桌面协同</strong><small>查看全组进度、受阻项与路演</small></span></AppLink><nav>{[["/collab","协同 Hub"],["/review","评审"],["/","作战室"],["/library","节点库"],["/knowledge","知识中心"],["/agent","红小八"],["/traces","留痕库"],["/dashboard","调研报告"],["/admin","管理端"]].map(([href,label])=><AppLink key={href} href={href}>{label}</AppLink>)}</nav></aside>}

function RouteCapture({ member }) {
  const [dashboard, setDashboard] = useState(null);
  const [active, setActive] = useState("");
  const [panel, setPanel] = useState("questions");
  const [questions, setQuestions] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState({ title:"", evidence:"", severity:"normal" });
  const [solution, setSolution] = useState({ title:"", description:"" });
  const [problems, setProblems] = useState([]);
  const [solutions, setSolutions] = useState([]);
  const [observations,setObservations]=useState([]);
  const [evidenceKind,setEvidenceKind]=useState("observation");
  const [busy, setBusy] = useState("");
  const [questionDraft, setQuestionDraft] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { json(`/api/research-dashboard?memberId=${member.id}`).then(value => { setDashboard(value); setActive(value.members?.[0]?.sites?.[0]?.companyId || ""); }); }, [member.id]);
  const sites = dashboard?.members?.[0]?.sites ?? [];
  const site = sites.find(item => item.companyId === active);

  async function loadSite() {
    if (!site) return;
    const [questionData, problemData, solutionData] = await Promise.all([
      json(`/api/research-questions?memberId=${member.id}&companyId=${site.companyId}`),
      json(`/api/problems?groupId=${TEAM.id}&memberId=${member.id}&companyId=${site.companyId}`),
      json(`/api/solutions?groupId=${TEAM.id}&memberId=${member.id}&companyId=${site.companyId}`)
    ]);
    setQuestions(questionData.questions ?? []); setQuestionDraft(null); setProblems(problemData.problems ?? []); setSolutions(solutionData.solutions ?? []);
  }
  useEffect(() => { void loadSite(); }, [site?.companyId]);

  async function suggestQuestions() {
    if (!site) return; setBusy("suggest"); setStatus("");
    try { const result = await json("/api/research-report/suggest", jsonOptions("POST", { memberId:member.id, companyId:site.companyId })); setQuestions(result.questions ?? []); setQuestionDraft({dimensions:result.dimensions??[],mode:result.mode,previousCount:questions.length}); setStatus(`已生成 ${result.questions?.length ?? 0} 个新问题，覆盖 ${result.dimensionCount ?? 0} 个调研维度。当前仅为草稿，点击保存后才会替换已保存清单。`); }
    catch (error) { setStatus(error.message); } finally { setBusy(""); }
  }
  async function saveQuestions() {
    if (!site) return; setBusy("questions");
    try { const result=await json("/api/research-questions",jsonOptions("PUT",{memberId:member.id,companyId:site.companyId,questions}));setQuestions(result.questions);setQuestionDraft(null);setStatus("问题清单已保存并同步到报告工作台。"); }
    catch(error){setStatus(error.message)}finally{setBusy("")}
  }
  function addQuestion(){setQuestions(current=>[...current,{id:`q-local-${Date.now()}`,text:"",tags:["待验证"],lens:"pending"}])}

  async function upload(event) {
    event.preventDefault(); if (!site || (!text.trim() && !fileRef.current?.files?.[0])) return;
    const form = new FormData(); form.set("memberId",member.id);form.set("memberName",member.name);form.set("groupId",TEAM.id);form.set("companyId",site.companyId);form.set("companyName",site.companyName);
    const file=fileRef.current?.files?.[0];form.set("type",file?.type?.startsWith("audio/")?"audio":file?"image":"text");form.set("evidenceKind",evidenceKind);form.set("title","现场留痕");form.set("caption",text.trim());if(text.trim())form.set("textContent",text.trim());if(file)form.set("file",file);
    setBusy("upload");setStatus("上传中…");const response=await fetch("/api/media/upload",{method:"POST",body:form});setStatus(response.ok?"已同步到留痕库与证据链":"上传失败");if(response.ok){setText("");if(fileRef.current)fileRef.current.value=""}setBusy("");
  }
  async function addProblem(event){event.preventDefault();if(!site)return;await json("/api/problems",jsonOptions("POST",{...problem,groupId:TEAM.id,memberId:member.id,memberName:member.name,companyId:site.companyId,companyName:site.companyName,validationOutcome:"pending"}));setProblem({title:"",evidence:"",severity:"normal"});setStatus("痛点已加入田野问题库。");await loadSite()}
  async function addSolution(event){event.preventDefault();if(!site)return;await json("/api/solutions",jsonOptions("POST",{...solution,groupId:TEAM.id,memberId:member.id,memberName:member.name,companyId:site.companyId,companyName:site.companyName,linkedProblemIds:problems.slice(0,3).map(item=>item.id)}));setSolution({title:"",description:""});setStatus("方案已创建并挂钩当前问题记录。");await loadSite()}
  async function synthesize(action){if(!site)return;setBusy(`synth-${action}`);setStatus("");try{const result=await json("/api/evidence/synthesize",jsonOptions("POST",{action,memberId:member.id,memberName:member.name,companyId:site.companyId,companyName:site.companyName,observations}));if(action==="observations"){setObservations(result.observations??[]);setStatus(`已从留痕提取 ${result.observations?.length??0} 条观察点，请人工复核。`)}else if(action==="problem")setStatus("已将观察点收敛为待确认痛点。");else if(action==="solution")setStatus("已基于确认痛点生成关联方案。");else setStatus(`已将证据链加入报告，共引用 ${result.addedRefs??0} 条记录。`);await loadSite()}catch(error){setStatus(error.message)}finally{setBusy("")}}
  async function validateProblem(id,outcome){await json(`/api/problems/${id}`,jsonOptions("PATCH",{validationOutcome:outcome}));setStatus(outcome==="confirmed"?"痛点已由队员确认，可用于生成方案。":"痛点已标记为不成立。");await loadSite()}

  if (!dashboard) return <Loading label="加载参访路线…"/>;
  return <div className="route-capture"><header><div><MapPin size={23}/><span><small>{member.name} · 三日调研路线</small><h1>现场调研工作台</h1></span></div><StatusDot label="本地服务已连接"/></header><div className="site-scroller">{sites.map(item=><button className={item.companyId===active?"active":""} onClick={()=>{setActive(item.companyId);setPanel("questions")}} key={`${item.routeId}:${item.companyId}`}><strong>{item.companyName}</strong><small>Day {item.day} · {item.routeLabel} · {item.themeName}</small></button>)}</div>{site?<section className="field-workspace"><header><div><small>当前站点 · Day {site.day} · {site.routeLabel}</small><h2>{site.companyName}</h2><p>{site.activity} · {site.themeName}</p></div><AppLink href={`/dashboard?memberId=${member.id}&companyId=${site.companyId}`}>打开报告</AppLink></header><Tabs value={panel} onChange={setPanel} items={[{value:"questions",label:`预设问题 ${questions.length}`},{value:"capture",label:"现场留痕"},{value:"evidence",label:`痛点与方案 ${problems.length}/${solutions.length}`}]}/>
    {panel==="questions"?<div className="field-questions"><div className="field-panel-actions"><button onClick={addQuestion}><Plus size={15}/>添加问题</button><button onClick={()=>void suggestQuestions()} disabled={!!busy}><Lightbulb size={15}/>{busy==="suggest"?"生成中…":"AI 生成 18 问"}</button><button className="primary-button" onClick={()=>void saveQuestions()} disabled={!!busy}><CheckCircle2 size={15}/>保存清单</button></div>{questionDraft?<div className="question-draft-notice"><Bot size={16}/><span><strong>AI 新草稿 · 尚未保存</strong><small>覆盖 {questionDraft.dimensions.length} 个维度{questionDraft.previousCount?` · 原已保存 ${questionDraft.previousCount} 问仍在服务器中`:""}</small></span><div>{questionDraft.dimensions.slice(0,6).map(item=><i key={item}>{item}</i>)}</div></div>:null}{questions.map((question,index)=><article key={question.id||index}><span>{index+1}</span><label><textarea value={question.text||""} onChange={event=>setQuestions(current=>current.map((item,i)=>i===index?{...item,text:event.target.value}:item))} placeholder="输入一个可在现场观察或访谈验证的问题"/>{question.dimension||question.target?<small>{[question.dimension,question.target,question.method].filter(Boolean).join(" · ")}</small>:null}</label><select value={question.lens||"pending"} onChange={event=>setQuestions(current=>current.map((item,i)=>i===index?{...item,lens:event.target.value}:item))}><option value="pending">待验证</option><option value="pioneer">开拓</option><option value="iterate">迭代</option></select><button title="删除" onClick={()=>setQuestions(current=>current.filter((_,i)=>i!==index))}><Trash2 size={15}/></button></article>)}{!questions.length?<Empty/>:null}</div>:null}
    {panel==="capture"?<div className="capture-stack"><form className="capture-card" onSubmit={upload}><select value={evidenceKind} onChange={event=>setEvidenceKind(event.target.value)}><option value="observation">现场观察</option><option value="quote">访谈原声</option><option value="metric">数字指标</option><option value="anomaly">异常流程</option><option value="pending">待验证判断</option></select><textarea value={text} onChange={event=>setText(event.target.value)} placeholder="记录现场观察、访谈原声、数字、异常流程或待验证结论…"/><label className="file-button"><Camera size={19}/><Mic size={19}/><span>选择图片或录音</span><input ref={fileRef} type="file" accept="image/*,audio/*"/></label><button className="primary-button" disabled={busy==="upload"}><Upload size={17}/>{busy==="upload"?"上传中…":"上传并进入证据链"}</button></form><section className="synthesis-panel"><header><Bot size={17}/><div><h3>Agent 证据推进</h3><p>所有生成内容均需队员确认，不会把推断当作事实。</p></div></header><div><button disabled={!!busy} onClick={()=>void synthesize("observations")}>1. 从留痕生成观察点</button><button disabled={!!busy||!observations.length} onClick={()=>void synthesize("problem")}>2. 收敛为待确认痛点</button><button disabled={!!busy||!problems.some(item=>item.validationOutcome==="confirmed")} onClick={()=>void synthesize("solution")}>3. 从确认痛点生成方案</button><button disabled={!!busy} onClick={()=>void synthesize("report")}>4. 一键加入四核报告</button></div>{observations.length?<ol>{observations.map((item,index)=><li key={`${item.sourceId}-${index}`}><span>{item.kind}</span>{item.text}<small>{item.sourceId}</small></li>)}</ol>:null}</section></div>:null}
    {panel==="evidence"?<div className="field-evidence"><form onSubmit={addProblem}><h3><Lightbulb size={16}/>记录现场痛点</h3><input required value={problem.title} onChange={event=>setProblem({...problem,title:event.target.value})} placeholder="痛点标题"/><textarea required value={problem.evidence} onChange={event=>setProblem({...problem,evidence:event.target.value})} placeholder="支持该痛点的现场事实或原声"/><select value={problem.severity} onChange={event=>setProblem({...problem,severity:event.target.value})}><option value="normal">一般</option><option value="high">高优先级</option></select><button className="primary-button">加入问题库</button></form><form onSubmit={addSolution}><h3><Link2 size={16}/>提出分析方案</h3><input required value={solution.title} onChange={event=>setSolution({...solution,title:event.target.value})} placeholder="方案标题"/><textarea required value={solution.description} onChange={event=>setSolution({...solution,description:event.target.value})} placeholder="方案如何回应已记录痛点，以及如何验证"/><small>提交时自动挂钩当前站点最近 {Math.min(3,problems.length)} 条问题</small><button className="primary-button">创建方案</button></form><section><h3>证据链状态</h3><p>问题 {problems.length} 条 · 方案 {solutions.length} 份</p>{problems.slice(0,6).map(item=><span className="problem-review" key={item.id}><strong>{item.title}</strong><small>{item.validationOutcome||"pending"}</small>{item.validationOutcome==="pending"?<div><button onClick={()=>void validateProblem(item.id,"confirmed")}>确认成立</button><button onClick={()=>void validateProblem(item.id,"rejected")}>不成立</button></div>:null}</span>)}</section></div>:null}{status?<p className="form-status field-status">{status}</p>:null}</section>:<Empty/>}</div>;
}
