<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# hiring-intake-agent — Agent 须知

> 招聘需求澄清 Agent。产品说明见 `README.md`;离线评测见 `eval/README.md`。

## 环境 / 运行坑(本机已踩,务必照做)

- **Node ≥ 22.12**(或 20.19+)。本机是 22.9 → 跑 vitest / next 前加 `NODE_OPTIONS=--experimental-require-module`,否则 `ERR_REQUIRE_ESM`。升级 Node 即可去掉此 flag。
- **npm optional-deps bug**:若报 `Cannot find native binding @rolldown/binding-darwin-x64`,执行
  `npm i --no-save @rolldown/binding-darwin-x64@$(node -p "require('rolldown/package.json').version")`。
- **别把项目放 `~/Downloads`**:macOS TCC 可能整体撤销进程对 Downloads 的访问(连 Read/Edit 都挡)。

## 命令速查

- `npm run dev` — 起服务 (localhost:3000);`/benchmark` 是评测看板(历史榜 + 单案 live)
- `npm test` — vitest 确定性单测(不打网络;gated 的真实评测会跳过)
- 完整评测 — `RUN_EVAL=1 npx vitest run eval/run.test.ts`(详见 `eval/README.md`)
- `npm run build` — 生产构建

## 环境变量(`.env.local`,已 gitignore;模板见 `.env.example`)

- 产品 LLM:`LLM_API_KEY`、`LLM_BASE_URL`(默认 api.deepseek.com)、`LLM_MODEL`(代码默认 `deepseek-chat`,实际用 `deepseek-v4-pro`)。**无 key → mock 模式**仍可跑闭环。
- 评测专用:`RUN_EVAL=1` 开关、`EVAL_REPEATS`(每案跑几次取中位,默认 3)、`EVAL_PERSONAS`、`EVAL_SIM_MODEL`(默认 flash)、`EVAL_JUDGE_MODEL`(默认 pro)。

## 架构红线(改代码前必读)

- **行为是 agent,实现是 workflow controller + 每轮单次 LLM 调用**。不挂工具做 function-calling 多轮循环,不做 RAG。
- `lib/agent.ts` 的 `runTurn({history, state})` 是大脑;`app/api/chat/route.ts` 只是它的薄 HTTP 包装。
- **确定性逻辑全在代码侧、近 0 token,别挪进 LLM**:缺口/停止判定 `lib/gaps.ts`、岗位知识与数值冲突 `lib/kb.ts`、交接产物 `lib/handoff.ts`。LLM 只做开放语言部分(拆解/分类/语义冲突/措辞/选项)。
- **DoD 按招聘类型裁剪**:`state.recruit_type`(社招/校招/转正实习/日常实习),`computeHandoff` 对不同类型用不同硬条件——**别假设都是社招**(社招要 KPI量化目标/职级/内部转岗;实习要日薪/到岗时长、不背 KPI)。
- LLM 客户端(`lib/llm.ts`、`eval/llm.ts`)带 **90s 超时 + 2 次重试,别删**——否则一次卡住的请求会吊死整轮。
- 产品红线:不退化成 JD 生成器;不伪量化软能力;不固化偏见(年龄/性别/学历);不替 HR 拍板(职级/薪资/筛选)。
