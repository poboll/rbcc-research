import React from "react";
import { Download, Monitor, Share2, Smartphone } from "lucide-react";
import { AppLink } from "../components/Shell.jsx";
import { TEAM } from "../team.js";

export function InstallPage() {
  return <div className="install-page page-pad"><header><Download size={24}/><small>INSTALL RBCC</small><h1>安装 {TEAM.shortName} 调研端</h1><p>将队员端固定到手机桌面，现场可直接进入路线、留痕与红八宝。</p></header><section><article><Smartphone/><h2>iPhone / iPad</h2><ol><li>使用 Safari 打开队员端</li><li>点击浏览器底部“共享”</li><li>选择“添加到主屏幕”</li></ol><AppLink href="/app"><Share2 size={14}/>打开队员端</AppLink></article><article><Smartphone/><h2>Android</h2><ol><li>使用 Chrome 打开队员端</li><li>打开右上角浏览器菜单</li><li>选择“安装应用”或“添加到主屏幕”</li></ol><AppLink href="/app"><Download size={14}/>打开安装页面</AppLink></article><article><Monitor/><h2>桌面评审</h2><ol><li>使用 Chrome 或 Edge 打开系统</li><li>从地址栏安装图标安装</li><li>固定到 Dock 或任务栏</li></ol><AppLink href="/screen"><Monitor size={14}/>打开协作大屏</AppLink></article></section></div>;
}
