# 部署与运维

## 部署选择

| 方式 | 适合 | 持久化 |
| --- | --- | --- |
| Linux + systemd + Nginx | 正式活动、单节点稳定运行 | 本地 JSON 与 uploads |
| Vercel + private Blob | 快速体验、低并发展示 | Blob JSON 与对象 |

## Linux 自托管

```text
HTTPS/Nginx -> 127.0.0.1:4173 -> rbcc-research.service
                                  |-- web-dist/
                                  |-- data/app-state.json
                                  `-- data/uploads/
```

### 环境变量

```text
NODE_ENV=production
PORT=4173
ADMIN_TOKEN=<强随机令牌>
DEEPSEEK_API_KEY=<服务端模型密钥>
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_REPORT_MODEL=deepseek-v4-flash
```

服务只监听 `127.0.0.1`，由 Nginx 提供 HTTPS 和公网入口。

### systemd 示例

```ini
[Unit]
Description=RBCC Research
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/rbcc-research
EnvironmentFile=/etc/rbcc-research.env
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
RestartSec=3
User=rbcc

[Install]
WantedBy=multi-user.target
```

### 发布检查表

1. 本地执行 `npm run check && npm test && npm run build:frontend`。
2. 记录生产问题、留痕、知识、方案和报告数量。
3. 备份 `data/app-state.json` 与 `data/uploads/`。
4. 只同步代码、依赖清单和 `web-dist/`，禁止覆盖生产 `data/`。
5. 安装依赖并重启服务，检查 systemd 和 Nginx 日志。
6. 验证首页、队员端、管理端、Agent、报告下载和媒体预览。
7. 对比发布前后的数据数量与关键记录 ID。

## Vercel 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpoboll%2Frbcc-research&env=ADMIN_TOKEN,DEEPSEEK_API_KEY,DEEPSEEK_MODEL&envDescription=RBCC%20server-side%20configuration)

部署完成后必须：

1. 在 Vercel 项目的 Storage 中创建 private Blob store 并连接项目。
2. 确认自动注入 `BLOB_READ_WRITE_TOKEN`。
3. 设置 `ADMIN_TOKEN`，按需设置 DeepSeek 环境变量。
4. 重新部署，并实际测试保存问题、上传图片、刷新读取和管理导出。

未连接 Blob 时，Vercel Functions 不具备可靠持久化，不能用于正式采集。Blob JSON 也不是事务数据库，多人高并发生产应迁移 PostgreSQL。

## 备份

推荐每日和重要写入前各备份一次：

- `data/app-state.json`
- `data/uploads/`
- 当前 Git commit 和构建时间
- 问题、证据、知识、报告数量清单

备份应与运行目录隔离，并定期验证能否恢复。不要只备份 JSON 而遗漏它引用的附件。

## 回滚

- **代码故障**：切回上一稳定 commit，重新构建并重启，不恢复旧业务数据。
- **数据误操作**：停止写入，先复制当前状态，再基于最近备份和操作时间判断恢复范围。
- **密钥泄露**：立即轮换环境变量，重启服务，并检查访问日志；不要仅删除聊天消息。

## 日常巡检

- 服务与反向代理状态正常。
- `/`、`/api/team-config` 和媒体预览返回成功。
- 磁盘空间足够，uploads 增长符合预期。
- Agent 不在日志中输出密钥或完整敏感材料。
- 定期从管理端导出状态，并抽查问题、证据、方案、报告关联。
