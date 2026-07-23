# RBCC Research Wiki

欢迎来到 RBCC 2026“红八宝 · 八爪鱼组”调研协作与成果汇报系统文档中心。

- 正式网站：<https://rbcc.caiths.com>
- 源代码：<https://github.com/poboll/rbcc-research>
- 最新版本：<https://github.com/poboll/rbcc-research/releases/latest>

## 从这里开始

| 我想要…… | 阅读 |
| --- | --- |
| 理解为什么做这个产品 | [为什么与设计原则](Vision-and-Principles) |
| 在本地把项目跑起来 | [快速开始](Getting-Started) |
| 学会从调研到汇报的完整操作 | [产品使用指南](Product-Guide) |
| 理解前后端、Agent 与数据流 | [系统架构](Architecture) |
| 管理员登录并安全配置权限 | [安全与管理员访问](Security-and-Admin) |
| 部署、备份、升级和回滚 | [部署与运维](Deployment-and-Operations) |
| 解决上传、数据、Agent 或部署故障 | [故障排查](Troubleshooting) |
| 查看版本能力 | [版本与发布](Releases) |

## 产品主线

```text
路线与角色
  -> 预设问题
  -> 图片 / 录音 / 文字留痕
  -> 成立 / 部分成立 / 推翻 / 待验证
  -> 跨站点痛点
  -> 最小试验方案
  -> 四核报告与 DOCX 定稿
  -> 教师评审与 26 幕路演
```

系统的关键不是生成更多文字，而是让每个结论都有上下文，让五个人的研究过程可以被检查、修正、复用和讲述。

## 四类使用者

- **调研队员**：在 `/app` 完成问题、现场证据和验证结论。
- **小组协作者**：在 `/collab` 查看五人进度、共识、分歧和证据缺口。
- **管理员**：在 `/admin` 治理路线、知识、证据、报告版本与 DOCX 定稿。
- **教师与汇报人员**：通过 `/review` 和 `/screen/roadshow` 阅读成果与现场演示。

> 管理端没有公开默认密码。管理员访问由服务端 `ADMIN_TOKEN` 控制，详见[安全与管理员访问](Security-and-Admin)。
