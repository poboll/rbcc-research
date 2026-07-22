# 部署与运维

## 当前生产结构

正式网站：<https://rbcc.caiths.com>

```text
HTTPS/Nginx -> 127.0.0.1:4173 -> rbcc-research.service
                                  |-- web-dist/
                                  |-- data/app-state.json
                                  `-- data/uploads/
```

## 发布原则

1. 在本地运行语法检查、测试和前端构建。
2. 记录生产问题、留痕、知识和报告数量。
3. 备份 `data/app-state.json` 与 `data/uploads/`。
4. 只同步服务端代码和 `web-dist/`，禁止覆盖生产 `data/`。
5. 重启 Node.js 服务，检查 systemd 状态、首页和关键 API。
6. 复核发布前后的数据数量和媒体预览。

## 环境变量

- `ADMIN_TOKEN`：管理端服务端令牌。
- `DEEPSEEK_API_KEY`：模型服务密钥。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`。
- `HOST`、`PORT`：默认监听 `127.0.0.1:4173`。

## 备份与回滚

- 代码异常时回滚代码版本，不回滚或重置业务数据。
- 数据变更前单独创建带时间戳的状态和 uploads 备份。
- 不执行生产自动种子，不从开发环境覆盖生产状态。
- 密钥泄露后应立即轮换，并检查服务日志和访问记录。
