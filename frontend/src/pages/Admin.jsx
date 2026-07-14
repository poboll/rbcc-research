import React, { useEffect, useRef, useState } from "react";
import { Archive, Database, Download, FileUp, LockKeyhole, RefreshCw, Route, ShieldCheck, Users } from "lucide-react";
import { api, downloadBlob } from "../api.js";
import { Empty, ErrorState, Loading, Tabs } from "../components/Ui.jsx";
import { TEAM } from "../team.js";

const TOKEN_KEY = "rbcc-admin-token";

async function adminJson(path, token, options = {}) {
  const response = await api(path, { ...options, headers: { ...(options.headers ?? {}), "x-admin-token": token } });
  return response.json();
}

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [state, setState] = useState({ loading: false, data: null, error: "" });
  const [tab, setTab] = useState("overview");
  const [memberId, setMemberId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { if (token) void load(token); }, []);

  async function load(activeToken = token) {
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const data = await adminJson("/api/admin/summary", activeToken);
      setState({ loading: false, data, error: "" });
      const first = data.dashboard?.members?.[0];
      setMemberId(current => current || first?.memberId || "");
      setCompanyId(current => current || first?.sites?.[0]?.companyId || "");
    } catch (error) { setState({ loading: false, data: null, error: error.message }); }
  }

  async function login(event) {
    event.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, draftToken);
    setToken(draftToken);
    await load(draftToken);
  }

  const member = state.data?.dashboard?.members?.find(item => item.memberId === memberId) ?? state.data?.dashboard?.members?.[0];
  const sites = member?.sites ?? [];
  const site = sites.find(item => item.companyId === companyId) ?? sites[0];
  async function uploadReport(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !member || !site) return;
    setUploading(true); setNotice("");
    try {
      const form = new FormData();
      form.set("memberId", member.memberId); form.set("companyId", site.companyId); form.set("uploadedBy", "管理员"); form.set("published", "true"); form.set("file", file);
      await api("/api/admin/report-upload", { method: "POST", headers: { "x-admin-token": token }, body: form });
      setNotice("管理员定稿已上传并发布到评审下载入口。");
      fileRef.current.value = "";
      await load();
    } catch (error) { setNotice(error.message); }
    finally { setUploading(false); }
  }

  async function exportData() {
    const response = await api("/api/admin/export", { headers: { "x-admin-token": token } });
    await downloadBlob(response, "rbcc-team8-data.json");
  }

  if (!token || (!state.data && !state.loading && !state.error)) return <div className="admin-login page-pad"><form onSubmit={login}><LockKeyhole size={28}/><small>RBCC 管理端</small><h1>{TEAM.name}</h1><p>输入服务端配置的管理员令牌。</p><input type="password" required value={draftToken} onChange={event => setDraftToken(event.target.value)} placeholder="ADMIN_TOKEN"/><button className="primary-button">进入管理端</button></form></div>;
  if (state.loading) return <Loading label="加载管理数据…"/>;
  if (state.error) return <div className="page-pad"><ErrorState message={state.error} onRetry={() => void load()}/><button onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); setState({loading:false,data:null,error:""}); }}>重新输入令牌</button></div>;
  const counts = state.data.counts;

  return <div className="admin-page page-pad">
    <header className="admin-heading"><div><ShieldCheck size={22}/><span><small>ADMIN CONTROL</small><h1>调研数据管理端</h1><p>{TEAM.name} · 路线、证据与评审定稿</p></span></div><div><button onClick={() => void exportData()}><Download size={14}/>导出数据</button><button onClick={() => void load()}><RefreshCw size={14}/>刷新</button></div></header>
    <section className="admin-kpis">{[[Users,counts.members,"成员"],[Route,counts.assignments,"站点分配"],[Database,counts.evidence,"现场证据"],[Archive,counts.knowledge,"知识条目"],[FileUp,counts.finalReports,"管理员定稿"]].map(([Icon,value,label])=><span key={label}><Icon size={16}/><strong>{value}</strong><small>{label}</small></span>)}</section>
    <Tabs value={tab} onChange={setTab} items={[{value:"overview",label:"总览"},{value:"routes",label:"成员与路线"},{value:"evidence",label:"证据数据"},{value:"reports",label:"DOCX 定稿"}]}/>
    {tab === "overview" ? <section className="admin-overview"><article><h2>数据状态</h2><dl><div><dt>问题库</dt><dd>{counts.problems}</dd></div><div><dt>分析方案</dt><dd>{counts.solutions}</dd></div><div><dt>协作任务</dt><dd>{counts.tasks}</dd></div><div><dt>唯一节点</dt><dd>{counts.uniqueSites}</dd></div></dl></article><article><h2>最近任务</h2>{state.data.tasks.slice(0,8).map(task=><p key={task.id}><strong>{task.title}</strong><span>{task.status}</span></p>)}</article></section> : null}
    {tab === "routes" ? <section className="admin-routes">{(state.data.teamConfig?.routes??[]).map(route=><article key={route.id}><header><strong>Day {route.day} · {route.label}</strong><span>{route.date} · 最多 {route.capacity} 人</span></header><p>{route.memberIds.map(id=>state.data.teamConfig.members.find(item=>item.id===id)?.name).join("、")}</p><ol>{route.stops.map(stop=><li key={stop.companyId}><strong>{stop.companyName}</strong><span>{stop.time?`${stop.time} · `:""}{stop.activity}</span></li>)}</ol></article>)}</section> : null}
    {tab === "evidence" ? <section className="admin-evidence">{state.data.recentEvidence.map(item=><article key={item.id}><span>{item.type}</span><div><strong>{item.memberName} · {item.companyName}</strong><p>{item.textContent||item.caption||item.fileName||"现场文件"}</p></div></article>)}{!state.data.recentEvidence.length?<Empty/>:null}</section> : null}
    {tab === "reports" ? <section className="admin-reports"><form onSubmit={uploadReport}><h2>上传并发布管理员定稿</h2><p>上传后，评审页和下载按钮优先使用该 DOCX；结构化 AI 报告仍保留作为可编辑工作稿。</p><label>成员<select value={member?.memberId||""} onChange={event=>{setMemberId(event.target.value);const next=state.data.dashboard.members.find(item=>item.memberId===event.target.value);setCompanyId(next?.sites?.[0]?.companyId||"");}}>{state.data.dashboard.members.map(item=><option key={item.memberId} value={item.memberId}>{item.memberName}</option>)}</select></label><label>站点<select value={site?.companyId||""} onChange={event=>setCompanyId(event.target.value)}>{sites.map(item=><option key={`${item.routeId}:${item.companyId}`} value={item.companyId}>{item.companyName} · Day {item.day}</option>)}</select></label><label className="admin-file"><FileUp size={20}/><span>选择 DOCX 定稿</span><input ref={fileRef} required type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/></label><button className="primary-button" disabled={uploading}>{uploading?"上传中…":"上传并发布"}</button>{notice?<p className="form-status">{notice}</p>:null}</form><div className="admin-report-list"><h2>已发布定稿</h2>{state.data.finalReports.map(report=><article key={report.id}><div><strong>{report.memberName} · {report.companyName}</strong><small>{report.originalName} · {(report.fileSize/1024/1024).toFixed(2)} MB</small></div><span>已发布</span></article>)}{!counts.finalReports?<Empty label="还没有管理员定稿"/>:null}</div></section> : null}
  </div>;
}
