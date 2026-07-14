# 前端恢复说明

## 证据结论

线上站点由 Next.js App Router 构建，界面由 React 客户端渲染，使用 Tailwind 工具类、Lucide 图标与 Geist 字体。公开服务器未发布 source map，因此原始 TSX 模块边界、源码变量名和注释不可逆恢复。

`public/` 保存的是浏览器实际执行的完整前端：HTML、JavaScript chunks、CSS、字体、图标和 PWA manifest。它不是截图，也不是静态仿制页面；路由、按钮、筛选、表单、轮询、离线队列和报告编辑仍由原发布代码执行。

## 页面入口

| 路由 | 主要用途 |
| --- | --- |
| `/` | 作战室、KPI、报告快捷入口、协作拓扑 |
| `/screen` | 协作大屏 |
| `/screen/roadshow` | 全功能路演 |
| `/design` | 设计模式 |
| `/review` | 教师评审首页 |
| `/review/report` | 单站点评审正文 |
| `/app` | 队员身份、走访路线、现场采集 |
| `/library` | 调研节点库 |
| `/agent` | 红小九协同 Agent 与知识库 |
| `/traces` | 留痕库 |
| `/dashboard` | 四板块报告工作台 |
| `/collab` | 协同 Hub |

## 关键客户端契约

- Agent：`POST /api/agent/chat`，返回 `reply`、`mode`、`citations`、`suggestedQuestions`。
- 留痕：`POST /api/media/upload`；按成员、站点和类型查询 `/api/media`。
- 报告：读取 `/api/research-report`，草稿写入 `/api/research-report/draft`，生成或导出仍使用 `/api/research-report`。
- 协作：轮询 `/api/agent/feed` 和 `/api/collab`。
- 离线：浏览器本地队列保存待同步留痕，联网后重试上传。

重新抓取前端使用 `npm run sync:deployed`。同步器会补齐所有入口文档及其引用的静态 chunks，并同步公开数据作为本地种子。
