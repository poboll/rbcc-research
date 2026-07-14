import React, { useMemo } from "react";
import { ArrowLeft, Download, FileCheck2, GraduationCap, Quote } from "lucide-react";
import { api, downloadBlob } from "../api.js";
import { ReportRows, useLongReports } from "../components/ReportRows.jsx";
import { AppLink } from "../components/Shell.jsx";
import { ErrorState, Loading, Progress } from "../components/Ui.jsx";
import { useAsyncJson } from "../hooks.js";
import { DEFAULT_MEMBER, TEAM } from "../team.js";

export function ReviewHome() {
  const { data, loading } = useLongReports();
  const reports = data.flatMap(group => group.reports ?? []);
  const ready = reports.filter(item => item.available).length;
  const members=data.filter(group=>group.reports?.length);
  const representative=members.filter(group=>group.memberId!==TEAM.id).map(group=>({group,report:group.reports?.[0]})).filter(item=>item.report);
  return <div className="review-page page-pad">
    <header className="review-hero"><div><GraduationCap size={27} /><span><small>教师评审 · {TEAM.name}</small><h1>教师评审 · {TEAM.shortName}</h1><p>五人全员外勤 · 三日七线 · 一条数据链</p></span></div><div className="review-score"><strong>{loading ? "--" : `${ready}/${reports.length}`}</strong><span>报告已就绪</span><Progress value={reports.length ? ready / reports.length * 100 : 0} tone="violet" /></div></header>
    <nav className="review-member-nav">{members.map(group=><a href={`#review-${group.memberId}`} key={group.memberId}>{group.memberId===TEAM.id?`${TEAM.theme} · 场景整合`:group.memberName}</a>)}</nav>
    <section className="review-guide"><header><h2>推荐浏览顺序（约 8 分钟）</h2></header>{[["01","队员外勤 App","路线 · 调研问题 · 现场留痕",`/app?memberId=${DEFAULT_MEMBER.id}`],["02","组内协同 Hub","问题库 · 证据链 · 全组进度","/collab"],["03","四核调研报告","现状 · 共情 · 痛点 · 对策",`/dashboard?memberId=${DEFAULT_MEMBER.id}&companyId=co-xinyuan-logistics`]].map(([n,t,d,href]) => <AppLink href={href} key={n}><strong>{n}</strong><span><h2>{t}</h2><p>{d}</p></span></AppLink>)}</section>
    <section className="representative-sites"><header><h2>队员代表站点 · 深链</h2><p>快速进入每位队员的一份万字评审报告</p></header><div>{representative.map(({group,report})=><article key={group.memberId}><span><strong>{group.memberName}</strong><small>{report.placeName} · 第{report.day||1}天</small></span><AppLink href={`/dashboard?memberId=${group.memberId}&companyId=${report.companyId}`}>编辑台</AppLink><AppLink href={`/review/report?memberId=${group.memberId}&companyId=${report.companyId}`}>万字</AppLink></article>)}</div></section>
    <ReportRows />
  </div>;
}

const BLOCK_META = {
  situation: ["一", "现状扫描"], empathy: ["二", "人群共情"], painPoints: ["三", "痛点诊断"], conception: ["四", "分析对策"]
};
const PART_TITLES = { overview:"调研概况",business:"企业/产地基本面",tech:"技术与智能化水平",process:"核心流程与组织",stakeholders:"关键角色与诉求",constraints:"现场约束与顾虑",voices:"访谈原声与观察",fieldNotes:"走访留痕与笔记",hypotheses:"走访前预设问题",evidence:"现场验证与证据链",categories:"痛点归类",painSummary:"痛点陈述（验证后收敛）",opportunities:"方案机会",proposals:"解决方案构想",recommendations:"结论与推进建议",appendix:"附录" };

export function ReviewReport({ search }) {
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const memberId = params.get("memberId") || DEFAULT_MEMBER.id;
  const companyId = params.get("companyId") || "co-chengzhi";
  const path = `/api/research-report?memberId=${encodeURIComponent(memberId)}&companyId=${encodeURIComponent(companyId)}&groupModeId=iterate`;
  const { data, loading, error, reload } = useAsyncJson(path, [memberId, companyId]);
  if (loading) return <Loading label="加载评审正文…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  async function download() {
    const response = await api(`/api/member-long-reports/download?memberId=${encodeURIComponent(memberId)}&companyId=${encodeURIComponent(companyId)}`);
    await downloadBlob(response, `${data.meta.companyName}-调研报告.docx`);
  }
  return <article className="report-reader">
    <header className="reader-toolbar"><AppLink href="/review"><ArrowLeft size={15} />返回评审首页</AppLink><button className="primary-button" onClick={() => void download()}><Download size={15} />下载 Word</button></header>
    <section className="report-cover"><FileCheck2 size={28} /><small>2026 RBCC 企业调研 · 教师评审版</small><h1>{data.meta.title}</h1><p>{data.meta.memberName} · {data.meta.groupModeLabel} · {data.meta.themeName || TEAM.name}</p><div><span>完整度 <strong>{data.completeness.percent}%</strong></span><span>生成时间 {new Date(data.meta.generatedAt || Date.now()).toLocaleDateString("zh-CN")}</span></div></section>
    <nav className="report-toc">{Object.entries(BLOCK_META).map(([id,[index,title]]) => <a key={id} href={`#${id}`}><strong>{index}</strong>{title}</a>)}</nav>
    <div className="report-body">{Object.entries(BLOCK_META).map(([blockId,[index,title]]) => <section id={blockId} key={blockId}><header><span>{index}</span><h2>{title}</h2></header>{Object.entries(data.sections?.[blockId] ?? {}).map(([part,items]) => items?.length ? <div className="report-part" key={part}><h3>{PART_TITLES[part] || part}</h3>{items.map((paragraph,i) => <p key={i}>{part === "voices" ? <Quote size={15} /> : null}{paragraph}</p>)}</div> : null)}</section>)}</div>
  </article>;
}
