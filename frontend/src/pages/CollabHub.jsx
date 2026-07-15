import React, { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Eye, Flag, GitCompareArrows, Lightbulb, Link2, ListChecks, MessageSquarePlus, Quote, RefreshCw, Route, ShieldAlert, Sparkles, Target, Users } from "lucide-react";
import { json, jsonOptions } from "../api.js";
import { AppLink } from "../components/Shell.jsx";
import { ErrorState, Loading, Progress, Tabs } from "../components/Ui.jsx";
import { DEFAULT_MEMBER, TEAM } from "../team.js";

const THOUGHT_TYPES = [
  { value:"observation", label:"现场观察", icon:Eye },
  { value:"hypothesis", label:"待验证假设", icon:Lightbulb },
  { value:"difference", label:"分歧与反例", icon:GitCompareArrows },
  { value:"next", label:"下一步行动", icon:Target }
];

function thoughtType(value){return THOUGHT_TYPES.find(item=>item.value===value)??THOUGHT_TYPES[0]}
function shortText(value,fallback="尚未提交"){const text=String(value??"").trim();return text||fallback}

function MemberPerspective({ profile, selected, onSelect }) {
  const strongest=profile.validated.find(item=>item.answer)?.answer||profile.media[0]?.textContent||profile.media[0]?.caption;
  const openQuestion=profile.pending.find(item=>!item.tags?.includes("external-reference"))?.text||profile.pending[0]?.text;
  return <button type="button" className={`perspective-card ${selected?"selected":""}`} aria-pressed={selected} onClick={onSelect}>
    <header><span>{profile.memberName.slice(0,1)}</span><div><strong>{profile.memberName}</strong><small>{profile.role} · {profile.routes.length} 条线路</small></div><em>{profile.closure}%</em></header>
    <div className="perspective-focus"><small>当前关注</small><p>{shortText(profile.focus,"尚未保存个人调研问题")}</p></div>
    <div className="perspective-insight"><Quote size={13}/><span><small>已有判断</small><p>{shortText(strongest,"等待现场观察或验证结论")}</p></span></div>
    <div className="perspective-open"><Lightbulb size={13}/><span><small>仍待回答</small><p>{shortText(openQuestion,"该成员尚未提交待验证问题")}</p></span></div>
    <footer><span>{profile.updates.length} 提交</span><span>{profile.validated.length} 验证</span><span>{profile.media.length} 证据</span><ArrowRight size={14}/></footer>
  </button>;
}

