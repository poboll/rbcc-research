# RBCC 调研协作系统架构

## 已确认的原站实现

- nginx 反向代理 Next.js App Router。
- React 客户端、Tailwind CSS、Lucide 图标、Geist 字体。
- JSON REST API；客户端使用轮询同步协作动态和上传状态。
- 浏览器存储保存队员身份、当前站点上下文和离线上传队列。
- 调研主线为：预设问题 -> 现场留痕 -> 假设验证 -> 痛点 -> 方案 -> 报告 -> 教师评审。

## 恢复版目录

```text
frontend/src/            重新实现的 React 前端源码
web-dist/               Vite 生产构建产物（不进入版本库）
public/                 线上实际发布包，仅作对照与资源兜底
src/server/             重建的可维护服务端源码
data/                   初始数据和可变运行状态
data/deployed/          线上公开接口的只读种子快照
data/uploads/           本地上传文件（不进入版本库）
data/generated/         生成的 DOCX（不进入版本库）
scripts/sync-deployed.mjs 重新抓取公开页面、资源和数据快照
server.mjs              HTTP 入口与静态资源服务
```

## Agent 与报告路线

1. 队员在 App 选择成员和站点，保存调研前问题。
2. 现场上传文字、图片、录音；每条材料必须带成员和站点关联。
3. 红小八按当前站点检索问题、留痕、知识和方案，并输出引用。
4. 报告工作台自动把证据分配到四大板块，显示缺口和完整度。
5. AI 只做结构化提炼与表达增强；事实材料和引用仍由本地数据决定。
6. 保存草稿后生成约一万字评审版，落盘版本可导出 DOCX。
7. 教师评审使用固定版本阅读，避免实时编辑造成内容漂移。

## 环境变量

```bash
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
LLM_BASE_URL=https://api.deepseek.com
PORT=4173
```

密钥只存在于服务端进程环境中。不要写入 `public/`、数据 JSON 或提交历史。
