# 快速开始

## 环境要求

- Node.js 20+
- npm
- 可选：DeepSeek API Key

## 1. 获取并构建

```bash
git clone https://github.com/poboll/rbcc-research.git
cd rbcc-research
npm install
npm run build:frontend
```

## 2. 启动服务

最小启动：

```bash
ADMIN_TOKEN="请设置一个强随机令牌" npm start
```

浏览器打开 <http://127.0.0.1:4173>。进入 `/admin` 时，输入上述 `ADMIN_TOKEN`。

Node.js 不会自动读取 `.env.local`。需要文件化管理本地变量时，可复制示例并显式加载：

```bash
cp .env.example .env.local
node --env-file=.env.local server.mjs
```

## 环境变量

```bash
ADMIN_TOKEN="请设置一个强随机令牌" \
DEEPSEEK_API_KEY="服务端模型密钥" \
DEEPSEEK_MODEL="deepseek-v4-flash" \
npm start
```

未配置模型密钥时，Agent 会使用本地知识库和现场证据运行降级模式。

## 验证

```bash
npm run check
npm test
npm run build:frontend
```

测试覆盖页面路由、知识库、证据链、拓扑、报告版本、上传文件名与核心 API。

## 常用入口

- `/app`：队员端
- `/collab`：协同 Hub
- `/traces`：留痕库
- `/agent`：红八宝 Agent
- `/dashboard`：四核报告
- `/review`：教师评审
- `/admin`：管理端

下一步阅读[产品使用指南](Product-Guide)。
