/**
 * Print sentences generated from the frames, for reading through.
 *
 *   node scripts/render-frames.ts [--per 12] [--frame id] [--seed 1]
 *
 * Reading this output is the check that catches what a validator cannot: a
 * sentence that is grammatical but odd ("Mi hijo es muy calvo"). Do it whenever
 * frames or the words they draw on change.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { dictionarySchema } from "../src/lib/schema.ts";
import {
  estimateVariety,
  framesFileSchema,
  glueSchema,
  renderFrame,
} from "../src/lib/sentences/frames.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};

const dictionary = dictionarySchema.parse(
  JSON.parse(readFileSync("data/dictionary.json", "utf8")),
).entries;
const glue = glueSchema.parse(JSON.parse(readFileSync("data/glue.json", "utf8")));
const { frames } = framesFileSchema.parse(JSON.parse(readFileSync("data/frames.json", "utf8")));

let state = Number(flag("seed", "1")) * 2_654_435_761;
const random = () => {
  state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return state / 4_294_967_296;
};

const per = Number(flag("per", "12"));
const only = flag("frame", "");

for (const frame of frames) {
  if (only && frame.id !== only) continue;
  const context = { dictionary, glue, random };
  console.log(`\n## ${frame.id}  (~${estimateVariety(frame, context)} sentences)`);
  const seen = new Set<string>();
  for (let attempt = 0; attempt < per * 5 && seen.size < per; attempt++) {
    const sentence = renderFrame(frame, context);
    if (!sentence || seen.has(sentence.es)) continue;
    seen.add(sentence.es);
    console.log(`  ${sentence.es.padEnd(48)} ${sentence.en}`);
  }
}
