import React, { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, Camera, ExternalLink, FileText, Maximize2, Minimize2, Mic, Plus, Search, Trash2, X } from "lucide-react";
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
  const [preview, setPreview] = useState(null);
  const [previewMode, setPreviewMode] = useState("width");
  const { data, loading, error, reload } = useAsyncJson(`/api/media?groupId=${TEAM.id}${type === "all" ? "" : `&type=${type}`}`, [type]);
  const items = data?.items ?? [];
  useEffect(() => {
    if (!preview) return undefined;
    const close = event => { if (event.key === "Escape") setPreview(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [preview]);
  if (loading) return <Loading label="加载留痕库…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <div className="traces-page page-pad">
    <header className="page-heading"><div><Archive size={20}/><span><small>留痕库</small><h1>现场证据与过程记录</h1><p>按成员与站点保存图片、录音和文字，点击图片可查看原始证据。</p></span></div><strong>{items.length} 条</strong></header>
    <Tabs value={type} onChange={setType} items={[{value:"all",label:"全部"},{value:"image",label:"图片",icon:<Camera size={13}/>},{value:"audio",label:"录音",icon:<Mic size={13}/>},{value:"text",label:"文字",icon:<FileText size={13}/>}]}/>
    <section className="trace-grid">{items.slice(0,160).map(item => <article className={`trace-card ${item.type}`} key={item.id}>
      {item.type==="image"&&item.url?<button className="trace-media-button" type="button" onClick={()=>{setPreviewMode("width");setPreview(item)}} aria-label={`预览图片：${item.caption||item.title||item.fileName||"现场图片"}`}><img className="trace-preview" src={item.url} alt={item.caption||item.title||"现场图片"} loading="lazy"/><span><Maximize2 size={16}/>查看原图</span></button>:item.type==="audio"&&item.url?<div className="trace-audio-wrap"><span><Mic size={20}/></span><audio className="trace-audio" src={item.url} controls preload="metadata"/></div>:<div className={`trace-kind ${item.type}`}>{item.type === "image" ? <Camera/> : item.type === "audio" ? <Mic/> : <FileText/>}</div>}
      <div className="trace-card-body"><small>{item.memberName || "未标记成员"} · {item.companyName || "未标记站点"}</small><h2>{item.title || "现场留痕"}</h2><p>{item.textContent || item.caption || readableFileName(item.fileName) || "已上传现场素材"}</p><time>{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ""}</time></div>
    </article>)}</section>
    {!items.length ? <Empty /> : null}
    {preview?<div className="trace-lightbox" role="dialog" aria-modal="true" aria-label="现场图片预览" onMouseDown={event=>{if(event.target===event.currentTarget)setPreview(null)}}><div className={`trace-lightbox-panel ${previewMode}`}>
      <header><div><small>{preview.memberName || "未标记成员"} · {preview.companyName || "未标记站点"}</small><strong>{preview.title || "现场留痕"}</strong></div><div className="trace-view-controls"><button className={previewMode==="fit"?"active":""} type="button" onClick={()=>setPreviewMode("fit")} title="适应窗口"><Minimize2 size={17}/><span>适应窗口</span></button><button className={previewMode==="width"?"active":""} type="button" onClick={()=>setPreviewMode("width")} title="铺满宽度"><Maximize2 size={17}/><span>铺满宽度</span></button><button type="button" onClick={()=>setPreview(null)} title="关闭预览" aria-label="关闭预览"><X size={20}/></button></div></header>
      <div className="trace-lightbox-image"><img src={preview.url} alt={preview.caption||preview.title||"现场图片原图"}/></div>
      <footer><div><p>{preview.textContent || preview.caption || readableFileName(preview.fileName) || "该图片暂无文字说明"}</p><time>{preview.createdAt ? new Date(preview.createdAt).toLocaleString("zh-CN") : ""}</time></div><a href={preview.url} target="_blank" rel="noreferrer">新窗口打开<ExternalLink size={15}/></a></footer>
    </div></div>:null}
  </div>;
}

function readableFileName(value) {
  if (!value) return "";
  try {
    const bytes = Uint8Array.from([...value].map(character => character.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal:true }).decode(bytes);
    const cjk = text => (text.match(/[\u3400-\u9fff]/g) || []).length;
    return cjk(decoded) > cjk(value) ? decoded : value;
  } catch { return value; }
}
