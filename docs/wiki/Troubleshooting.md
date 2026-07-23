# 故障排查

## 保存后刷新消失

1. 检查浏览器 Network 中写请求是否返回 2xx。
2. Linux 部署确认进程对 `data/` 有写权限，并检查 `data/app-state.json` 更新时间。
3. Vercel 部署确认项目已连接 private Blob，并存在 `BLOB_READ_WRITE_TOKEN`。
4. 若 Vercel 未连接 Blob，实例回收后数据丢失是预期行为。
5. 不要反复执行种子或用仓库中的初始 JSON 覆盖生产状态。

## 图片上传成功但无法预览

- Linux：确认 `data/uploads/` 文件存在、权限正确，并检查媒体记录的 `storedName`。
- Vercel：确认 Blob 对象存在，记录包含 `blobPathname`，令牌仍有效。
- 检查浏览器是否拦截混合内容，以及响应的 MIME 类型是否正确。

## 管理端提示凭证无效

- 确认输入的是当前环境的 `ADMIN_TOKEN`，不是 GitHub、服务器或 Vercel 登录密码。
- 轮换后清除浏览器中旧令牌并重新输入。
- 生产提示“尚未配置”时，在服务器或 Vercel 环境中设置变量并重启/重新部署。

## Agent 无法回答

- 查看 `/api/llm/status` 是否显示模型已配置。
- 检查 `DEEPSEEK_API_KEY`、模型名称和服务器出网。
- 未配置模型时，系统只能使用本地知识与证据的降级能力。
- 知识库没有答案时可以使用模型通识，但界面应明确它不是现场证据。

## 数据数量突然减少

1. 立即暂停写入和部署。
2. 复制当前状态文件或导出当前 Blob 状态。
3. 对比最近备份、发布时间和状态中的 `updatedAt`。
4. 只恢复确认受损的业务状态，不覆盖新增附件。
5. 对 Vercel Blob 并发覆盖问题，优先从备份合并记录，不直接整份回滚。

## 构建或启动失败

```bash
node --version
npm install
npm run check
npm run build:frontend
npm test
```

项目要求 Node.js 20+。若端口被占用，可通过 `PORT` 选择其他端口，但自托管服务固定监听本机回环地址。
