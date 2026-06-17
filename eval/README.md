# 测评框架（eval/）

把「招聘需求澄清 Agent」当被测系统，验证一条核心命题：

> 用人经理丢进来一坨模糊需求，Agent 能不能用**有限轮、高价值**的追问，挖出埋在水下的关键事实（尤其是冲突），最后产出一份 HR 不用从零重问的结构化初稿。

不测「JD 像不像专业文档」。设计借鉴 ClarQ-LLM（hidden-state）、ClarifyMT-Bench（用人经理多种行为）、ProClare（每轮追问是否真的让结果变好）、JobFair（反事实公平），并与产品**共用 DoD 口径**（复用 `lib/gaps`）。

## 结构

| 文件 | 作用 |
|---|---|
| `cards.ts` | 6 张隐藏角色卡:3 张**社招**(极模糊/冲突/缺业务目标) + 3 张**类型错配**(校招要即战力/实习背0-1/转正画饼)。每张带 `recruit_type`,⚠️ **内容待产品方审核** |
| `personas.ts` | 6 类模拟用人经理人格;默认子集 = 配合 + 持续模糊(`EVAL_PERSONAS` 可改) |
| `manager.ts` | 模拟用人经理:挤牙膏、不泄底(不编造与卡矛盾的假事实)、被真追问时松口、如实记录每轮披露了哪些 fact |
| `judge.ts` | reference-anchored 裁判:对着 gold 答案判命中(一次/案),不做开放式打分;额外记 `other_valid_conflicts` |
| `scorer.ts` | 纯函数打分 + `medianScore`(多次取中位),复用 `detectGaps/computeHandoff/checkReasoningChain` |
| `runner.ts` | 驱动 Agent↔模拟经理多轮对话到「可交接」或用尽轮数(默认 10);带 `onTurn` 给 live 流式 |
| `fairness.ts` | 公平/边界 **hard gate**:偏见类走**确定性检查**(看 requirements 有没有把偏见词当采纳标准),越权类走 LLM judge |
| `history.ts` | 历史榜存取(每次跑完落一条);`report.ts` 评分卡(能力维度分 + Pass/Fail 门,**不给单一总分**) |

## 指标

- **关键信息回收率** = 加权回收 / 全部加权关键事实（partial 计半权）
- **澄清效率** = 加权回收 / 轮数（堵「一口气抛 20 个问题」）
- **无依据断言率** = 无依据硬编的事实 / 被断言的事实（对应红线：不替业务方补全事实）
- **冲突发现率** = 暴露的预埋冲突 / 全部预埋冲突；另记 `+N` = 找到的其他真实冲突(不计入率,避免低估)
- **停止准确性** = correct / early(漏了硬事实就交接) / late(用尽轮数没敢交接)。**已与冲突解耦**,只看信息是否足够
- **推导链断链数** = `checkReasoningChain` 结果
- **公平/边界** = Pass/Fail，**任一违规 → 整版不可发布**

## 三个 LLM 角色（用不同 DeepSeek 模型，降低自评偏袒）

| 角色 | 模型（env） | 默认 |
|---|---|---|
| 被测 Agent（产品本体） | `LLM_MODEL` | 建议 `deepseek-v4-pro` |
| 模拟用人经理 | `EVAL_SIM_MODEL` | `deepseek-v4-flash` |
| LLM Judge | `EVAL_JUDGE_MODEL` | `deepseek-v4-pro` |

> ⚠️ Judge 与被测同属 DeepSeek 家族，**非完全独立**。消偏主要靠 reference-anchored 判定（永远对着 gold 答案打分），换 variant 只是辅助;**公平 hard gate 已改成确定性检查、不靠 LLM judge**(它会"看到敏感词就误判")。接口 provider 无关:把 `LLM_BASE_URL`/`LLM_API_KEY` 指向 Claude/OpenAI 即可换真正独立的 judge。

## 看板

`/benchmark`(`npm run dev` 后访问)是历史榜:每次跑完(完整矩阵 **或** 页面「单案 live 运行」)都落一条,按关键信息回收从高到低排名,默认显示最高 3 条、其余折叠在「显示更多」。点开看评分卡 / 逐轮对话。

## 运行

确定性单测（随 `npm test` 一起跑，不打网络）：

```bash
NODE_OPTIONS=--experimental-require-module npm test   # Node<22.12 才需要这个 flag
```

完整真实测评（需 API key,会打网络;`.env.local` 里配好 `LLM_API_KEY` 等）：

```bash
RUN_EVAL=1 EVAL_REPEATS=3 \
LLM_MODEL=deepseek-v4-pro \
EVAL_SIM_MODEL=deepseek-v4-flash EVAL_JUDGE_MODEL=deepseek-v4-pro \
NODE_OPTIONS=--experimental-require-module \
npx vitest run eval/run.test.ts
```

- `EVAL_REPEATS=N` 每案跑 N 次取中位(默认 3,降方差;`=1` 快速过一遍)。
- `EVAL_PERSONAS=cooperative,vague` 自定义人格子集。
- 6 卡 × 默认 2 人格 × 3 次 ≈ 上百次调用、串行,网络慢时要 1 小时+;急可先 `EVAL_REPEATS=1`。

结果打印到控制台、写入 `eval/report.out.{md,json}`,并落一条历史榜(`eval/history/`)。
