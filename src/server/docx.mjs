import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { REPORT_BLOCKS } from "./reports.mjs";

const partTitles = {
  overview: "调研概况", business: "企业/产地基本面", tech: "技术与智能化水平", process: "核心流程与组织",
  stakeholders: "关键角色与诉求", constraints: "现场约束与顾虑", voices: "访谈原声与观察", fieldNotes: "走访留痕与笔记",
  hypotheses: "走访前预设问题", evidence: "现场验证与证据链", categories: "痛点归类", painSummary: "痛点陈述（验证后收敛）",
  opportunities: "方案机会（挂钩已验证痛点）", proposals: "解决方案构想", recommendations: "结论与推进建议", appendix: "附录"
};

export async function createReportDocx(report) {
  const children = [
    new Paragraph({ text: report.meta?.title ?? "RBCC 实地调研报告", heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun(`调研成员：${report.meta?.memberName ?? ""}    调研对象：${report.meta?.companyName ?? ""}`)] })
  ];
  for (const block of REPORT_BLOCKS) {
    children.push(new Paragraph({ text: block.title, heading: HeadingLevel.HEADING_1 }));
    for (const part of block.parts) {
      const items = report.sections?.[block.id]?.[part] ?? [];
      if (!items.length) continue;
      children.push(new Paragraph({ text: partTitles[part] ?? part, heading: HeadingLevel.HEADING_2 }));
      for (const item of items) children.push(new Paragraph({ text: String(item), spacing: { after: 160, line: 360 } }));
    }
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
