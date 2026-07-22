# RBCC Research

> RBCC 2026 人机共生调研协作与成果汇报系统

[![Release](https://img.shields.io/github/v/release/poboll/rbcc-research)](https://github.com/poboll/rbcc-research/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-rbcc.caiths.com-0070f3)](https://rbcc.caiths.com)

**在线体验：<https://rbcc.caiths.com>**

**项目 Wiki：<https://github.com/poboll/rbcc-research/wiki>**

RBCC Research 是“红八宝 · 八爪鱼组”为 RBCC 2026 挑战营构建的调研协作产品。它将队员分散在手机、现场笔记、访谈和照片中的材料组织成一条可追溯的研究链路：

> 预设问题 -> 现场留痕 -> 事实与推断分层 -> 痛点验证 -> 方案试验 -> 四核报告 -> 教师评审 -> 26 幕路演

系统同时覆盖手机端现场采集、桌面协作、管理员数据治理、教师评审和投影汇报。所有进度、比例和拓扑均由真实业务数据计算，避免用固定演示数字替代调研过程。

## 产品角色

- **调研队员**：按日期、线路和站点维护预设问题，上传图片、录音和文字，填写验证结论。
- **小组协作者**：查看五名成员的进度、思考矩阵、证据缺口、共识与分歧。
- **管理员**：管理成员、路线、问题、证据、知识、痛点、方案、报告版本和 DOCX 定稿。
- **教师与汇报人员**：沿推荐路径查看证据、方案、报告和 26 幕全功能路演。

## 核心能力

### 现场调研与证据

- 队员端根据身份展示本人三天路线、站点和任务。
- 问题支持开拓/迭代标签，以及成立、部分成立、推翻、待验证状态。
- 图片、录音和文字留痕关联成员、日期、线路、站点、问题和证据类型。
- 图片上传前在浏览器转换为 WebP 并压缩，留痕库支持多条件筛选与大图预览。

### 红八宝 Agent

- 优先检索团队知识库、现场留痕、问题、痛点和方案。
- 回答中区分本组事实、成员推断、访谈原声、通识补充和待验证项。
- 支持从留痕提炼观察、从观察收敛痛点、从痛点形成试验方案并加入报告。
- 团队资料未覆盖时可使用 DeepSeek 通识补充，但不会将其冒充为现场证据。

### 闭环、报告与路演

- 首页和协同 Hub 连接“队员 -> 站点 -> 问题 -> 证据 -> 痛点 -> 方案 -> 报告”。
- 四核报告包含现状扫描、人群共情、痛点诊断和分析对策，并保留引用记录。
- 支持工作稿、AI 版本和管理员 DOCX 定稿三层报告状态。
- 教师评审页提供代表站点、证据深链、报告阶段和 Word 下载。
- 26 幕路演读取真实调研数据，支持播放、暂停、前后切换及键盘控制。

## 页面入口

| 路由 | 用途 |
| --- | --- |
| `/` | 全组作战视图与调研闭环拓扑 |
| `/app` | 队员任务、问题验证与现场上传 |
| `/collab` | 协同 Hub、五人思考矩阵与全组进展 |
| `/traces` | 现场留痕库、筛选与证据预览 |
| `/agent` | 红八宝 Agent 对话与材料提炼 |
| `/knowledge`、`/library` | 知识来源、检索与节点资料 |
| `/dashboard` | 四核报告编辑与版本管理 |
| `/review` | 教师评审路径与成果查看 |
| `/screen`、`/screen/roadshow` | 投影大屏与 26 幕路演 |
| `/design` | 大屏密度、字号和画布参数 |
| `/admin` | 成员、路线、证据、知识和报告管理 |

## 技术架构

### 前端

- React 19、Vite 6、Lucide React。
- 单页应用覆盖手机采集、桌面协作、评审与投影场景。
- CSS 变量驱动深浅主题，统一导航、按钮、表单、弹窗和响应式布局。

### 后端与数据

- Node.js ESM HTTP 服务，API、静态资源和媒体下载由同一服务提供。
- `src/server/api.mjs` 负责输入校验、媒体上传、Agent、报告和管理接口。
- `src/server/store.mjs` 提供本地 JSON 持久化和单实例写队列。
- 生产状态保存在服务器 `data/app-state.json`，媒体保存在 `data/uploads/`。
- DOCX 通过 `docx` 生成；PDF、DOCX、Markdown、TXT、CSV 和 JSON 可挂载为知识来源。
- DeepSeek 密钥只从服务端环境变量读取，不进入浏览器包、仓库或业务数据。

当前生产采用单节点 JSON 存储，适合本次挑战营的协作规模。它不是事务数据库；如果未来扩展到多实例或高并发，应将业务状态迁移到 PostgreSQL，对象文件迁移到独立对象存储。

## 本地运行

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/poboll/rbcc-research.git
cd rbcc-research
npm install
cp .env.example .env.local
npm start
```

默认地址：<http://127.0.0.1:4173>

启用模型能力时配置：

```bash
DEEPSEEK_API_KEY="服务端密钥" \
DEEPSEEK_MODEL="deepseek-v4-flash" \
npm start
```

未配置模型密钥时，系统仍能使用现场证据和本地知识库运行降级模式。

## 开发与验证

```bash
npm run dev             # 构建前端并监听服务端变化
npm run dev:frontend    # 启动 Vite 前端开发服务
npm run build:frontend  # 生成 web-dist 生产前端
npm run check           # 检查关键服务端语法
npm test                # 文件名、存储、15 页面与核心 API 烟测
```

## 自托管部署

生产站点运行在 Linux 服务器，通过 systemd 管理 Node.js 服务，并由 Nginx 反向代理：

```text
Browser -> HTTPS/Nginx -> 127.0.0.1:4173 -> Node.js API
                                           |-- data/app-state.json
                                           `-- data/uploads/
```

发布时只同步代码和 `web-dist`，不得覆盖生产 `data/`。部署前必须备份 `app-state.json` 与 `uploads/`，部署后检查问题、留痕、知识和报告数量。详细步骤见 [部署与运维 Wiki](https://github.com/poboll/rbcc-research/wiki/Deployment-and-Operations)。

## 文档

- [项目 Wiki](https://github.com/poboll/rbcc-research/wiki)
- [快速开始](https://github.com/poboll/rbcc-research/wiki/Getting-Started)
- [产品使用指南](https://github.com/poboll/rbcc-research/wiki/Product-Guide)
- [系统架构](https://github.com/poboll/rbcc-research/wiki/Architecture)
- [部署与运维](https://github.com/poboll/rbcc-research/wiki/Deployment-and-Operations)
- [仓库内架构文档](docs/ARCHITECTURE.md)
- [数据与媒体结构](docs/DATABASE_AND_MEDIA_ARCHITECTURE.md)

## 安全说明

- `ADMIN_TOKEN`、`DEEPSEEK_API_KEY` 等密钥只允许配置在服务器环境中。
- 不执行自动种子覆盖生产状态，不把生产数据或上传文件提交到 Git。
- 管理写操作要求服务端校验 `x-admin-token`，删除与发布操作需要二次确认。
- 任何曾出现在聊天、日志或历史文件中的密钥都应及时轮换。

## License

本项目采用 [MIT License](LICENSE)。
