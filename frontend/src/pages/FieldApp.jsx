import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, ChevronRight, Download, MapPin, Mic, RefreshCw, Route, Send, Smartphone, Upload, UserRound } from "lucide-react";
import { json } from "../api.js";
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
  return <div className="field-app">
    <DesktopLinks />
    <header className="mobile-header"><div><small>{TEAM.shortName} · 队员端</small><strong>{member.name}</strong></div><button onClick={() => setMemberId("")}><UserRound size={14} />切换身份</button></header>
    <div className="field-content">{tab === "agent" ? <AgentChat memberId={memberId} memberName={member.name} mobile /> : <RouteCapture member={member} />}</div>
    <nav className="mobile-nav"><button className={tab === "route" ? "active" : ""} onClick={() => setTab("route")}><Route size={19} />走访路线</button><button className={tab === "agent" ? "active" : ""} onClick={() => setTab("agent")}><Bot size={19} />红小八</button></nav>
  </div>;
}

function IdentityPicker({ onSelect }) {
  return <div className="identity-page"><DesktopLinks /><header><div><small>{TEAM.shortName} · 队员端</small><span>请先选择身份</span></div><button title="检查并加载最新版本"><RefreshCw size={13} />立即更新</button></header><main><div className="phone-mark"><Smartphone size={27} /></div><h1>选择你的身份</h1><p>{TEAM.name} · {TEAM.theme}</p><small className="route-label"><i />{TEAM.mascot}</small><div className="identity-list">{MEMBERS.map(member => <button key={member.id} onClick={() => onSelect(member.id)}><span className="avatar"><UserRound size={17} /></span><span><strong>{member.name}</strong><small>{member.role}</small></span><ChevronRight size={17} /></button>)}</div><section className="install-hint"><Download size={20} /><span><strong>安装到手机桌面</strong><p>手机浏览器打开后，使用浏览器菜单中的「添加到主屏幕」或「安装应用」。</p></span></section></main><nav><span><Route size={19} />走访路线</span><span><Bot size={19} />红小八</span></nav></div>;
}

function DesktopLinks(){return <aside className="field-desktop-links"><button><Smartphone size={16}/><span><strong>智能呈现 · 桌面协同</strong><small>查看各组进度与受阻项</small></span></button><nav>{[["/collab","协同 Hub"],["/review","评审"],["/","作战室"],["/library","节点库"],["/agent","红小八"],["/traces","留痕库"],["/dashboard","调研报告"],["/app","队员端"]].map(([href,label])=><AppLink key={href} href={href}>{label}</AppLink>)}</nav></aside>}

function RouteCapture({ member }) {
  const [dashboard, setDashboard] = useState(null);
  const [active, setActive] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { Promise.all([json(`/api/research-dashboard?memberId=${member.id}`),json(`/api/member-long-reports?memberId=${member.id}`)]).then(([value,reports]) => { const days=new Map((reports.reports??[]).map(item=>[item.companyId,item.day]));const raw=value.members?.[0]?.sites??[];value.members[0].sites=raw.map((site,index)=>({...site,day:days.get(site.companyId)||Math.min(3,Math.floor(index/Math.max(1,Math.ceil(raw.length/3)))+1)})); setDashboard(value); setActive(value.members?.[0]?.sites?.[0]?.companyId || ""); }); }, [member.id]);
  const sites = dashboard?.members?.[0]?.sites ?? [];
  const site = sites.find(item => item.companyId === active);
  async function upload(event) {
    event.preventDefault();
    if (!site || (!text.trim() && !fileRef.current?.files?.[0])) return;
    const form = new FormData();
    form.set("memberId", member.id); form.set("memberName", member.name); form.set("groupId", TEAM.id);
    form.set("companyId", site.companyId); form.set("companyName", site.companyName);
    const file = fileRef.current?.files?.[0];
    form.set("type", file?.type?.startsWith("audio/") ? "audio" : file ? "image" : "text");
    form.set("title", "现场留痕"); form.set("caption", text.trim()); if (text.trim()) form.set("textContent", text.trim()); if (file) form.set("file", file);
    setStatus("上传中…");
    const response = await fetch("/api/media/upload", { method: "POST", body: form });
    setStatus(response.ok ? "已同步到留痕库" : "上传失败"); if (response.ok) { setText(""); if (fileRef.current) fileRef.current.value = ""; }
  }
  if (!dashboard) return <Loading label="加载参访路线…" />;
  return <div className="route-capture"><header><div><MapPin size={20} /><span><small>{member.name} · 已定路线</small><h1>现场调研</h1></span></div><StatusDot label="云端已连接" /></header><div className="site-scroller">{sites.map(item => <button className={item.companyId === active ? "active" : ""} onClick={() => setActive(item.companyId)} key={item.companyId}><strong>{item.companyName}</strong><small>Day {item.day || "-"} · {item.themeName}</small></button>)}</div>{site ? <section className="capture-card"><div><small>当前站点</small><h2>{site.companyName}</h2><p>{site.themeName}</p></div><form onSubmit={upload}><textarea value={text} onChange={event => setText(event.target.value)} placeholder="记录现场观察、访谈原声或待验证问题…" /><label className="file-button"><Camera size={17} /><Mic size={17} /><span>图片 / 录音</span><input ref={fileRef} type="file" accept="image/*,audio/*" /></label><button className="primary-button" type="submit"><Upload size={16} />上传留痕</button></form>{status ? <p className="form-status">{status}</p> : null}</section> : <Empty />}</div>;
}
