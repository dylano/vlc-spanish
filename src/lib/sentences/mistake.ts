import type { Grade } from "../grade.ts";
import { differsOnlyByAccent, foldAccents, normalize } from "../normalize.ts";
import { shuffle } from "../random.ts";
import type { AdjEntry, Entry, NounEntry, VerbEntry } from "../schema.ts";
import { verbForm } from "./conjugate.ts";
import { SUBJECTS, type Subject } from "./english.ts";
import {
  adjectiveForm,
  nounForm,
  renderFrame,
  type Frame,
  type RenderContext,
  type RenderedSentence,
} from "./frames.ts";

/*
 * Spot the mistake: a correct rendered sentence with exactly one slot broken in
 * a way that is unambiguously wrong. Every kind of break changes a form the
 * sentence itself decides — agreement, person, article — so the English cue plus
 * the rest of the Spanish always show that it is wrong and what it should be.
 */

export type MistakeKind = "agreement" | "number" | "person" | "article";

export interface Mistake {
  /** The sentence as it should read. */
  sentence: RenderedSentence;
  slot: string;
  entryId: string;
  kind: MistakeKind;
  /** Whether the broken text is the slot's article rather than its word. */
  article: boolean;
  /** The broken text, as shown. */
  wrong: string;
  /** The text it should be. */
  right: string;
  /** Fixes accepted when typed: the whole corrected text, or just the word that changed. */
  accepts: string[];
  explanation: string;
}

export interface MistakeToken {
  text: string;
  /** A word that can be tapped; separators (spaces, punctuation) cannot. */
  word: boolean;
  /** Part of the broken text: its words and the spaces between them. */
  broken: boolean;
}

const OTHER_ARTICLE: Record<string, string> = {
  el: "la",
  la: "el",
  los: "las",
  las: "los",
  un: "una",
  una: "un",
  unos: "unas",
  unas: "unos",
};

const SUBJECT_TEXT: Record<Subject, string> = {
  yo: "yo",
  tu: "tú",
  el: "él or ella",
  nosotros: "nosotros",
  vosotros: "vosotros",
  ellos: "ellos",
};

function describe(gender: string | undefined, number: string | undefined): string {
  const genderWord = gender === "f" ? "feminine" : gender === "m" ? "masculine" : "";
  return [genderWord, number === "pl" ? "plural" : "singular"].filter(Boolean).join(" ");
}

function wordText(sentence: RenderedSentence, slot: string | undefined): string {
  return sentence.segments.find((part) => part.slot === slot && !part.article)?.text ?? "";
}

/** The words that differ between two texts of the same length in words, if exactly one does. */
function changedWord(right: string, wrong: string): string | undefined {
  const a = right.split(" ");
  const b = wrong.split(" ");
  if (a.length !== b.length) return undefined;
  const differing = a.filter((word, index) => word !== b[index]);
  return differing.length === 1 ? differing[0] : undefined;
}

type Break = Omit<Mistake, "sentence" | "slot" | "entryId" | "accepts">;

