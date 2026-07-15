import React from "react";
import { Archive, BookOpen, Bot, Compass, Download, GraduationCap, LayoutDashboard, LayoutGrid, Monitor, MonitorPlay, Settings, SlidersHorizontal, Smartphone, Users } from "lucide-react";
import { navigate } from "../hooks.js";
import { TEAM } from "../team.js";

const nav = [
  ["/screen", "协作大屏", Monitor], ["/screen/roadshow", "全功能路演", MonitorPlay], ["/design", "设计模式", SlidersHorizontal],
  ["/review", "教师评审", GraduationCap], ["/", "作战室", Compass], ["/collab", "协同 Hub", Users],
  ["/dashboard", "调研报告", LayoutDashboard], ["/traces", "留痕库", Archive], ["/library", "节点库", LayoutGrid],
  ["/agent", "红小八", Bot], ["/knowledge", "知识中心", BookOpen], ["/app", "队员端", Smartphone], ["/install", "安装", Download], ["/admin", "管理端", Settings]
];
const moduleNav = [["/","作战室"],["/app","队员端"],["/traces","留痕库"],["/collab","协同 Hub"],["/knowledge","知识中心"],["/agent","红小八"],["/dashboard","调研报告"],["/review","评审"],["/library","节点库"],["/admin","管理端"],["/install","安装"]];

function AppLink({ href, className, children, ...props }) {
  return <a href={href} className={className} onClick={event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); navigate(href); } }} {...props}>{children}</a>;
}

export { AppLink };

export function Shell({ pathname, children, subtitle, bare = false }) {
  if (bare) return children;
  const usesScreenNav = pathname === "/" || pathname.startsWith("/screen") || pathname === "/design";
  const shellClass = ["app-shell", pathname.startsWith("/review") ? "review-shell" : "", pathname === "/collab" ? "collab-shell" : "", pathname === "/knowledge" ? "knowledge-shell" : "", pathname === "/admin" ? "admin-shell" : "", pathname === "/" || pathname === "/screen" ? "warroom-shell" : ""].filter(Boolean).join(" ");
  return <div className={shellClass}>
    {usesScreenNav ? <header className="topbar">
      <AppLink href="/screen" className="brand">
        <span className="brand-icon"><Monitor size={17} /></span>
        <span><small>RBCC · {TEAM.theme}</small><strong>{TEAM.name}</strong></span>
      </AppLink>
      <nav aria-label="协作大屏主导航">
        {nav.map(([href, label, Icon], index) => <React.Fragment key={href}>
          {index === 3 ? <span className="nav-divider" /> : null}
          <AppLink href={href} title={label} className={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "active" : ""}><Icon size={14} /><span>{label}</span></AppLink>
        </React.Fragment>)}
      </nav>
    </header> : <header className="module-header">
      <AppLink href="/screen" className="desktop-bridge"><Monitor size={17}/><span><strong>智能呈现 · 桌面协同</strong><small>查看全组进度、受阻项与路演</small></span></AppLink>
      <nav>{moduleNav.map(([href,label])=><AppLink key={href} href={href} className={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "active" : ""}>{label}</AppLink>)}</nav>
    </header>}
    {subtitle ? <div className="subbar">{subtitle}</div> : null}
    <main>{children}</main>
  </div>;
}
