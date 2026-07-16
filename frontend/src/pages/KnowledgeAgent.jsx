import React, { useEffect, useRef, useState } from "react";
import { Bot, BookOpen, Send, Sparkles, UserRound } from "lucide-react";
import { json, jsonOptions } from "../api.js";
import { Loading } from "../components/Ui.jsx";
import { Markdown } from "../components/Markdown.jsx";
import { AGENT_ICON, AGENT_NAME, DEFAULT_MEMBER, TEAM } from "../team.js";

const SUGGESTIONS = ["RBCC 四步流程是什么？", "中科新知是做什么的？", "开拓组和迭代组有什么区别？", "目前最大的证据缺口是什么？"];

export function AgentChat({ memberId = DEFAULT_MEMBER.id, memberName = DEFAULT_MEMBER.name, companyId, companyName, mobile = false, initialPrompt = "" }) {
  const [messages, setMessages] = useState([{ id:"welcome", role:"assistant", content:`我是 **${AGENT_NAME}**。我会优先检索问题库、现场留痕、知识库和方案；资料未覆盖时，也可以用通识知识补充回答，并明确标注来源层级：\n\n- **本组事实**：有现场记录或知识来源支持\n- **通识补充**：来自模型常识，不作为本组证据\n- **待验证**：仍需要队员补充证据` }]);
  const [input, setInput] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("knowledge");
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, busy]);
  async function ask(text) {
    const message = text.trim();
    if (!message || busy) return;
    const user = { id:`u-${Date.now()}`, role:"user", content:message };
    setMessages(current => [...current, user]); setInput(""); setBusy(true);
    try {
      const history = [...messages, user].filter(item => item.id !== "welcome").slice(-8).map(item => ({role:item.role,content:item.content}));
      const result = await json("/api/agent/chat", jsonOptions("POST", { message, history, groupId:TEAM.id, memberId, memberName, companyId, companyName }));
      setMode(result.mode); setMessages(current => [...current, { id:`a-${Date.now()}`, role:"assistant", content:result.reply, citations:result.citations }]);
    } catch (error) { setMessages(current => [...current, {id:`e-${Date.now()}`,role:"assistant",content:`暂时无法连接：${error.message}`}]); }
    finally { setBusy(false); }
  }
  return <section className={mobile ? "agent-chat mobile" : "agent-chat"}>
    <header><span className="agent-avatar"><img src={AGENT_ICON} alt=""/></span><div><h2>{AGENT_NAME} <Sparkles size={13}/></h2><p>协同 Agent · {mode === "llm" ? "DeepSeek 增强" : "知识库检索"}</p></div></header>
    <div className="chat-messages">{messages.map(message => <article className={message.role} key={message.id}><span>{message.role === "user" ? <UserRound size={14}/> : <img src={AGENT_ICON} alt=""/>}</span><div><Markdown className="chat-markdown">{message.content}</Markdown>{message.citations?.length ? <aside><small>引用知识库</small>{message.citations.slice(0,3).map(item => <span key={item.id}>· {item.title}</span>)}</aside> : null}</div></article>)}{busy ? <div className="chat-thinking"><Loading compact label={`${AGENT_NAME}正在组织回答…`} /></div> : null}<div ref={endRef}/></div>
    <div className="chat-suggestions">{SUGGESTIONS.map(text => <button disabled={busy} onClick={() => void ask(text)} key={text}>{text}</button>)}</div>
    <form onSubmit={event => {event.preventDefault();void ask(input);}}><input value={input} onChange={event=>setInput(event.target.value)} placeholder={`问${AGENT_NAME}，或让它帮你提炼调研材料…`}/><button disabled={busy || !input.trim()} title="发送"><Send size={17}/></button></form>
  </section>;
}

