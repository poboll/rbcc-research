import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, BookOpen, Database, FileCheck2, FileSearch, FileText, FileUp, Link2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, json, jsonOptions } from "../api.js";
import { AppLink } from "../components/Shell.jsx";
import { Empty, ErrorState, Loading, Tabs } from "../components/Ui.jsx";
import { TEAM } from "../team.js";

export function KnowledgeCenterPage() {
  const [state, setState] = useState({ loading: true, error: "", docs: [], sources: [], stats: null });
  const [tab, setTab] = useState("sources");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", tags: "", content: "" });
  const fileRef = useRef(null);

  async function load() {
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const [knowledge, sources, stats] = await Promise.all([json("/api/knowledge"), json("/api/knowledge/sources"), json("/api/knowledge?stats=1")]);
      setState({ loading: false, error: "", docs: knowledge.docs ?? [], sources: sources.sources ?? [], stats });
    } catch (error) { setState(current => ({ ...current, loading: false, error: error.message })); }
  }
  useEffect(() => { void load(); }, []);

  async function mount(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true); setNotice("");
    try {
      const data = new FormData();
      data.set("groupId", TEAM.id); data.set("title", form.title); data.set("tags", form.tags); data.set("uploadedBy", "知识管理员"); data.set("file", file);
      const result = await (await api("/api/knowledge/upload", { method: "POST", body: data })).json();
      setNotice(`已挂载「${result.source.title}」，生成 ${result.chunkCount} 个检索片段。`);
      setForm({ title: "", tags: "", content: "" }); fileRef.current.value = "";
      await load();
    } catch (error) { setNotice(error.message); }
    finally { setUploading(false); }
  }

  async function search(event) {
    event?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try { setResults((await json(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=24`)).results ?? []); setTab("search"); setNotice(""); }
    catch (error) { setNotice(`检索失败：${error.message}`); }
    finally { setSearching(false); }
  }

  async function addManual(event) {
    event.preventDefault();
    await json("/api/knowledge", jsonOptions("POST", { title: form.title, content: form.content, tags: form.tags.split(/[,，、]/).map(item => item.trim()).filter(Boolean), memberName: "知识管理员" }));
    setForm({title:"",tags:"",content:""}); setAdding(false); await load();
  }

  async function removeSource(id) {
    if (!confirm("删除该资料来源及其全部索引片段？")) return;
    await json(`/api/knowledge/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const filteredDocs = useMemo(() => state.docs.filter(item => `${item.title} ${item.content} ${(item.tags ?? []).join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100), [state.docs, query]);
  if (state.loading) return <Loading label="加载知识中心…"/>;
  if (state.error) return <ErrorState message={state.error} onRetry={load}/>;

  return <div className="knowledge-center page-pad">
    <header className="knowledge-heading"><div><BookOpen size={22}/><span><small>知识运营 · 证据入口</small><h1>调研知识中心</h1><p>挂载团队资料，建立可追溯检索片段，为红小八与万字报告提供引用依据。</p></span></div><div className="knowledge-heading-actions"><AppLink href={`/agent${query.trim()?`?prompt=${encodeURIComponent(`请基于知识库分析：${query.trim()}`)}`:""}`}><Bot size={14}/>交给红小八</AppLink><button onClick={() => void load()}><RefreshCw size={14}/>刷新索引</button></div></header>
    <section className="knowledge-flow" aria-label="知识进入调研产出的流程">{[["01",FileUp,"资料挂载","PDF / DOCX / 纪要"],["02",Database,"解析索引","来源与片段可追溯"],["03",Search,"检索验证","查企业、证据与痛点"],["04",Bot,"红小八提炼","事实、推断、待验证"],["05",FileCheck2,"报告引用","进入四核报告"]].map(([index,Icon,title,text],step)=><React.Fragment key={index}><article><span>{index}</span><Icon size={16}/><div><strong>{title}</strong><small>{text}</small></div></article>{step<4?<ArrowRight size={14}/>:null}</React.Fragment>)}</section>
    <section className="knowledge-kpis"><span><Database/><strong>{state.stats?.mountedSources||0}</strong><small>挂载来源</small></span><span><FileSearch/><strong>{state.stats?.indexedChunks||0}</strong><small>索引片段</small></span><span><FileText/><strong>{state.stats?.customDocs||0}</strong><small>知识条目</small></span></section>
    <form className="knowledge-search" onSubmit={search}><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索企业、路线、访谈原声、痛点或方案…"/><button disabled={searching}>{searching?"检索中":"检索知识"}</button></form>
    {notice && tab !== "sources" ? <div className="knowledge-notice">{notice}</div> : null}
    <Tabs value={tab} onChange={setTab} items={[{value:"sources",label:"资料挂载"},{value:"search",label:`检索命中 ${results.length}`},{value:"docs",label:`知识条目 ${filteredDocs.length}`}]}/>
    {tab === "sources" ? <div className="knowledge-source-layout"><form className="source-upload" onSubmit={mount}><FileUp size={25}/><h2>挂载团队资料</h2><p>支持 PDF、DOCX、Markdown、TXT、CSV 和 JSON，单文件不超过 25MB。</p><input placeholder="资料标题（留空使用文件名）" value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/><input placeholder="标签，例如：Day1、信源物流、访谈" value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})}/><label><FileUp size={17}/><span>选择资料文件</span><input ref={fileRef} required type="file" accept=".pdf,.docx,.md,.markdown,.txt,.csv,.json"/></label><button className="primary-button" disabled={uploading}>{uploading?"抽取并索引中…":"挂载并建立索引"}</button>{notice?<p className="form-status">{notice}</p>:null}</form><section className="source-list"><header><div><h2>已挂载来源</h2><p>每条来源保留文件、字符数、标签与索引状态</p></div><button onClick={()=>setAdding(value=>!value)}><Plus size={13}/>手工知识</button></header>{adding?<form className="manual-knowledge" onSubmit={addManual}><input required placeholder="知识标题" value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/><textarea required placeholder="输入调研方法、企业背景或现场纪要" value={form.content} onChange={event=>setForm({...form,content:event.target.value})}/><input placeholder="标签" value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})}/><button className="primary-button">保存知识</button></form>:null}{state.sources.map(source=><article key={source.id}><FileText size={16}/><div><strong>{source.title}</strong><small>{source.originalName} · {source.charCount?.toLocaleString()} 字 · {(source.tags??[]).join(" · ")||"未分类"}</small></div><span>{source.status}</span><button title="删除来源" onClick={()=>void removeSource(source.id)}><Trash2 size={14}/></button></article>)}{!state.sources.length?<Empty/>:null}</section></div> : null}
    {tab === "search" ? <><section className="knowledge-handoff"><div><Link2 size={16}/><span><strong>把检索结果继续用于调研</strong><small>红小八会带着当前问题检索知识；报告编辑台用于整理引用后的正式产出。</small></span></div><AppLink href={`/agent?prompt=${encodeURIComponent(`请基于知识库分析“${query.trim()}”，区分事实、推断与待验证项，并给出下一步。`)}`}><Bot size={14}/>询问红小八</AppLink><AppLink href="/dashboard"><FileCheck2 size={14}/>进入报告</AppLink></section><section className="knowledge-results">{results.map(item=><article key={`${item.sourceKind}-${item.id}`}><header><strong>{item.title}</strong><span>相关度 {item.score}</span></header><p>{item.content}</p><footer><small>{item.sourceKind==="mounted"?`来源片段 ${(item.position??0)+1}`:"知识条目"} · {(item.tags??[]).join(" · ")||"未分类"}</small><AppLink href={`/agent?prompt=${encodeURIComponent(`请结合“${item.title}”分析：${query.trim()}`)}`}>继续提问 <ArrowRight size={12}/></AppLink></footer></article>)}{!results.length?<Empty>没有命中。可换一个关键词，或先在“资料挂载”中添加团队资料。</Empty>:null}</section></> : null}
    {tab === "docs" ? <section className="knowledge-doc-grid">{filteredDocs.map(doc=><article key={doc.id}><header><FileText size={14}/><strong>{doc.title}</strong></header><p>{doc.content}</p><small>{doc.memberName||"系统"} · {(doc.tags??[]).join(" · ")}</small></article>)}</section> : null}
  </div>;
}
