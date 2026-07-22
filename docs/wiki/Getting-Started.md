# 快速开始

## 环境要求

- Node.js 20+
- npm
- 可选：DeepSeek API Key

## 启动

```bash
git clone https://github.com/poboll/rbcc-research.git
cd rbcc-research
npm install
cp .env.example .env.local
npm start
```

浏览器打开 <http://127.0.0.1:4173>。

## 环境变量

```text
ADMIN_TOKEN=管理员令牌
DEEPSEEK_API_KEY=服务端模型密钥
DEEPSEEK_MODEL=deepseek-v4-flash
```

未配置模型密钥时，Agent 会使用本地知识库和现场证据运行降级模式。

## 验证

```bash
npm run check
npm test
npm run build:frontend
```

完整烟测覆盖 15 个页面、知识库、证据链、拓扑、报告版本、Agent 与 DOCX。
