import assert from "node:assert/strict";
import { normalizeUploadFileName } from "../src/server/api.mjs";

const expected = "苏增烨_中建科技_企业调研报告.docx";
const mojibake = Buffer.from(expected, "utf8").toString("latin1");

assert.equal(normalizeUploadFileName(mojibake), expected);
assert.equal(normalizeUploadFileName(expected), expected);
assert.equal(normalizeUploadFileName("../报告\u0000.docx"), ".._报告.docx");
assert.equal(normalizeUploadFileName("report-v3.docx"), "report-v3.docx");
console.log("upload filenames: UTF-8 recovery and sanitization passed");
