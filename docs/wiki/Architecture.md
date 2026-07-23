# 系统架构

## 总览

```text
React/Vite SPA
  |-- 队员端 / 协同 Hub / 留痕库
  |-- 知识中心 / 红八宝 Agent
  |-- 四核报告 / 教师评审 / 路演
  `-- 管理端
          |
          v
Node.js ESM API
  |-- 输入校验与管理鉴权
  |-- 问题 / 证据 / 痛点 / 方案
  |-- 知识解析与 Agent 调用
  |-- 报告版本与 DOCX
  `-- 状态及附件存储
```

## 前端

- React 19 + Vite 6 单页应用。
- `frontend/src/pages/` 按业务入口组织页面。
- `frontend/src/api.js` 统一调用服务端接口。
- CSS 变量实现深浅主题，响应式布局覆盖手机、桌面和投影。
- 浏览器端图片压缩将现场图片转换为 WebP，降低上传和存储压力。

## 后端

- `server.mjs`：Linux 自托管入口，同时提供静态资源、API 和本地附件。
- `api/index.mjs`：Vercel Functions 兼容入口。
- `src/server/api.mjs`：API 路由、校验、媒体、知识、Agent、报告和管理操作。
- `src/server/store.mjs`：JSON 状态、单实例写队列及 Vercel Blob 适配。
- `src/server/llm.mjs`：DeepSeek OpenAI-compatible 调用。
- `src/server/reports.mjs` 与 `docx.mjs`：四核报告和 Word 输出。

## 核心数据关系

```text
Member -> Route -> Site -> ResearchQuestion
                         -> EvidenceRecord
ResearchQuestion + EvidenceRecord -> Problem -> Solution
Problem + Solution + EvidenceRecord -> ReportVersion -> Final DOCX
```

问题保存验证状态和结论；留痕保存采集上下文；痛点聚合多个问题和证据；方案关联痛点与最小试验；报告保存引用记录和版本。首页、协同 Hub、评审和路演都从同一状态派生。

## 两种存储形态

### Linux 单节点

- 状态：`data/app-state.json`
- 附件：`data/uploads/`
- 优点：简单、可备份、没有平台函数生命周期问题。
- 限制：JSON 不是事务数据库，只适合本项目规模和单实例写入。

### Vercel 兼容部署

- 状态和对象：private Vercel Blob。
- `BLOB_READ_WRITE_TOKEN` 由关联 Blob store 注入。
- 未关联 Blob 时，Functions 数据只存在于易失内存。
- 整份 JSON 状态写入可能在多实例并发下发生后写覆盖先写。

## Agent 数据流

1. 根据成员、站点和当前问题构建检索范围。
2. 从团队知识、现场留痕、问题、痛点与方案形成上下文包。
3. 调用 DeepSeek 生成回答或结构化草稿。
4. 界面区分团队事实、成员推断、通识补充和待验证项。
5. 报告只应将可引用记录作为事实依据。

## 安全边界

- 管理写接口校验 `x-admin-token`。
- `ADMIN_TOKEN`、`DEEPSEEK_API_KEY`、`BLOB_READ_WRITE_TOKEN` 只存在于服务端。
- 上传内容校验类型、文件名和大小；媒体预览由受控接口提供。
- 删除、发布和定稿操作由服务端验证，前端隐藏按钮不构成权限控制。
