import React, { useEffect, useRef, useState } from "react";
import { Archive, ArrowRight, Bot, Check, ChevronDown, CircleAlert, Database, Download, FileCheck2, FileText, FileUp, ListChecks, LockKeyhole, LogOut, MapPin, MonitorPlay, RefreshCw, Route, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { api, downloadBlob, jsonOptions } from "../api.js";
import { AppLink } from "../components/Shell.jsx";
import { Empty, ErrorState, Loading, Tabs } from "../components/Ui.jsx";
import { TEAM } from "../team.js";

const TOKEN_KEY = "rbcc-admin-token";
const tabItems = [
  ["overview", "总览"], ["members", "成员"], ["routes", "路线与站点"], ["tasks", "协作任务"],
  ["evidence", "证据"], ["knowledge", "知识库"], ["reports", "DOCX 定稿"]
].map(([value, label]) => ({ value, label }));

async function adminJson(path, token, options = {}) {
  const response = await api(path, { ...options, headers: { ...(options.headers ?? {}), "x-admin-token": token } });
  return response.json();
}

function TextField({ label, value, onChange, type = "text", multiline = false }) {
  const Control = multiline ? "textarea" : "input";
  return <label className="admin-field"><span>{label}</span><Control type={type} value={value ?? ""} onChange={event => onChange(event.target.value)}/></label>;
}

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [state, setState] = useState({ loading: false, data: null, error: "" });
  const [tab, setTab] = useState("overview");
  const [memberId, setMemberId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { if (token) void load(token); }, []);

  async function load(activeToken = token, quiet = false) {
    if (!quiet) setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const data = await adminJson("/api/admin/summary", activeToken);
      setState({ loading: false, data, error: "" });
      const first = data.dashboard?.members?.[0];
      setMemberId(current => data.dashboard?.members?.some(item => item.memberId === current) ? current : first?.memberId || "");
      setCompanyId(current => first?.sites?.some(item => item.companyId === current) ? current : first?.sites?.[0]?.companyId || "");
      return true;
    } catch (error) {
      setState({ loading: false, data: null, error: error.message });
      return false;
    }
  }

  async function login(event) {
    event.preventDefault();
    const authenticated = await load(draftToken);
    if (!authenticated) return;
    sessionStorage.setItem(TOKEN_KEY, draftToken);
    setToken(draftToken);
  }

  async function mutate(key, path, options, success) {
    setBusy(key); setNotice(null);
    try { await adminJson(path, token, options); await load(token, true); setNotice({ type: "success", text: success }); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(""); }
  }

  function updateMember(id, field, value) {
    setState(current => ({ ...current, data: { ...current.data, teamConfig: { ...current.data.teamConfig, members: current.data.teamConfig.members.map(item => item.id === id ? { ...item, [field]: value } : item) } } }));
  }

  function updateRoute(id, patch) {
    setState(current => ({ ...current, data: { ...current.data, teamConfig: { ...current.data.teamConfig, routes: current.data.teamConfig.routes.map(item => item.id === id ? { ...item, ...patch } : item) } } }));
  }

  function updateStop(routeId, companyIdValue, field, value) {
    setState(current => ({ ...current, data: { ...current.data, teamConfig: { ...current.data.teamConfig, routes: current.data.teamConfig.routes.map(route => route.id === routeId ? { ...route, stops: route.stops.map(stop => stop.companyId === companyIdValue ? { ...stop, [field]: value } : stop) } : route) } } }));
  }

  async function uploadReport(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    const member = state.data.dashboard.members.find(item => item.memberId === memberId);
    const site = member?.sites.find(item => item.companyId === companyId);
    if (!file || !member || !site) return;
    const form = new FormData();
    form.set("memberId", member.memberId); form.set("companyId", site.companyId); form.set("uploadedBy", "管理员"); form.set("published", "true"); form.set("file", file);
    setBusy("upload"); setNotice(null);
    try { await api("/api/admin/report-upload", { method: "POST", headers: { "x-admin-token": token }, body: form }); fileRef.current.value = ""; await load(token, true); setNotice({ type: "success", text: "管理员定稿已发布到评审下载入口。" }); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(""); }
  }

  async function exportData() {
    const response = await api("/api/admin/export", { headers: { "x-admin-token": token } });
    await downloadBlob(response, "rbcc-team8-data.json");
  }

  if (!token || (!state.data && !state.loading && !state.error)) return <div className="admin-login page-pad"><form onSubmit={login}><LockKeyhole size={28}/><small>RBCC 管理端</small><h1>{TEAM.name}</h1><p>输入管理员密码，统一管理路线、现场证据、知识与评审定稿。</p>{state.error ? <div className="admin-login-error" role="alert"><CircleAlert size={15}/><span>{state.error}</span></div> : null}<input type="password" required value={draftToken} onChange={event => { setDraftToken(event.target.value); if (state.error) setState(current => ({...current,error:""})); }} placeholder="管理员密码"/><button className="primary-button" disabled={state.loading}>{state.loading ? "正在验证…" : "进入管理端"}</button></form></div>;
  if (state.loading) return <Loading label="加载管理数据…"/>;
  if (state.error) return <div className="page-pad"><ErrorState message={state.error} onRetry={() => void load()}/><button onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); setState({loading:false,data:null,error:""}); }}>重新输入密码</button></div>;

  const data = state.data;
  const counts = data.counts;
  const selectedMember = data.dashboard.members.find(item => item.memberId === memberId) ?? data.dashboard.members[0];
  const sites = selectedMember?.sites ?? [];
  const selectedSite = sites.find(item => item.companyId === companyId) ?? sites[0];
  const summary = data.dashboard.summary ?? {};
  const membersWithEvidence = data.dashboard.members.filter(member => member.sites?.some(site => site.evidenceCount > 0)).length;
  const taskDone = data.tasks.filter(task => task.status === "done").length;
  const closureStages = [
    { index:"01", label:"现场输入", detail:`${counts.evidence} 条证据 · ${membersWithEvidence}/${counts.members} 人覆盖`, value:counts.evidence, tab:"evidence" },
    { index:"02", label:"问题验证", detail:`${summary.validatedQuestionCount||0} 条得出结论`, value:summary.validatedQuestionCount||0, tab:"overview" },
    { index:"03", label:"痛点收敛", detail:`${counts.problems} 条问题进入判断`, value:counts.problems, tab:"evidence" },
    { index:"04", label:"方案试验", detail:`${counts.solutions} 个关联方案`, value:counts.solutions, tab:"tasks" },
    { index:"05", label:"评审交付", detail:`${counts.finalReports} 份 DOCX 定稿`, value:counts.finalReports, tab:"reports" }
  ];

  return <div className="admin-page page-pad">
    <header className="admin-heading"><div><ShieldCheck size={24}/><span><small>闭环控制台 · 数据与交付</small><h1>调研数据管理端</h1><p>{TEAM.name} · 从现场提交到评审定稿的统一管理入口</p></span></div><div><button onClick={() => void exportData()}><Download size={16}/>导出数据</button><button onClick={() => void load()}><RefreshCw size={16}/>刷新</button><button title="退出管理端" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); setState({loading:false,data:null,error:""}); }}><LogOut size={16}/>退出</button></div></header>
    {notice ? <div className={`admin-notice ${notice.type}`} role="status">{notice.type === "success" ? <Check size={17}/> : null}{notice.text}<button onClick={() => setNotice(null)}>×</button></div> : null}
    <section className={`admin-storage ${data.storage?.persistent?"ready":"warning"}`}><Database size={17}/><div><strong>{data.storage?.mode==="private-blob"?"生产数据：私有 Vercel Blob":"数据存储：本地 JSON"}</strong><p>{data.storage?.warning}</p></div><span>{counts.reportVersions||0} 个报告版本</span></section>
    <section className="admin-kpis">{[[Users,counts.members,"成员"],[Route,counts.assignments,"站点分配"],[Database,counts.evidence,"现场证据"],[Archive,counts.knowledge,"知识条目"],[FileUp,counts.finalReports,"管理员定稿"]].map(([Icon,value,label])=><span key={label}><Icon size={17}/><strong>{value}</strong><small>{label}</small></span>)}</section>
    <section className="admin-story"><header><div><ListChecks size={18}/><span><h2>调研闭环推进</h2><p>数字全部来自当前生产数据，点击阶段进入对应管理模块。</p></span></div><strong>{summary.averageClosurePercent||0}% <small>平均闭环</small></strong></header><div>{closureStages.map((stage,index)=><React.Fragment key={stage.index}><button className={stage.value?"ready":"pending"} onClick={()=>setTab(stage.tab)}><span>{stage.index}</span><div><strong>{stage.label}</strong><small>{stage.detail}</small></div>{stage.value?<Check size={14}/>:<CircleAlert size={14}/>}</button>{index<closureStages.length-1?<ArrowRight size={14}/>:null}</React.Fragment>)}</div></section>
    <Tabs value={tab} onChange={setTab} items={tabItems}/>

    {tab === "overview" ? <section className="admin-overview"><article><h2>数据状态</h2><dl>{[["问题库",counts.problems],["分析方案",counts.solutions],["协作任务",counts.tasks],["唯一节点",counts.uniqueSites],["知识片段",counts.knowledgeChunks],["知识来源",counts.knowledgeSources]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article><article><h2>最近任务 · {taskDone}/{counts.tasks} 完成</h2>{data.tasks.slice(0,8).map(task=><p key={task.id}><strong>{task.title}</strong><span>{task.status}</span></p>)}</article><article className="admin-delivery"><header><Bot size={17}/><div><h2>发布前检查</h2><p>按汇报故事顺序检查现场观点、教师评审和电脑路演。</p></div></header><div><AppLink href="/collab"><Users size={15}/><span><strong>成员思考</strong><small>{data.dashboard.members.length} 人 · {counts.evidence} 条证据</small></span><ArrowRight size={14}/></AppLink><AppLink href="/review"><FileCheck2 size={15}/><span><strong>教师评审</strong><small>{counts.finalReports} 份管理员定稿</small></span><ArrowRight size={14}/></AppLink><AppLink href="/screen/roadshow"><MonitorPlay size={15}/><span><strong>全功能路演</strong><small>从田野输入讲到评审交付</small></span><ArrowRight size={14}/></AppLink></div></article></section> : null}

    {tab === "members" ? <section className="admin-edit-grid">{data.teamConfig.members.map(member => <article className="admin-edit-card" key={member.id}><header><Users size={18}/><div><h2>{member.name}</h2><small>{member.id}</small></div></header><TextField label="姓名" value={member.name} onChange={value => updateMember(member.id,"name",value)}/><TextField label="角色" value={member.role} onChange={value => updateMember(member.id,"role",value)}/><button className="primary-button" disabled={busy === `member-${member.id}`} onClick={() => void mutate(`member-${member.id}`,`/api/admin/members/${member.id}`,jsonOptions("PATCH",{name:member.name,role:member.role}),`已保存 ${member.name} 的资料`)}><Save size={15}/>{busy === `member-${member.id}` ? "保存中…" : "保存成员"}</button></article>)}</section> : null}

    {tab === "routes" ? <section className="admin-route-editor">{data.teamConfig.routes.map(route => <details open key={route.id}><summary><span><Route size={18}/><strong>Day {route.day} · {route.label}</strong><small>{route.stops.length} 个站点 · {route.memberIds.length} 名队员</small></span><ChevronDown size={18}/></summary><div className="admin-route-body"><div className="admin-route-fields"><TextField label="路线名称" value={route.label} onChange={value => updateRoute(route.id,{label:value})}/><TextField label="日期" type="date" value={route.date} onChange={value => updateRoute(route.id,{date:value})}/><TextField label="人数上限" type="number" value={route.capacity} onChange={value => updateRoute(route.id,{capacity:value})}/></div><fieldset><legend>分配队员</legend><div className="admin-member-checks">{data.teamConfig.members.map(member => <label key={member.id}><input type="checkbox" checked={route.memberIds.includes(member.id)} onChange={event => updateRoute(route.id,{memberIds:event.target.checked?[...route.memberIds,member.id]:route.memberIds.filter(id=>id!==member.id)})}/><span>{member.name}</span></label>)}</div></fieldset><button className="primary-button admin-save-route" disabled={busy === `route-${route.id}`} onClick={() => void mutate(`route-${route.id}`,`/api/admin/routes/${route.id}`,jsonOptions("PATCH",route),`Day ${route.day} ${route.label} 已同步`)}><Save size={15}/>保存路线和分配</button><div className="admin-stop-list">{route.stops.map(stop => <article key={stop.companyId}><header><MapPin size={17}/><div><h3>{stop.companyName}</h3><small>{stop.companyId}</small></div></header><div className="admin-stop-fields"><TextField label="站点名称" value={stop.companyName} onChange={value=>updateStop(route.id,stop.companyId,"companyName",value)}/><TextField label="调研主题" value={stop.themeName} onChange={value=>updateStop(route.id,stop.companyId,"themeName",value)}/><TextField label="时间" value={stop.time} onChange={value=>updateStop(route.id,stop.companyId,"time",value)}/><TextField label="集合点" value={stop.meetingPoint} onChange={value=>updateStop(route.id,stop.companyId,"meetingPoint",value)}/><TextField label="活动内容" multiline value={stop.activity} onChange={value=>updateStop(route.id,stop.companyId,"activity",value)}/></div><button disabled={busy===`stop-${route.id}-${stop.companyId}`} onClick={() => void mutate(`stop-${route.id}-${stop.companyId}`,`/api/admin/stops/${route.id}/${stop.companyId}`,jsonOptions("PATCH",stop),`${stop.companyName} 已保存`)}><Save size={14}/>保存站点</button></article>)}</div></div></details>)}</section> : null}

    {tab === "tasks" ? <section className="admin-table"><header><div><h2>协作任务</h2><p>管理员可直接更新执行状态，协同 Hub 会即时显示。</p></div></header>{data.tasks.map(task => <article key={task.id}><div><strong>{task.title}</strong><p>{task.description}</p></div><select aria-label={`${task.title}状态`} value={task.status} disabled={busy===`task-${task.id}`} onChange={event => void mutate(`task-${task.id}`,`/api/collab/tasks/${task.id}`,jsonOptions("PATCH",{status:event.target.value}),"任务状态已更新")}><option value="todo">待开始</option><option value="active">进行中</option><option value="blocked">受阻</option><option value="done">已完成</option></select></article>)}</section> : null}

    {tab === "evidence" ? <section className="admin-table"><header><div><h2>现场证据</h2><p>删除会同时移除对应的 Agent 动态，且不可撤销。</p></div></header>{data.recentEvidence.map(item=><article key={item.id}><span className="admin-type">{item.type}</span><div><strong>{item.memberName || "未标记成员"} · {item.companyName || "未标记站点"}</strong><p>{item.textContent||item.caption||item.fileName||"现场文件"}</p></div><button className="danger-button" disabled={busy===`evidence-${item.id}`} onClick={() => window.confirm("确定永久删除这条现场证据吗？") && void mutate(`evidence-${item.id}`,`/api/admin/evidence/${item.id}`,{method:"DELETE"},"证据已删除")}><Trash2 size={15}/>删除</button></article>)}{!data.recentEvidence.length?<Empty/>:null}</section> : null}

    {tab === "knowledge" ? <section className="admin-table"><header><div><h2>知识库挂载</h2><p>{counts.knowledgeSources} 个来源 · {counts.knowledgeChunks} 个索引片段</p></div><a href="/knowledge">上传新资料</a></header>{data.knowledgeSources.map(source=><article key={source.id}><FileText size={18}/><div><strong>{source.title}</strong><p>{source.originalName} · {source.charCount?.toLocaleString()} 字 · {source.status}</p></div><button className="danger-button" disabled={busy===`source-${source.id}`} onClick={() => window.confirm("删除后会同时清除该资料的索引片段，确定继续吗？") && void mutate(`source-${source.id}`,`/api/knowledge/sources?id=${encodeURIComponent(source.id)}`,{method:"DELETE"},"知识来源及索引已删除")}><Trash2 size={15}/>卸载</button></article>)}{!data.knowledgeSources.length?<Empty/>:null}</section> : null}

    {tab === "reports" ? <section className="admin-reports"><form onSubmit={uploadReport}><h2>上传并发布管理员定稿</h2><p>定稿将覆盖该成员、该站点的评审下载入口，AI 工作稿仍会保留。</p><label>成员<select value={selectedMember?.memberId||""} onChange={event=>{setMemberId(event.target.value);const next=data.dashboard.members.find(item=>item.memberId===event.target.value);setCompanyId(next?.sites?.[0]?.companyId||"");}}>{data.dashboard.members.map(item=><option key={item.memberId} value={item.memberId}>{item.memberName}</option>)}</select></label><label>站点<select value={selectedSite?.companyId||""} onChange={event=>setCompanyId(event.target.value)}>{sites.map(item=><option key={`${item.routeId}:${item.companyId}`} value={item.companyId}>{item.companyName} · Day {item.day}</option>)}</select></label><label className="admin-file"><FileUp size={20}/><span>选择 DOCX 定稿</span><input ref={fileRef} required type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/></label><button className="primary-button" disabled={busy==="upload"}>{busy==="upload"?"上传中…":"上传并发布"}</button></form><div className="admin-report-list"><h2>已发布定稿</h2>{data.finalReports.map(report=><article key={report.id}><div><strong>{report.memberName} · {report.companyName}<em>{report.versionLabel}</em></strong><small title={report.originalName}>{report.originalName} · {(report.fileSize/1024/1024).toFixed(2)} MB</small></div><button className="danger-button" disabled={busy===`report-${report.id}`} onClick={() => window.confirm("确定撤下这份管理员定稿吗？") && void mutate(`report-${report.id}`,`/api/admin/final-reports/${encodeURIComponent(`${report.memberId}::${report.companyId}`)}`,{method:"DELETE"},"管理员定稿已撤下")}><Trash2 size={15}/>撤下</button></article>)}{!counts.finalReports?<Empty label="还没有管理员定稿"/>:null}</div></section> : null}
  </div>;
}
