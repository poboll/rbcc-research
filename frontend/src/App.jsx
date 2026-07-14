import React, { useEffect } from "react";
import { Shell } from "./components/Shell.jsx";
import { useRoute } from "./hooks.js";
import { WarRoom } from "./pages/WarRoom.jsx";
import { DesignMode, Roadshow } from "./pages/Presentation.jsx";
import { ReviewHome, ReviewReport } from "./pages/Review.jsx";
import { FieldApp } from "./pages/FieldApp.jsx";
import { TracesPage } from "./pages/LibraryTraces.jsx";
import { NodeLibraryPage } from "./pages/NodeLibrary.jsx";
import { AgentPage } from "./pages/KnowledgeAgent.jsx";
import { DashboardPage } from "./pages/Dashboard.jsx";
import { CollabHubPage } from "./pages/CollabHub.jsx";
import { AdminPage } from "./pages/Admin.jsx";
import { KnowledgeCenterPage } from "./pages/KnowledgeCenter.jsx";
import { InstallPage } from "./pages/Install.jsx";

export function App() {
  const route = useRoute();
  useEffect(() => {
    if (route.pathname === "/" && window.matchMedia("(max-width: 600px)").matches) {
      history.replaceState(null, "", "/app");
      window.dispatchEvent(new Event("rbcc:navigate"));
    }
  }, [route.pathname]);
  let page;
  if (route.pathname === "/screen" || route.pathname === "/") page = <WarRoom screen={route.pathname === "/screen"}/>;
  else if (route.pathname === "/screen/roadshow") page = <Roadshow/>;
  else if (route.pathname === "/design") page = <DesignMode/>;
  else if (route.pathname === "/review") page = <ReviewHome/>;
  else if (route.pathname === "/review/report") page = <ReviewReport search={route.search}/>;
  else if (route.pathname === "/app") page = <FieldApp search={route.search}/>;
  else if (route.pathname === "/library") page = <NodeLibraryPage/>;
  else if (route.pathname === "/traces") page = <TracesPage/>;
  else if (route.pathname === "/agent") page = <AgentPage/>;
  else if (route.pathname === "/dashboard") page = <DashboardPage search={route.search}/>;
  else if (route.pathname === "/collab") page = <CollabHubPage/>;
  else if (route.pathname === "/admin") page = <AdminPage/>;
  else if (route.pathname === "/knowledge") page = <KnowledgeCenterPage/>;
  else if (route.pathname === "/install") page = <InstallPage/>;
  else page = <div className="not-found"><strong>404</strong><p>没有找到这个调研页面。</p><a href="/">返回作战室</a></div>;
  const bare = route.pathname === "/app";
  return <Shell pathname={route.pathname} bare={bare} subtitle={route.pathname === "/" || route.pathname === "/screen" ? "全组视图 · 田野证据 → 痛点验证 → 分析对策 → 评审交付" : undefined}>{page}</Shell>;
}
