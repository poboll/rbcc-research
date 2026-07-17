import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeUploadFileName } from "../src/server/api.mjs";

const statePath = resolve(process.argv[2] || "data/app-state.json");
const apply = process.argv.includes("--apply");
const state = JSON.parse(await readFile(statePath, "utf8"));
const changes = [];
const canonicalReportName = value => normalizeUploadFileName(value).replace(/_+企业调研报告(?=\.docx$)/, "企业调研报告");

for (const [key, report] of Object.entries(state.finalReports || {})) {
  const normalized = canonicalReportName(report.originalName);
  if (normalized !== report.originalName) {
    changes.push({ key, field: "finalReports.originalName", before: report.originalName, after: normalized });
    report.originalName = normalized;
  }
  for (const version of state.iterations?.[key]?.versions || []) {
    if (version.source !== "admin-final" || !version.filename) continue;
    const versionName = canonicalReportName(version.filename);
    if (versionName === version.filename) continue;
    changes.push({ key, versionId: version.id, field: "iterations.filename", before: version.filename, after: versionName });
    version.filename = versionName;
  }
}

if (apply && changes.length) {
  const tempPath = `${statePath}.filename-repair-${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, statePath);
}

console.log(JSON.stringify({ statePath, apply, changes: changes.length, items: changes }, null, 2));
