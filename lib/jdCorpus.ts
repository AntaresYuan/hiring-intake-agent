import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { parseJdSamples, type JdSample } from "./jdSamples";
import { BUILTIN_JD_STYLE_SAMPLES } from "./jdStyleSamples";

const DEFAULT_JD_DIR = join(process.cwd(), "data", "jd");

export function loadJdSamples(): JdSample[] {
  const localRaw = readLocalJdRawText(DEFAULT_JD_DIR);
  const localSamples = localRaw.flatMap((text) => parseJdSamples(text));
  return dedupeSamples([...BUILTIN_JD_STYLE_SAMPLES, ...localSamples]);
}

function readLocalJdRawText(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => {
      const stat = statSync(path);
      return stat.isFile() && extname(path).toLowerCase() === ".txt";
    })
    .map((path) => readFileSync(path, "utf8"));
}

function dedupeSamples(samples: JdSample[]): JdSample[] {
  const seen = new Set<string>();
  const result: JdSample[] = [];
  for (const sample of samples) {
    const key = sample.position_id || `${sample.title}|${sample.location}|${sample.recruit_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sample);
  }
  return result;
}
