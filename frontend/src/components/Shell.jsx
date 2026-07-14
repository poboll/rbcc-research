import React from "react";
import { Archive, Bot, Compass, GraduationCap, LayoutDashboard, LayoutGrid, Monitor, MonitorPlay, Settings, SlidersHorizontal, Smartphone, Users } from "lucide-react";
import { navigate } from "../hooks.js";
import { TEAM } from "../team.js";

const nav = [
  ["/screen", "协作大屏", Monitor], ["/screen/roadshow", "全功能路演", MonitorPlay], ["/design", "设计模式", SlidersHorizontal],
  ["/review", "教师评审", GraduationCap], ["/", "作战室", Compass], ["/collab", "协同 Hub", Users],
  ["/dashboard", "调研报告", LayoutDashboard], ["/traces", "留痕库", Archive], ["/library", "节点库", LayoutGrid],
  ["/agent", "红小八", Bot], ["/app", "队员端", Smartphone], ["/admin", "管理端", Settings]
];
const moduleNav = [["/collab","协同 Hub"],["/review","评审"],["/","作战室"],["/library","节点库"],["/agent","红小八"],["/traces","留痕库"],["/dashboard","调研报告"],["/app","队员端"],["/admin","管理端"]];

function AppLink({ href, className, children, ...props }) {
  return <a href={href} className={className} onClick={event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); navigate(href); } }} {...props}>{children}</a>;
}

export { AppLink };

export function Shell({ pathname, children, subtitle, bare = false }) {
  if (bare) return children;
  const usesScreenNav = pathname === "/" || pathname.startsWith("/screen") || pathname === "/design";
  return <div className="app-shell">
    {usesScreenNav ? <header className="topbar">
      <AppLink href="/screen" className="brand">
        <span className="brand-icon"><Monitor size={17} /></span>
        <span><small>RBCC · {TEAM.theme}</small><strong>{TEAM.name}</strong></span>
      </AppLink>
      <nav aria-label="协作大屏主导航">
        {nav.map(([href, label, Icon], index) => <React.Fragment key={href}>
          {index === 3 ? <span className="nav-divider" /> : null}
          <AppLink href={href} className={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "active" : ""}><Icon size={14} /><span>{label}</span></AppLink>
        </React.Fragment>)}
      </nav>
    </header> : <header className="module-header">
      <button type="button" className="desktop-bridge"><Monitor size={17}/><span><strong>智能呈现 · 桌面协同</strong><small>查看各组进度与受阻项</small></span></button>
      <nav>{moduleNav.map(([href,label])=><AppLink key={href} href={href} className={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "active" : ""}>{label}</AppLink>)}</nav>
    </header>}
    {subtitle ? <div className="subbar">{subtitle}</div> : null}
    <main>{children}</main>
  </div>;
}
