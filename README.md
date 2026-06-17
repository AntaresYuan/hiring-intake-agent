# 招聘需求澄清 Agent (hiring-intake-agent)

把**用人经理**第一次抛出的、模糊的招聘想法，通过有限轮、高信息价值的对话，转化为一份信息较完整、争议点清楚、责任边界明确的「业务招聘需求初稿」，再交给 HR 校准。

> 核心价值不是替 HR 写更漂亮的 JD，而是降低 HR 从零追问和反复沟通的成本。**AI 不取代 HR。**

## 产品闭环

1. 用人经理用自然语言描述招聘需求（通常模糊、有缺失、有内部冲突）。
2. Agent 先**诊断**：识别模糊词、缺失信息、内部冲突（不直接生成 JD）。
3. 每轮只问 **1-2 个信息增益最高的问题**，优先问业务目标和核心任务。
4. 持续维护一份**结构化状态**（需求初稿），逐项归一化（量化 / 行为化 / 分级 / 案例锚定 / 偏见风险标记）。
5. 满足停止条件后生成 **HR 交接视图**：区分已确认事实 / AI 识别项 / 业务取舍 / 未确认假设 / HR 待校准项。

底层推导链（每项能力都可追溯）：
`业务目标 → 成功结果 → 核心任务 → 所需能力 → 岗位行为 → 候选人证据 → 面试验证`

## 技术栈

- Next.js 16 (App Router) + TypeScript + Tailwind
- LLM 层 provider 无关（默认 DeepSeek，OpenAI 兼容端点）

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入 LLM_API_KEY
npm run dev                   # http://localhost:3000
```

> **Node ≥ 22.12**;若用 22.9 等旧版,命令前加 `NODE_OPTIONS=--experimental-require-module`,否则报 `ERR_REQUIRE_ESM`。

未配置 API key 时自动走 **mock 模式**，产品闭环仍可跑通（用于离线演示）。

环境变量（换 Claude / OpenAI 只需改这三个）：

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

公网 demo 可加通行令，避免无关访问消耗 token：

```
ACCESS_CODE=123456                 # 面试官输入的通行令；本地不填则关闭门禁
ACCESS_SECRET=一段更长的随机字符串  # 用于签名访问 cookie，建议部署时填写
```

## 部署建议

- 快速演示可先部署到 Vercel，并在 Project Environment Variables 填入 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`ACCESS_CODE`、`ACCESS_SECRET`。
- 大陆访问 Vercel 不保证稳定；如面试现场网络不稳，建议准备一个香港/新加坡云服务器部署作为备用链接。
- 不建议依赖 Vercel 自带 Password Protection；当前应用内置通行令，前端入口和 `/api/chat`、`/api/export`、`/api/eval/run` 都会做服务端校验。

## 测试

```bash
npm test       # vitest：确定性单测（解析容错 / DoD / 打分口径），不打网络
```

## 评测（benchmark）

`eval/` 是离线评测:用隐藏角色卡 + 模拟用人经理跑多轮对话,量化「有限轮挖出关键事实/冲突」的能力,并含公平/边界 hard gate。看板在 `/benchmark`(历史榜 + 单案 live 运行)。详见 [`eval/README.md`](eval/README.md)。

## 目录

```
app/
  page.tsx              对话 + 三视图工作台
  api/chat/route.ts     单轮澄清入口
  components/           诊断看板 / 需求初稿 / HR 交接视图
lib/
  schema.ts             结构化状态 Schema（产品骨架，含 recruit_type）
  prompts.ts            澄清框架系统 Prompt（产品核心）
  agent.ts              单轮编排 + 解析容错
  gaps.ts               缺口/停止判定（DoD 按招聘类型裁剪，代码侧 0 token）
  kb.ts                 岗位知识库 + 数值冲突检测
  handoff.ts            HR 交接简报 / A2A prompt（确定性拼装）
  llm.ts                provider 无关 LLM 客户端（带超时/重试）
  mock.ts               无 key 时的离线闭环
eval/                   离线评测框架 + /benchmark 看板（见 eval/README.md）
```
