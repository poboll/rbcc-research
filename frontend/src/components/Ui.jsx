import React from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

export function Loading({ label = "加载中…", compact = false }) {
  return <div className={compact ? "loading compact" : "loading"}><Loader2 size={compact ? 14 : 18} className="spin" /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="error-state"><AlertTriangle size={18} /><span>{message}</span>{onRetry ? <button className="icon-text" onClick={onRetry}><RefreshCw size={14} />重试</button> : null}</div>;
}

export function Empty({ children = "暂无数据" }) {
  return <div className="empty">{children}</div>;
}

export function StatusDot({ ok = true, label }) {
  return <span className={ok ? "status good" : "status waiting"}>{ok ? <CheckCircle2 size={12} /> : <span className="dot" />}{label}</span>;
}

export function Progress({ value, tone = "cyan" }) {
  return <div className="progress" aria-label={`${value}%`}><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>;
}

export function Tabs({ items, value, onChange }) {
  return <div className="tabs" role="tablist">{items.map(item => <button key={item.value} type="button" className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.icon || null}{item.label}</button>)}</div>;
}
