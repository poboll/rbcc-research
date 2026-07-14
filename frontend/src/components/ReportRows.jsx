import React, { useEffect, useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import { api, downloadBlob } from "../api.js";
import { AppLink } from "./Shell.jsx";
import { Loading } from "./Ui.jsx";
import { MEMBER_IDS } from "../team.js";

export const REPORT_MEMBERS = MEMBER_IDS;

export function useLongReports() {
  const [state, setState] = useState({ data: [], loading: true });
  useEffect(() => {
    let alive = true;
    Promise.all(REPORT_MEMBERS.map(id => fetch(`/api/member-long-reports?memberId=${id}`).then(response => response.json())))
      .then(data => { if (alive) setState({ data, loading: false }); })
      .catch(() => { if (alive) setState({ data: [], loading: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}

export function ReportRows({ compact = false }) {
  const { data, loading } = useLongReports();
  const [downloading, setDownloading] = useState("");
  if (loading) return <Loading label="加载队员调研报告…" />;

  async function download(memberId, report) {
    const key = `${memberId}:${report.companyId}`;
    setDownloading(key);
    try {
      const response = await api(`/api/member-long-reports/download?memberId=${encodeURIComponent(memberId)}&companyId=${encodeURIComponent(report.companyId)}`);
      await downloadBlob(response, report.filename || "调研报告.docx");
    } finally { setDownloading(""); }
  }

  return <section className={compact ? "report-rows compact" : "report-rows"}>
    {data.filter(group => group.reports?.length).map(group => <article className="report-row" id={`review-${group.memberId}`} key={group.memberId}>
      <div className="report-owner"><FileText size={17} /><span><strong>{group.memberName} · RBCC 实地调研报告</strong><small>点击查看全文 · {group.reports.filter(item => item.available).length}/{group.reports.length} 篇</small></span></div>
      <div className="report-links">
        {group.reports.map(report => report.available ? <span className="report-link" key={report.companyId}>
          <AppLink href={`/review/report?memberId=${group.memberId}&companyId=${report.companyId}`} title={report.placeName}><Eye size={12} />{report.placeName}</AppLink>
          <button type="button" title="下载 Word" disabled={downloading === `${group.memberId}:${report.companyId}`} onClick={() => void download(group.memberId, report)}><Download size={12} /></button>
        </span> : null)}
      </div>
      <AppLink className="review-jump" href="/review">评审首页</AppLink>
    </article>)}
  </section>;
}