export function AgentPage({ search = "" }) {
  const [status, setStatus] = useState(null);
  const initialPrompt = new URLSearchParams(search).get("prompt") || "";
  const [memberId, setMemberId] = useState(DEFAULT_MEMBER.id);
  const [companyId, setCompanyId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [knowledge,setKnowledge]=useState({docs:[],stats:null});const [showSetup,setShowSetup]=useState(()=>localStorage.getItem("rbcc-agent-setup")!=="done");const [voice,setVoice]=useState(()=>localStorage.getItem("rbcc-agent-voice")==="on");const [adding,setAdding]=useState(false);const [form,setForm]=useState({title:"",content:"",tags:""});
  const loadKnowledge=()=>Promise.all([json("/api/knowledge"),json("/api/knowledge?stats=1")]).then(([docs,stats])=>setKnowledge({docs:docs.docs??[],stats}));
  useEffect(() => { Promise.all([json("/api/llm/status"),json("/api/research-dashboard"),loadKnowledge()]).then(([llm,dash])=>{setStatus(llm);setDashboard(dash);setCompanyId(dash.members?.[0]?.sites?.[0]?.companyId || "");}); }, []);
  useEffect(()=>{if(!voice)return;localStorage.setItem("rbcc-agent-voice","on");localStorage.setItem("rbcc-agent-setup","done");if("speechSynthesis" in window)speechSynthesis.speak(new SpeechSynthesisUtterance(`${AGENT_NAME}语音播报已开启`));setShowSetup(false)},[voice]);
  if (!status || !dashboard) return <Loading label={`连接${AGENT_NAME}与知识库…`} />;
  const member = dashboard.members.find(item=>item.memberId===memberId) || dashboard.members[0];
  const sites = member?.sites ?? [];
  const site = sites.find(item=>item.companyId===companyId) || sites[0];
  async function addKnowledge(event){event.preventDefault();await json("/api/knowledge",jsonOptions("POST",{title:form.title,content:form.content,tags:form.tags.split(/[,，、]/).map(item=>item.trim()).filter(Boolean),memberName:member.memberName}));setForm({title:"",content:"",tags:""});setAdding(false);await loadKnowledge();}
  async function enableNotify(){if("Notification" in window)await Notification.requestPermission();localStorage.setItem("rbcc-agent-setup","done");setShowSetup(false);}
  return <div className="agent-page page-pad"><header className="page-heading"><div><img className="agent-brand-mark" src={AGENT_ICON} alt=""/><span><small>{AGENT_NAME}</small><h1>调研协同 Agent</h1></span></div><span className={status.configured ? "llm-ready" : "llm-offline"}>{status.configured ? `${status.provider} · ${status.model}` : "知识库模式"}</span></header>{showSetup?<section className="agent-setup"><div><img className="agent-brand-mark small" src={AGENT_ICON} alt=""/><span><strong>让{AGENT_NAME}及时播报队友留痕</strong><small>可选开启浏览器通知和语音提示</small></span></div><button onClick={()=>void enableNotify()}>开启通知</button><button onClick={()=>setVoice(true)}>开启语音</button><button onClick={()=>setShowSetup(false)}>稍后</button></section>:null}<section className="agent-context"><label>队员<select value={memberId} onChange={event=>{setMemberId(event.target.value);const next=dashboard.members.find(item=>item.memberId===event.target.value);setCompanyId(next?.sites?.[0]?.companyId||"");}}>{dashboard.members.map(item=><option value={item.memberId} key={item.memberId}>{item.memberName}</option>)}</select></label><label>当前站点<select value={site?.companyId||""} onChange={event=>setCompanyId(event.target.value)}>{sites.map(item=><option value={item.companyId} key={item.companyId}>{item.companyName}</option>)}</select></label><div><BookOpen size={15}/><span>{AGENT_NAME}优先检索该站点资料，未命中时使用 DeepSeek 通识补充并明确标注。{voice?"语音提示已开启。":""}</span></div></section><div className="agent-workspace"><AgentChat memberId={member.memberId} memberName={member.memberName} companyId={site?.companyId} companyName={site?.companyName} initialPrompt={initialPrompt}/><aside className="knowledge-side"><section><header><h2>知识库构成</h2><strong>{knowledge.stats?.totalChunks||0} 条</strong></header><div className="knowledge-stats">{Object.entries(knowledge.stats?.byCategory||{}).map(([key,value])=><span key={key}><small>{key}</small><strong>{value}</strong></span>)}</div></section><section><header><div><h2>组内知识库</h2><small>{AGENT_NAME}会优先检索</small></div><button onClick={()=>setAdding(value=>!value)}>添加</button></header>{adding?<form onSubmit={addKnowledge}><input required placeholder="标题，如：信源物流走访纪要" value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/><textarea required placeholder="正文内容" value={form.content} onChange={event=>setForm({...form,content:event.target.value})}/><input placeholder="标签" value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})}/><button>保存</button></form>:null}<div className="knowledge-side-list">{knowledge.docs.slice(0,12).map(doc=><article key={doc.id}><strong>{doc.title}</strong><p>{doc.content}</p></article>)}</div></section></aside></div></div>;
}
