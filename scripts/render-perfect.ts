/**
 * Print every verb's pretérito perfecto with its English, for reading through.
 *
 *   node scripts/render-perfect.ts
 *
 * One line per verb: the participle (marked when irregular), then yo and
 * él/ella in Spanish and English. Reading it is the check a validator cannot
 * make: that "she has gotten up" and "he has had lunch" read as English.
 */
import { readFileSync } from "node:fs";
import { dictionarySchema, type VerbEntry } from "../src/lib/schema.ts";
import { participle, perfectForm } from "../src/lib/sentences/conjugate.ts";
import { perfectVerb } from "../src/lib/sentences/english.ts";

const dictionary = dictionarySchema.parse(
  JSON.parse(readFileSync("data/dictionary.json", "utf8")),
).entries;
const verbs = dictionary.filter((entry): entry is VerbEntry => entry.pos === "verb");

const pad = (text: string, width: number) => text.padEnd(width);
let irregular = 0;
for (const verb of verbs) {
  const made = participle(verb, dictionary);
  if (made?.irregular) irregular++;
  const mark = made?.irregular ? `* (not ${made.regular})` : "";
  const en = verb.en[0]!;
  const spanish =
    perfectForm(verb, "yo", dictionary) && perfectForm(verb, "el", dictionary)
      ? `${perfectForm(verb, "yo", dictionary)} / ${perfectForm(verb, "el", dictionary)}`
      : "(built by the gustar frames: me ha gustado)";
  const english = `I ${perfectVerb(en, "yo")} / she ${perfectVerb(en, "el", "f")}`;
  console.log(
    `${pad(verb.es, 20)} ${pad(`${made?.form ?? "?"} ${mark}`, 24)} ${pad(spanish, 48)} ${english}`,
  );
}
console.log(`\n${verbs.length} verbs, ${irregular} with an irregular participle (*)`);
