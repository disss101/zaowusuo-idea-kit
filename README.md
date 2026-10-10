# 造物所 IDEA KIT · 线上版

这是造物所 IDEA KIT 的网站源码。完整产品运行在 [造物所在线站点](https://zaowusuo-idea-kit.victoriapoter513.chatgpt.site/)；`public/` 包含网站页面和图片，服务端接口位于 `app/api/`。

`docs/` 是 GitHub Pages 的静态入口页，保留首页的品牌封面，并引导访问在线站点。GitHub Pages 不运行本站的登录、AI 生成、数据库或文件存储；这些功能仍由现有在线服务提供。请勿将模型密钥、支付凭据或其他运行时密钥提交到仓库。

线上版使用 Sites 的 Worker 提供 API，并通过 R2 持久保存玩家作品和上传文件。浏览、搜索、下载对访问者开放；发布作品需要先使用 ChatGPT 登录。每件作品可包含配件表及 1–5 个 PDF、PNG、JPG、WebP 或 ZIP 文件，总大小不超过 25 MB。服务器会核验文件内容与扩展名，并将下载以附件形式提供。

设计方案由服务端调用千问生成：`QWEN_FAST_MODEL` 默认 `qwen-flash` 用于追问，`QWEN_PLAN_MODEL` 默认 `qwen-plus` 用于完整方案。`QWEN_API_KEY` 作为 Sites 密钥变量保存，浏览器不接触密钥；`QWEN_API_ENDPOINT` 可按密钥所属地域配置。生成前需登录，每个账号每天最多请求 10 次；同一玩家的相同需求可读取缓存，不重复消耗模型调用。服务端只接受零件库里的器件，并自行计算测试参考价。输出的型号是选型参考，尚未确认供应商料号、现货和实物兼容性。AI 内容与电路、结构和安全性仍需团队实测。

玩家现在可提交待审核的零件订单需求，工作人员可在账号页进入订单工作台，查看配件表及联系方式并更新审核状态。`ADMIN_EMAIL` 是仅在服务端使用的工作人员邮箱允许名单。提交订单需求不产生付款或正式报价。官方作品是标注清楚的概念示例。在线收款、造物币兑换与付费解锁仍需确定规则并接入支付服务；公开运营前，团队还需要建立投稿审核、举报处理、版权与隐私说明。公开视频和 Google 字体仍依赖各自的外部地址。

`.openai/hosting.json` 保存站点身份与 `BUCKET` 存储绑定。运行时凭据由 Sites 管理，不应写入源码。修改视觉后，先在 `../idea-kit` 构建，再将构建结果同步到本目录的 `public/`；只编辑 `public/` 的线上专属购买页提示时，注意不要被下次同步覆盖。

AI 接口：`POST /api/clarify` 用 Flash 提取关键问题；`POST /api/design` 用 Plus 生成结构化方案并保存项目；`GET /api/projects` 和 `GET /api/projects/:id` 只返回当前登录者的项目；`POST /api/projects/:id/progress` 更新当前制作步骤；`POST /api/projects/:id/guide` 根据项目零件和有限历史提供制作指导；`POST /api/projects/:id/inspect` 发送不超过约 3 MB 的图片给视觉模型，图片不在站点存储。指导当前为试用额度，未与购买权益绑定。三个模型默认分别为 `qwen-flash`、`qwen-plus`、`qwen3-vl-flash`，可用 `QWEN_FAST_MODEL`、`QWEN_PLAN_MODEL`、`QWEN_VISION_MODEL` 调整。默认 API 地址为北京地域的 OpenAI 兼容端点，其他地域需设置 `QWEN_API_ENDPOINT` 为对应的完整 `/chat/completions` 地址。已有 `DEEPSEEK_API_KEY` 保留在环境中，但不参与当前调用。

每次模型调用在 R2 的 `ai-model-usage/` 下记录模型、Token、耗时、错误类型与北京地域公开原价下的粗略费用估算；实际账单、缓存优惠和其他地域价格应以百炼控制台为准。服务端仍会校验零件 ID、主控、电机驱动、摄像头主控搭配并自行计算价格，但当前零件库没有完整的电压、电流、GPIO、库存和测试数据，方案始终标为待工程验证。制作导师不能替代已验证接线图或人工支持。运行 `node --test tests/ai-design.test.mjs tests/payments.test.mjs` 和 `node scripts/run-framework.mjs build` 可检查当前改动。