export function CollabHubPage(){
  const [state,setState]=useState({loading:true,error:""});
  const [statusFilter,setStatusFilter]=useState("active");
  const [memberId,setMemberId]=useState(DEFAULT_MEMBER.id);
  const [companyId,setCompanyId]=useState("");
  const [thoughtFilter,setThoughtFilter]=useState("all");
  const [showComposer,setShowComposer]=useState(false);
  const [composer,setComposer]=useState({memberId:DEFAULT_MEMBER.id,type:"observation",message:"",companyId:""});
  const [busy,setBusy]=useState("");
  const detailRef=useRef(null);
  const load=async()=>{setState(current=>({...current,loading:true,error:""}));try{const [collab,dashboard,problems,solutions,media,teamConfig]=await Promise.all([json("/api/collab"),json("/api/research-dashboard"),json(`/api/problems?groupId=${TEAM.id}`),json(`/api/solutions?groupId=${TEAM.id}`),json(`/api/media?groupId=${TEAM.id}`),json("/api/team-config")]);setState({loading:false,error:"",collab,dashboard,teamConfig,problems:problems.problems??[],solutions:solutions.solutions??[],media:media.items??[]});const first=dashboard.members?.[0]?.sites?.[0];setCompanyId(current=>current||first?.companyId||"");}catch(error){setState({loading:false,error:error.message});}};
  useEffect(()=>{void load();},[]);

  const profiles=useMemo(()=>(state.dashboard?.members??[]).map(member=>{
    const questions=(member.sites??[]).flatMap(site=>(site.questions??[]).map(item=>({...item,companyId:site.companyId,companyName:site.companyName})));
    const validated=questions.filter(item=>["confirmed","partial","refuted"].includes(item.validationOutcome));
    const pending=questions.filter(item=>!validated.includes(item));
    const media=(state.media??[]).filter(item=>item.memberId===member.memberId);
    const problems=(state.problems??[]).filter(item=>item.memberId===member.memberId);
    const solutions=(state.solutions??[]).filter(item=>item.memberId===member.memberId);
    const updates=(state.collab?.updates??[]).filter(item=>item.memberId===member.memberId);
    const routes=[...new Set((member.sites??[]).map(item=>item.routeId))];
    const closure=member.sites?.length?Math.round(member.sites.reduce((sum,item)=>sum+(item.closurePercent||0),0)/member.sites.length):0;
    const focus=updates.find(item=>item.thoughtType==="hypothesis")?.message||validated[0]?.text||questions[0]?.text;
    const role=state.teamConfig?.members?.find(item=>item.id===member.memberId)?.role||"调研员";
    return {...member,role,questions,validated,pending,media,problems,solutions,updates,routes,closure,focus};
  }),[state.dashboard,state.media,state.problems,state.solutions,state.collab,state.teamConfig]);
  const profile=profiles.find(item=>item.memberId===memberId)??profiles[0];
  const sites=profile?.sites??[];
  const site=sites.find(item=>item.companyId===companyId)??sites[0];
  const siteProblems=(state.problems??[]).filter(item=>item.memberId===profile?.memberId&&item.companyId===site?.companyId);
  const siteSolutions=(state.solutions??[]).filter(item=>item.memberId===profile?.memberId&&item.companyId===site?.companyId);
  const updates=(state.collab?.updates??[]).filter(item=>thoughtFilter==="all"||item.thoughtType===thoughtFilter);
  const verifiedInsights=profiles.flatMap(item=>item.validated.filter(question=>question.answer).map(question=>({memberName:item.memberName,companyName:question.companyName,text:question.answer,outcome:question.validationOutcome}))).slice(0,6);
  const unresolved=profiles.flatMap(item=>item.pending.filter(question=>!question.tags?.includes("external-reference")).map(question=>({memberName:item.memberName,companyName:question.companyName,text:question.text}))).slice(0,6);
  const taskDone=state.collab?.tasks?.filter(item=>item.status==="done").length??0;
  const taskTotal=state.collab?.tasks?.length??0;
  const milestoneReady=Math.round((state.dashboard?.summary?.averageClosurePercent||0)*.6+(taskDone/Math.max(1,taskTotal))*20+(profiles.filter(item=>item.updates.length).length/Math.max(1,profiles.length))*20);
  const routeCards=(state.teamConfig?.routes??[]).map(route=>{const assigned=(state.dashboard?.members??[]).flatMap(member=>member.sites??[]).filter(site=>site.routeId===route.id);return{id:route.id,title:`Day ${route.day} · ${route.label}`,members:route.memberIds.map(id=>state.teamConfig.members.find(member=>member.id===id)?.name).filter(Boolean),stops:route.stops.map(stop=>stop.companyName),progress:assigned.length?Math.round(assigned.reduce((sum,item)=>sum+(item.closurePercent||0),0)/assigned.length):0}});
  if(state.loading)return <Loading label="加载全组思考与证据…"/>;
  if(state.error)return <ErrorState message={state.error} onRetry={load}/>;

  async function patchTask(id,status){await json(`/api/collab/tasks/${id}`,jsonOptions("PATCH",{status}));await load();}
  async function publishThought(event){event.preventDefault();const selected=profiles.find(item=>item.memberId===composer.memberId);if(!selected)return;setBusy("publish");try{await json("/api/collab/updates",jsonOptions("POST",{groupId:TEAM.id,memberId:selected.memberId,memberName:selected.memberName,thoughtType:composer.type,companyId:composer.companyId||undefined,companyName:selected.sites.find(item=>item.companyId===composer.companyId)?.companyName,message:composer.message,status:"active"}));setComposer(current=>({...current,message:""}));setShowComposer(false);await load();}finally{setBusy("")}}
  function chooseMember(id, reveal=false){const next=profiles.find(item=>item.memberId===id);setMemberId(id);setCompanyId(next?.sites?.[0]?.companyId||"");if(reveal)requestAnimationFrame(()=>detailRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));}

  return <div className="collab-hub milestone-hub page-pad">
    <header className="collab-hero"><div><Users size={22}/><span><small>第一阶段 Milestone · 全组思考面板</small><h1>我们如何理解“人机共生”</h1><p>五名队员的观察、假设、反例与下一步，共同汇成可评审的证据链。</p></span></div><div><button className="primary-button" onClick={()=>setShowComposer(value=>!value)}><MessageSquarePlus size={13}/>提交个人观点</button><AppLink href="/screen/roadshow">进入路演 <ExternalLink size={12}/></AppLink><button onClick={()=>void load()}><RefreshCw size={13}/>同步</button></div></header>

    <section className="milestone-overview"><div className="milestone-score"><span><Flag size={18}/><small>Milestone 就绪度</small><strong>{milestoneReady}%</strong><Progress value={milestoneReady}/></span><p>{milestoneReady>=60?"已有可汇报主线，继续补齐反例与成员观点。":"当前以问题预设为主，下一步优先补现场证据和个人判断。"}</p></div><div className="milestone-flow">{[["01","观察",state.media.length],["02","验证",state.dashboard.summary?.validatedQuestionCount||0],["03","收敛",state.dashboard.summary?.confirmedProblemCount||0],["04","试验",state.dashboard.summary?.testedSolutionCount||0]].map(([n,label,value],index)=><React.Fragment key={label}><span className={value?"done":""}><small>{n}</small><strong>{label}</strong><em>{value}</em></span>{index<3?<ArrowRight size={14}/>:null}</React.Fragment>)}</div><div className="milestone-actions"><AppLink href="/app">补充现场输入</AppLink><AppLink href="/screen">查看协作拓扑</AppLink><AppLink href="/dashboard">进入四核报告</AppLink></div></section>

    {showComposer?<form className="thought-composer" onSubmit={publishThought}><header><div><MessageSquarePlus size={16}/><span><strong>提交一条可被全组引用的观点</strong><small>说明你看到了什么、依据是什么，或下一步准备怎样验证。</small></span></div><button type="button" onClick={()=>setShowComposer(false)}>取消</button></header><div><select value={composer.memberId} onChange={event=>{const id=event.target.value;setComposer(current=>({...current,memberId:id,companyId:""}))}}>{profiles.map(item=><option key={item.memberId} value={item.memberId}>{item.memberName}</option>)}</select><select value={composer.type} onChange={event=>setComposer(current=>({...current,type:event.target.value}))}>{THOUGHT_TYPES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={composer.companyId} onChange={event=>setComposer(current=>({...current,companyId:event.target.value}))}><option value="">全组主题</option>{(profiles.find(item=>item.memberId===composer.memberId)?.sites??[]).map(item=><option key={`${item.routeId}:${item.companyId}`} value={item.companyId}>{item.companyName}</option>)}</select></div><textarea required value={composer.message} onChange={event=>setComposer(current=>({...current,message:event.target.value}))} placeholder="例如：我观察到……；这意味着……；但还需要用……验证。"/><footer><small>发布后进入全组思考流，不会改动现场证据或验证比例。</small><button className="primary-button" disabled={busy==="publish"}>{busy==="publish"?"发布中…":"发布观点"}</button></footer></form>:null}

    <section className="thinking-section"><header><div><Sparkles size={17}/><span><h2>五人思考矩阵</h2><p>点击成员可展开其提交、问题验证、证据、痛点和方案。</p></span></div><strong>{profiles.filter(item=>item.updates.length).length}/{profiles.length} 已提交观点</strong></header><div className="perspective-grid">{profiles.map(item=><MemberPerspective key={item.memberId} profile={item} selected={item.memberId===profile.memberId} onSelect={()=>chooseMember(item.memberId,true)}/>)}</div></section>

    <section className="synthesis-board"><article className="consensus-column"><header><CheckCircle2 size={16}/><div><h2>已经被证据支持</h2><p>仅展示队员完成验证并写下结论的内容</p></div><strong>{verifiedInsights.length}</strong></header>{verifiedInsights.length?<div>{verifiedInsights.map((item,index)=><blockquote key={`${item.memberName}-${index}`}><p>{item.text}</p><footer>{item.memberName} · {item.companyName}<span>{item.outcome==="confirmed"?"成立":item.outcome==="partial"?"部分成立":"证伪"}</span></footer></blockquote>)}</div>:<div className="milestone-empty"><ShieldAlert/><strong>尚无已验证共识</strong><p>请在队员端为问题选择验证结论，并填写证据来源与认知变化。</p><AppLink href="/app">去完成逐题验证</AppLink></div>}</article><article className="open-column"><header><GitCompareArrows size={16}/><div><h2>分歧、反例与未决问题</h2><p>Milestone 汇报中最值得邀请评委讨论的部分</p></div><strong>{unresolved.length}</strong></header>{unresolved.length?<ol>{unresolved.map((item,index)=><li key={`${item.memberName}-${index}`}><span>{String(index+1).padStart(2,"0")}</span><p>{item.text}<small>{item.memberName} · {item.companyName}</small></p></li>)}</ol>:<div className="milestone-empty"><Lightbulb/><strong>尚无未决问题</strong><p>从路线站点补充一条可以在现场证伪的问题。</p></div>}</article></section>

    <section className="member-deep-dive" ref={detailRef} tabIndex="-1"><header><div><span className="member-avatar">{profile.memberName.slice(0,1)}</span><div><small>当前聚焦成员</small><h2>{profile.memberName}的思考与证据</h2><p>{profile.role} · {profile.routes.length} 条路线 · {profile.updates.length} 条观点提交 · 平均闭环 {profile.closure}%</p></div></div><div className="site-selectors"><select value={profile.memberId} onChange={event=>chooseMember(event.target.value)}>{profiles.map(item=><option key={item.memberId} value={item.memberId}>{item.memberName}</option>)}</select><select value={site?.companyId||""} onChange={event=>setCompanyId(event.target.value)}>{sites.map(item=><option key={`${item.routeId}:${item.companyId}`} value={item.companyId}>{item.companyName}</option>)}</select></div></header><div className="member-deep-grid"><article><header><ListChecks size={15}/><div><h3>{site?.companyName} · 问题验证</h3><p>{site?.validatedQuestionCount||0}/{site?.questions?.length||0} 已得出结论</p></div><strong>{site?.questionValidationPercent||0}%</strong></header><div className="question-list">{(site?.questions??[]).slice(0,8).map((question,index)=><div key={question.id||index}><span>{index+1}</span><p>{question.text}<small>{question.answer||question.evidenceSource||"等待现场回答"}</small></p><em className={question.validationOutcome||"pending"}>{question.validationOutcome==="confirmed"?"成立":question.validationOutcome==="partial"?"部分":question.validationOutcome==="refuted"?"证伪":"待验证"}</em></div>)}</div></article><article className="evidence-chain"><section><header><ShieldAlert size={15}/><div><h3>痛点判断</h3><p>{siteProblems.length} 条</p></div></header>{siteProblems.length?siteProblems.slice(0,5).map(item=><div className="problem-item" key={item.id}><strong>{item.title||item.problemStatement}</strong><p>{item.evidence||item.observation}</p><small>{item.validationOutcome||"pending"}</small></div>):<p className="compact-empty">尚未从问题与留痕收敛痛点</p>}</section><section><header><Link2 size={15}/><div><h3>方案回应</h3><p>{siteSolutions.length} 条</p></div></header>{siteSolutions.length?siteSolutions.slice(0,5).map(item=><div className="solution-item" key={item.id}><strong>{item.title}</strong><p>{item.description}</p><small>{item.validationStatus||"draft"}</small></div>):<p className="compact-empty">确认痛点后再生成最小试点</p>}</section></article></div></section>

    <section className="thought-stream"><header><div><Quote size={16}/><span><h2>全组思考流 · {updates.length} 条</h2><p>保留每一次提交，不截断成员的观察、假设、反例与下一步行动。</p></span></div><Tabs value={thoughtFilter} onChange={setThoughtFilter} items={[{value:"all",label:"全部"},...THOUGHT_TYPES.map(item=>({value:item.value,label:item.label}))]}/></header><div>{updates.length?updates.map(item=>{const meta=thoughtType(item.thoughtType);const Icon=meta.icon;return <article key={item.id}><span className={`thought-icon ${item.thoughtType||"update"}`}><Icon size={15}/></span><div><header><strong>{item.memberName||TEAM.shortName}</strong><em>{item.companyName||"全组主题"}</em><small>{meta.label}</small></header><p>{item.message||item.content||item.title}</p><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div></article>}):<div className="milestone-empty"><Quote/><strong>该分类暂无观点</strong><p>邀请组员提交一条带依据的观察或假设。</p></div>}</div></section>

    <section className="route-milestones"><header><div><Route size={16}/><span><h2>路线推进与成员分工</h2><p>把人的思考重新放回发生它的路线和站点</p></span></div><AppLink href="/screen">打开拓扑 <ExternalLink size={12}/></AppLink></header><div>{routeCards.map((route,index)=><article key={route.id}><span className="group-index">{index+1}</span><div><header><strong>{route.title}</strong><em>{route.progress}%</em></header><p>{route.members.join("、")}</p><small>{route.stops.join(" · ")}</small><Progress value={route.progress} tone="cyan"/></div></article>)}</div></section>

    <section className="collab-operations"><article><header><Archive size={16}/><div><h2>最新现场证据</h2><p>事实材料与个人观点分开保留</p></div><AppLink href="/traces">打开留痕库</AppLink></header><div className="mini-traces">{state.media.length?state.media.slice(0,8).map(item=><span key={item.id}><strong>{item.memberName} · {item.companyName}</strong><small>{item.textContent||item.caption||item.title}</small></span>):<p className="compact-empty">尚未上传现场照片、录音或文字留痕</p>}</div></article><article className="all-tasks"><header><div><h2>Milestone 行动清单</h2><p>{taskDone}/{taskTotal} 已完成</p></div><Tabs value={statusFilter} onChange={setStatusFilter} items={[{value:"active",label:"进行中"},{value:"blocked",label:"受阻"},{value:"done",label:"已完成"},{value:"all",label:"全部"}]}/></header><div>{(state.collab.tasks??[]).filter(item=>statusFilter==="all"||item.status===statusFilter||(statusFilter==="active"&&["todo","active"].includes(item.status))).map(task=><article key={task.id}><button title="切换完成状态" onClick={()=>void patchTask(task.id,task.status==="done"?"active":"done")}>{task.status==="done"?<CheckCircle2/>:<CircleDashed/>}</button><div><strong>{task.title}</strong><p>{task.description||task.body||"按调研路线推进并同步证据"}</p><small>{task.assigneeName||task.memberName||TEAM.shortName} · {task.status}</small></div></article>)}</div></article></section>
  </div>;
}
