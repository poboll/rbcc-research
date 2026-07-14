# 红八宝 · 八爪鱼组 / RBCC 调研协作系统

这是 `https://dropaigc.com` 的可运行恢复工程。`frontend/src/` 是按线上界面重新实现的 React 前端源码，`src/server/` 是依据客户端公开 API 契约重建的后端源码，包含协作、上传、知识库、红小八 Agent、报告编辑、万字报告生成和 DOCX 导出。原线上 Next.js 发布包保存在 `public/`，仅作为逐页对照与字体、图标兜底。

## 运行

需要 Node.js 20 或更新版本。

```bash
npm install
DEEPSEEK_API_KEY="你的服务端密钥" \
DEEPSEEK_MODEL="deepseek-v4-flash" \
npm start
```

打开 `http://127.0.0.1:4173`。

不配置密钥时页面仍可运行，红小九会使用本地知识库和证据摘要，报告使用已同步的证据版内容。

## 常用命令

```bash
npm run sync:deployed  # 重新同步公开页面、静态资源和公开数据
npm run build:frontend # 从 React 源码生成 web-dist 生产前端
npm run check          # JavaScript 语法检查
npm test               # 12 个页面 + 核心 API + Agent 降级 + DOCX 冒烟测试
npm run dev            # 文件变更时重启服务端
```

## 已恢复内容

- `/`、`/screen`、`/screen/roadshow`、`/design`、`/review`、`/review/report`
- `/app`、`/library`、`/agent`、`/traces`、`/dashboard`、`/collab`
- 第八组“红八宝 · 八爪鱼组”的 5 名队员、3 天 7 条线路、22 个唯一节点和 48 个队员站点分配
- 调研问题、痛点、方案、协作任务和动态的本地 JSON 开发持久化
- 图片、录音和文本留痕上传，25MB 大小限制
- DeepSeek `deepseek-v4-flash` Agent 问答和四板块长报告生成
- 报告草稿保存、AI 问题/项目建议和标准 DOCX 导出

## 恢复边界

公开发布包没有 source map，因此无法还原原作者的 TSX 文件名、变量名、注释和提交历史。恢复版已在 `frontend/src/` 重新实现可维护前端源码，并从中生成 `web-dist/`；`public/` 保留原发布包作为视觉与行为基准。详见 [架构说明](docs/ARCHITECTURE.md) 与 [恢复设计](docs/plans/2026-07-14-dropaigc-recovery-design.md)。

## 生产部署

Vercel 使用 `api/index.mjs` 和 `vercel.json`。未配置数据库/对象存储时，部署仅用于界面和只读流程评审，函数实例中的写入不会持久保存。生产使用前必须执行 `supabase/migrations/0001_initial_schema.sql`，配置私有媒体 bucket，并接入 PostgreSQL/Storage adapter。详见 [数据库与媒体架构](docs/DATABASE_AND_MEDIA_ARCHITECTURE.md)。

## 密钥安全

`DEEPSEEK_API_KEY` 只从服务端进程环境读取。不要把密钥放进 `public/`、JSON 数据、`.env.example` 或提交历史。此前在聊天中出现过的密钥必须轮换，不能直接用于生产部署。
