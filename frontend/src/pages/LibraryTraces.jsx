import React, { useMemo, useRef, useState } from "react";
import { Archive, BookOpen, Camera, FileText, Mic, Plus, Search, Trash2, Upload } from "lucide-react";
import { json, jsonOptions } from "../api.js";
import { Empty, ErrorState, Loading, Tabs } from "../components/Ui.jsx";
import { useAsyncJson } from "../hooks.js";
import { TEAM } from "../team.js";

export function LibraryPage() {
  const { data, loading, error, reload } = useAsyncJson("/api/knowledge");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title:"", content:"", tags:"" });
  const docs = useMemo(() => (data?.docs ?? []).filter(item => `${item.title} ${item.content} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0, 120), [data, query]);
  async function save(event) { event.preventDefault(); await json("/api/knowledge", jsonOptions("POST", { title:form.title, content:form.content, tags:form.tags.split(/[,，、]/).map(item=>item.trim()).filter(Boolean), memberName:"本地恢复版" })); setAdding(false); setForm({title:"",content:"",tags:""}); await reload(); }
  async function remove(id) { if (confirm("确定删除这条组内知识？")) { await json(`/api/knowledge?id=${encodeURIComponent(id)}`, {method:"DELETE"}); await reload(); } }
  if (loading) return <Loading label="加载节点库…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <div className="library-page page-pad"><header className="page-heading"><div><BookOpen size={20} /><span><small>节点库</small><h1>组内调研知识</h1></span></div><button className="primary-button" onClick={() => setAdding(value => !value)}><Plus size={15} />添加知识</button></header><div className="searchbar"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索站点、主题、流程或证据…" /><span>{docs.length} 条结果</span></div>{adding ? <form className="knowledge-form" onSubmit={save}><input required placeholder="标题" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea required placeholder="正文内容" value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/><input placeholder="标签，用逗号分隔" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/><button className="primary-button">保存到组内知识库</button></form> : null}<section className="knowledge-list">{docs.map(doc => <article key={doc.id}><div><FileText size={16} /><span><h2>{doc.title}</h2><small>{doc.memberName || "系统"} · {(doc.tags || []).slice(0,4).join(" · ")}</small></span><button title="删除" onClick={() => void remove(doc.id)}><Trash2 size={14}/></button></div><p>{doc.content}</p></article>)}</section></div>;
}

export function TracesPage() {
  const [type, setType] = useState("all");
  const { data, loading, error, reload } = useAsyncJson(`/api/media?groupId=${TEAM.id}${type === "all" ? "" : `&type=${type}`}`, [type]);
  const items = data?.items ?? [];
  if (loading) return <Loading label="加载留痕库…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <div className="traces-page page-pad"><header className="page-heading"><div><Archive size={20}/><span><small>留痕库</small><h1>现场证据与过程记录</h1></span></div><strong>{items.length} 条</strong></header><Tabs value={type} onChange={setType} items={[{value:"all",label:"全部"},{value:"image",label:"图片",icon:<Camera size={13}/>},{value:"audio",label:"录音",icon:<Mic size={13}/>},{value:"text",label:"文字",icon:<FileText size={13}/>}]} /><section className="trace-grid">{items.slice(0,160).map(item => <article key={item.id}>{item.type==="image"&&item.url?<img className="trace-preview" src={item.url} alt={item.caption||item.title||"现场图片"}/>:item.type==="audio"&&item.url?<audio className="trace-audio" src={item.url} controls/>:<div className={`trace-kind ${item.type}`}>{item.type === "image" ? <Camera/> : item.type === "audio" ? <Mic/> : <FileText/>}</div>}<div><small>{item.memberName} · {item.companyName}</small><h2>{item.title || "现场留痕"}</h2><p>{item.textContent || item.caption || item.fileName || "已上传现场素材"}</p><time>{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ""}</time></div></article>)}</section>{!items.length ? <Empty /> : null}</div>;
}