/** Every way this slot of this sentence can be broken, each producing different text. */
function breaksFor(
  frame: Frame,
  sentence: RenderedSentence,
  slot: string,
  entry: Entry,
  dictionary: Entry[],
  random: () => number,
): Break[] {
  const spec = frame.slots[slot];
  const detail = sentence.slots[slot];
  if (!spec || !detail) return [];
  const right = detail.accepts[0]!;
  const out: Break[] = [];

  if (spec.kind === "adj" && entry.pos === "adj" && detail.agreesWith) {
    const noun = wordText(sentence, detail.agreesWith);
    const gender = detail.gender === "f" ? "f" : "m";
    const number = detail.number ?? "sg";
    const otherGender = adjectiveForm(entry as AdjEntry, gender === "f" ? "m" : "f", number);
    if (otherGender !== right) {
      out.push({
        kind: "agreement",
        article: false,
        wrong: otherGender,
        right,
        explanation: `${noun} is ${describe(gender, number)}, so ${right}`,
      });
    }
    const otherNumber = adjectiveForm(entry as AdjEntry, gender, number === "pl" ? "sg" : "pl");
    if (otherNumber !== right) {
      out.push({
        kind: "number",
        article: false,
        wrong: otherNumber,
        right,
        explanation: `${noun} is ${describe(gender, number)}, so ${right}`,
      });
    }
  }

  if (spec.kind === "noun" && entry.pos === "noun" && detail.agreesWith && entry.gender !== "mf") {
    const noun = wordText(sentence, detail.agreesWith);
    const gender = detail.gender === "f" ? "f" : "m";
    const other = nounForm(entry as NounEntry, gender === "f" ? "m" : "f", detail.number ?? "sg");
    if (other && other !== right) {
      out.push({
        kind: "agreement",
        article: false,
        wrong: other,
        right,
        explanation: `it describes ${noun}, who is ${gender === "f" ? "female" : "male"}, so ${right}`,
      });
    }
  }

  // Swapping el/la only breaks a noun with one gender, and only an article the
  // sentence still shows (a contracted "al" has none to swap).
  if (spec.kind === "noun" && entry.pos === "noun" && entry.gender !== "mf") {
    const article = sentence.segments.find((part) => part.slot === slot && part.article);
    const swapped = article ? OTHER_ARTICLE[article.text.toLowerCase()] : undefined;
    if (article && swapped) {
      const noun = wordText(sentence, slot);
      out.push({
        kind: "article",
        article: true,
        wrong: swapped,
        right: article.text,
        explanation: `${noun} is ${detail.gender === "f" ? "feminine" : "masculine"}: ${article.text.toLowerCase()} ${noun}`,
      });
    }
  }

  if (spec.kind === "verb" && entry.pos === "verb" && detail.subject) {
    const subject = detail.subject;
    const subjectText = detail.agreesWith
      ? wordText(sentence, detail.agreesWith)
      : SUBJECT_TEXT[subject];
    const others = shuffle(
      SUBJECTS.filter((other) => other !== subject),
      random,
    );
    for (const other of others) {
      const wrong = verbForm(entry as VerbEntry, other, dictionary);
      if (!wrong || normalize(wrong) === normalize(right)) continue;
      out.push({
        kind: "person",
        article: false,
        wrong,
        right,
        explanation: `for ${subjectText} it is ${right}`,
      });
      break;
    }
  }

  return out;
}

/**
 * A sentence with one mistake aimed at an entry: the entry fills the broken
 * slot. Undefined when no frame holding the entry can be broken cleanly.
 */
export function renderMistake(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
): Mistake | undefined {
  const entry = context.dictionary.find((candidate) => candidate.id === entryId);
  if (!entry) return undefined;

  for (const { frame, slot } of shuffle(targets.get(entryId) ?? [], context.random).slice(0, 8)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (!sentence) continue;
    const [chosen] = shuffle(
      breaksFor(frame, sentence, slot, entry, context.dictionary, context.random),
      context.random,
    );
    if (!chosen) continue;

    const accepts = [chosen.right];
    const word = changedWord(chosen.right, chosen.wrong);
    if (word) accepts.push(word);
    return { sentence, slot, entryId, ...chosen, accepts };
  }
  return undefined;
}

/**
 * The broken sentence as tappable words. A word belongs to the mistake if it is
 * part of the broken text; tapping any of them counts as finding it.
 */
export function mistakeTokens(mistake: Mistake): MistakeToken[] {
  const tokens: MistakeToken[] = [];
  const segments = mistake.sentence.segments;
  segments.forEach((segment, index) => {
    const broken = segment.slot === mistake.slot && Boolean(segment.article) === mistake.article;
    let text = broken ? mistake.wrong : segment.text;
    // Keep the sentence's capital if the broken text starts it.
    if (broken && index === segments.findIndex((part) => /\p{L}/u.test(part.text))) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    for (const match of text.matchAll(/(\p{L}+)|([^\p{L}]+)/gu)) {
      // Spaces inside the broken text belong to it too, so replacing the broken
      // words with the fix does not leave their gaps behind.
      tokens.push({ text: match[0], word: match[1] !== undefined, broken });
    }
  });
  return tokens;
}

/** Grade the fix typed for a mistake that was found. */
export function gradeFix(mistake: Mistake, given: string): Grade {
  const answer = normalize(given);
  const expected = mistake.right;
  if (mistake.accepts.some((accepted) => normalize(accepted) === answer)) {
    return { result: "correct", expected, note: mistake.explanation };
  }
  const nearAccent = mistake.accepts.find((accepted) =>
    differsOnlyByAccent(normalize(accepted), answer),
  );
  if (nearAccent) {
    return { result: "hard", expected, note: `almost — check the accent: ${nearAccent}` };
  }
  if (foldAccents(answer) === foldAccents(normalize(mistake.wrong))) {
    return {
      result: "wrong",
      expected,
      note: `that is the mistake itself: ${mistake.explanation}`,
    };
  }
  return { result: "wrong", expected, note: mistake.explanation };
}
