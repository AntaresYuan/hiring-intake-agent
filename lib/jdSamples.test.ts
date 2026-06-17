import { describe, expect, it } from "vitest";
import { inferJdJobFamily, parseJdSamples, selectFewShotSamples } from "./jdSamples";

const RAW_JDS = `
大模型算法工程师-Data
北京 ｜正式｜研发 - 算法｜职位 ID：A165230A
职位描述
1、主导大模型的整体研发规划，结合行业特点与业务需求，制定微调、对齐、部署等技术方案； 2、负责语料、知识图谱的收集、清洗、标注与优化，构建高质量行业训练数据集，提升模型在行业场景下的理解、生成与推理能力； 3、负责大模型后训练与优化：设计和实施持续预训练（CPT）方案，适配垂类领域知识；主导SFT、RLHF/RLAIF等后训练阶段的全流程。
职位要求
1、本科及以上学历，计算机、人工智能、数学等相关专业，有大模型研发相关经验（有明确模型落地案例者优先）； 2、精通大模型持续预训练、微调（如LoRA、QLoRA、RLHF等）、蒸馏等技术，熟悉主流大模型框架，具备独立完成模型研发与优化的能力； 3、具备扎实的机器学习、深度学习、自然语言处理（NLP）基础。



AI产品经理-抖音电商
上海｜正式｜产品 - 产品经理｜职位 ID：A175492A
职位描述
1、负责抖音电商AI产品，聚焦探索AI+电商的全新购物模式，为用户和商家提供全新的AI交易模式和体验； 2、协同算法、技术、运营团队，通过数据驱动优化，将人工运营的经验转化为AI可落地的策略； 3、加入快速成长的业务团队，跟随业务从“10到100”的突破。
职位要求
1、对AI产品有深入的了解和充分实践经验，保持对相关领域的学习和探索； 2、对数据敏感，能快速发掘业务现状和数据结果之间的联系，擅长从数据中挖掘机会点并进行策略制定和落地； 3、沟通表达能力好，强执行力，自驱力强。



AI搜索算法实习生-Seed大模型人才实习
杭州｜实习｜研发 - 算法｜Seed大模型人才实习招聘｜职位 ID：A91211
职位描述
团队介绍：字节跳动 Seed 团队成立于 2023 年，致力于寻找通用智能的新方法。 1、基于AI建设下一代搜索引擎，并服务于AI Agents，包括全网搜索、视频搜索、商品搜索、本地搜索、图片搜索、视觉搜索、结构化检索等； 2、基于LLM/VLM大幅突破搜索排序、召回、内容理解、个性化等任务。
职位要求
1、2028届及以后本科及以上学历在读，计算机、人工智能等相关专业优先； 2、优秀的代码能力、数据结构和基础算法功底，熟练掌握C++或Python； 3、熟悉深度学习算法，有一定的算法应用经验和出色的技术判断能力； 4、加分项：有ACM/ICPC等比赛获奖、在顶会发表相关论文、有顶级开源项目经验等。



AI产品实习生（研发平台方向）-开发者服务
杭州｜实习｜产品 - 产品经理｜ByteIntern｜职位 ID：A10875A
职位描述
ByteIntern：面向2027届毕业生（2026年9月-2027年8月期间毕业），为符合岗位要求的同学提供转正机会。 1、负责研究大语言模型在研发场景的应用，制定应用层的产品策略和规划； 2、了解大语言模型技术，对接技术团队，确保产品开发的技术可行性。
职位要求
1、2027届本科及以上学历在读，计算机、人工智能、自动化、数学相关专业优先； 2、具备一定的技术理解能力，对大语言模型技术有浓厚兴趣； 3、热爱创新，有AI Coding类产品或者通用Agent类产品经验优先。
`;

describe("parseJdSamples", () => {
  it("把字节 JD 原文拆成 schema-friendly 样本", () => {
    const samples = parseJdSamples(RAW_JDS);

    expect(samples).toHaveLength(4);
    expect(samples[0]).toMatchObject({
      title: "大模型算法工程师-Data",
      position_id: "A165230A",
      location: "北京",
      recruit_type: "社招",
      job_family: "算法",
    });
    expect(samples[0].responsibilities).toHaveLength(3);
    expect(samples[0].requirements[1]).toContain("LoRA");
    expect(samples[0].keywords).toEqual(expect.arrayContaining(["大模型", "SFT", "RLHF"]));
  });

  it("识别正式产品岗和实习算法岗的招聘类型/岗位族", () => {
    const samples = parseJdSamples(RAW_JDS);

    expect(samples[1]).toMatchObject({
      title: "AI产品经理-抖音电商",
      recruit_type: "社招",
      job_family: "产品",
      category: "产品 - 产品经理",
    });
    expect(samples[2]).toMatchObject({
      recruit_type: "日常实习",
      job_family: "算法",
      team_intro: expect.stringContaining("Seed 团队"),
    });
    expect(samples[2].bonus_items[0]).toContain("ACM/ICPC");
    expect(samples[3]).toMatchObject({
      recruit_type: "转正实习",
      job_family: "产品",
    });
  });
});

describe("selectFewShotSamples", () => {
  it("按招聘类型、岗位族和关键词挑选 few-shot", () => {
    const samples = parseJdSamples(RAW_JDS);
    const selected = selectFewShotSamples(samples, {
      role_title: "搜索算法实习生",
      recruit_type: "日常实习",
      job_family: "算法",
      keywords: ["搜索", "LLM", "Agent"],
    });

    expect(selected[0].title).toBe("AI搜索算法实习生-Seed大模型人才实习");
  });
});

describe("inferJdJobFamily", () => {
  it("产品运营归到运营族，产品经理归到产品族", () => {
    expect(inferJdJobFamily("AI产品运营（智能助手）-抖音生活服务 运营 - 产品运营")).toBe("运营");
    expect(inferJdJobFamily("AI产品经理-抖音电商 产品 - 产品经理")).toBe("产品");
  });
});
