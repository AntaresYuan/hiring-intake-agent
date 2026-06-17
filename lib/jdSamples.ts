import type { RecruitType } from "./schema";

export type JdJobFamily = "算法" | "产品" | "运营" | "数据分析" | "其他";

export interface JdSample {
  title: string;
  position_id: string;
  location: string;
  recruit_type: RecruitType;
  job_family: JdJobFamily;
  category: string;
  team_intro: string;
  responsibilities: string[];
  requirements: string[];
  bonus_items: string[];
  keywords: string[];
  raw: string;
}

export interface JdFewShotQuery {
  role_title: string;
  recruit_type: RecruitType;
  job_family?: JdJobFamily;
  keywords?: string[];
}

const KEYWORD_CANDIDATES = [
  "大模型",
  "LLM",
  "VLM",
  "Agent",
  "推荐",
  "搜索",
  "多模态",
  "强化学习",
  "RLHF",
  "SFT",
  "RAG",
  "电商",
  "广告",
  "商业化",
  "飞书",
  "抖音",
  "TikTok",
  "数据分析",
  "ROI",
  "SQL",
  "Python",
  "A/B",
  "用户增长",
  "物流",
  "直播",
  "语音",
  "音频",
];

export function parseJdSamples(rawText: string): JdSample[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const descriptionLines = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line === "职位描述")
    .map(({ index }) => index);

  return descriptionLines
    .map((descriptionLine, index) =>
      parseJdAtDescriptionLine(lines, descriptionLine, descriptionLines[index + 1])
    )
    .filter((sample): sample is JdSample => sample !== null);
}

export function selectFewShotSamples(
  samples: JdSample[],
  query: JdFewShotQuery,
  limit = 3
): JdSample[] {
  const queryText = [
    query.role_title,
    query.recruit_type,
    query.job_family ?? "",
    ...(query.keywords ?? []),
  ].join(" ");

  return samples
    .map((sample) => ({ sample, score: scoreSample(sample, query, queryText) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.sample.title.localeCompare(b.sample.title, "zh-Hans-CN"))
    .slice(0, limit)
    .map(({ sample }) => sample);
}

export function inferJdJobFamily(text: string): JdJobFamily {
  if (/数据分析|分析师/.test(text)) return "数据分析";
  if (/运营/.test(text)) return "运营";
  if (/产品|PM/.test(text)) return "产品";
  if (/算法|研发\s*-\s*算法|机器学习|推荐|搜索|语音|音频/.test(text)) return "算法";
  return "其他";
}

function parseJdBlock(block: string): JdSample | null {
  const descriptionIndex = block.indexOf("职位描述");
  const requirementIndex = block.indexOf("职位要求");
  if (descriptionIndex < 0 || requirementIndex < descriptionIndex) return null;

  const header = block.slice(0, descriptionIndex).trim();
  const descriptionText = block.slice(descriptionIndex + "职位描述".length, requirementIndex).trim();
  const requirementText = block.slice(requirementIndex + "职位要求".length).trim();
  const headerLines = header
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const title = headerLines[0] ?? "";
  const meta = headerLines.slice(1).join("｜");
  if (!title) return null;

  const descriptionParts = splitTeamIntro(descriptionText);
  const requirements = splitNumberedItems(requirementText);
  const bonus_items = requirements.filter(isBonusItem);
  const rawForKeywords = `${title} ${meta} ${descriptionText} ${requirementText}`;

  return {
    title,
    position_id: parsePositionId(meta),
    location: parseLocation(meta),
    recruit_type: parseRecruitType(meta),
    job_family: parseJobFamily(title, meta),
    category: parseCategory(meta),
    team_intro: descriptionParts.teamIntro,
    responsibilities: splitNumberedItems(descriptionParts.body),
    requirements: requirements.filter((item) => !isBonusItem(item)),
    bonus_items,
    keywords: extractKeywords(rawForKeywords),
    raw: block,
  };
}

function parseJdAtDescriptionLine(
  lines: string[],
  descriptionLine: number,
  nextDescriptionLine?: number
): JdSample | null {
  const headerStart = findHeaderStart(lines, descriptionLine);
  const requirementLine = findNextLine(lines, descriptionLine + 1, "职位要求");
  if (requirementLine < 0) return null;

  const nextHeaderStart =
    nextDescriptionLine === undefined ? lines.length : findHeaderStart(lines, nextDescriptionLine);
  const block = [
    ...lines.slice(headerStart, descriptionLine),
    "职位描述",
    ...lines.slice(descriptionLine + 1, requirementLine),
    "职位要求",
    ...lines.slice(requirementLine + 1, nextHeaderStart),
  ]
    .join("\n")
    .trim();

  return parseJdBlock(block);
}

function findHeaderStart(lines: string[], descriptionLine: number): number {
  let start = descriptionLine - 1;
  while (start >= 0 && lines[start].trim() && lines[start].trim() !== "职位要求") {
    start -= 1;
  }
  return start + 1;
}

function findNextLine(lines: string[], start: number, target: string): number {
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim() === target) return i;
  }
  return -1;
}

function splitTeamIntro(text: string): { teamIntro: string; body: string } {
  const firstNumbered = text.search(/(?:^|\s)1、/);
  if (text.startsWith("团队介绍") && firstNumbered > 0) {
    return {
      teamIntro: text.slice(0, firstNumbered).trim(),
      body: text.slice(firstNumbered).trim(),
    };
  }
  return { teamIntro: "", body: text };
}

function splitNumberedItems(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = [...normalized.matchAll(/(?:^|\s)(\d+)、/g)];
  if (!matches.length) return [normalized];

  return matches.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return normalized.slice(start, end).trim();
  });
}

function parsePositionId(meta: string): string {
  return meta.match(/职位\s*ID[:：]\s*([A-Za-z0-9]+)/)?.[1] ?? "";
}

function parseLocation(meta: string): string {
  const token = meta
    .split("｜")
    .map((part) => part.trim())
    .find((part) => part && !isMetaToken(part));
  return token ?? "";
}

function parseRecruitType(meta: string): RecruitType {
  if (/实习/.test(meta)) {
    return /转正|ByteIntern/i.test(meta) ? "转正实习" : "日常实习";
  }
  if (/校招|20\d{2}届/.test(meta)) return "校招";
  if (/正式/.test(meta)) return "社招";
  return "";
}

function parseJobFamily(title: string, meta: string): JdJobFamily {
  return inferJdJobFamily(`${title} ${meta}`);
}

function parseCategory(meta: string): string {
  return meta
    .split("｜")
    .map((part) => part.trim())
    .filter((part) => part && !isMetaToken(part))
    .slice(1)
    .join(" - ");
}

function extractKeywords(text: string): string[] {
  return KEYWORD_CANDIDATES.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );
}

function isBonusItem(item: string): boolean {
  return /^加分项[:：]?/.test(item);
}

function isMetaToken(token: string): boolean {
  return /^(正式|实习|职位\s*ID|20\d{2}届|Seed|前沿技术领域人才|校园招聘|日常实习)/.test(token);
}

function scoreSample(sample: JdSample, query: JdFewShotQuery, queryText: string): number {
  let score = 0;
  if (query.recruit_type && sample.recruit_type === query.recruit_type) score += 8;
  if (query.job_family && sample.job_family === query.job_family) score += 6;
  if (query.role_title && sample.title.includes(query.role_title)) score += 5;

  for (const keyword of query.keywords ?? []) {
    if (sample.keywords.includes(keyword) || sample.raw.includes(keyword)) score += 3;
  }

  for (const keyword of sample.keywords) {
    if (queryText.includes(keyword)) score += 1;
  }

  return score;
}
