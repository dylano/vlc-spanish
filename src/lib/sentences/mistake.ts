import type { Grade } from "../grade.ts";
import { differsOnlyByAccent, foldAccents, normalize } from "../normalize.ts";
import { shuffle } from "../random.ts";
import type { AdjEntry, Entry, NounEntry, VerbEntry } from "../schema.ts";
import { verbForm } from "./conjugate.ts";
import { SUBJECTS, type Subject } from "./english.ts";
import {
  adjectiveForm,
  DIRECT_OBJECT,
  framesToTry,
  likeForm,
  nounForm,
  renderFrame,
  slotCandidates,
  spanishPlural,
  type Frame,
  type RenderContext,
  type RenderedSentence,
} from "./frames.ts";

/*
 * Find the Mistake: a correct rendered sentence with exactly one slot broken in
 * a way that is unambiguously wrong. Most breaks change a form the sentence
 * itself decides — agreement, number, person; a "word" break swaps in another
 * word that fits just as well (primo for sobrino), which only the English cue
 * shows is wrong. Either way the cue plus the rest of the Spanish show what it
 * should be.
 */

export type MistakeKind = "agreement" | "number" | "person" | "word" | "hay-estar" | "muy-mucho";

export interface Mistake {
  /** The sentence as it should read. */
  sentence: RenderedSentence;
  slot: string;
  entryId: string;
  kind: MistakeKind;
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

/*
 * No break swaps an article (el for la). It was the easiest mistake to spot and
 * nearly every noun offered one, and finding it meant reading a whole sentence
 * for one letter. Gender is still tested: an english → spanish noun card wants
 * its article, and adjectives break their agreement.
 */

/**
 * When a word can be broken by its form and also swapped for another word, how
 * often the form break is used. Word swaps are available for almost every slot,
 * so without this they were three quarters of all mistakes.
 */
const FORM_SHARE = 0.75;

/**
 * In a frame with a direct object pronoun, how often the mistake is the pronoun
 * rather than the word the sentence was aimed at. The pronoun is what those
 * frames are for; aimed at it alone, a session met each of the four once.
 */
const PRONOUN_SHARE = 0.75;

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

function sameMeaning(a: Entry, b: Entry): boolean {
  const glosses = new Set(a.en.map((gloss) => gloss.trim().toLowerCase()));
  return a.es === b.es || b.en.some((gloss) => glosses.has(gloss.trim().toLowerCase()));
}

/**
 * Another word that fits the slot exactly as the right one does — same gender,
 * number and person, so nothing but the word is wrong — and that means
 * something else, so the English cue gives it away. Undefined when none does.
 */
function wordSwap(
  frame: Frame,
  sentence: RenderedSentence,
  slot: string,
  entry: Entry,
  dictionary: Entry[],
  random: () => number,
): Break | undefined {
  const spec = frame.slots[slot];
  const detail = sentence.slots[slot];
  if (!spec || !detail || spec.kind === "glue" || spec.kind === "word" || spec.kind === "pronoun")
    return undefined;
  if (spec.kind === "verb" && detail.liked) return undefined;
  // A slot the English does not say ("¿Me pones un café?" is "Can I have a
  // coffee?") has no cue to give a swap away: "¿Me traes un café?" is just as right.
  if (frame.en.includes(`{${slot}:none}`)) return undefined;
  const right = detail.accepts[0]!;
  const inSentence = new Set(Object.values(sentence.fills));
  const gender = detail.gender === "f" ? "f" : "m";
  const number = detail.number ?? "sg";

  for (const other of shuffle(slotCandidates(spec, { dictionary }), random)) {
    if (other.id === entry.id || inSentence.has(other.id) || sameMeaning(entry, other)) continue;
    let wrong: string | undefined;
    if (spec.kind === "noun" && other.pos === "noun") {
      // The article stays as shown, so the other word must take the same one.
      if (other.gender === "mf") {
        wrong = number === "pl" ? (other.forms?.pl ?? spanishPlural(other.es)) : other.es;
      } else if (
        detail.gender !== "mf" &&
        !other.elSingular === !(entry.pos === "noun" && entry.elSingular)
      ) {
        wrong = nounForm(other, gender, number);
      }
    } else if (spec.kind === "adj" && other.pos === "adj") {
      wrong = adjectiveForm(other, gender, number);
    } else if (spec.kind === "verb" && other.pos === "verb" && detail.subject) {
      wrong = verbForm(other, detail.subject, dictionary);
    }
    if (!wrong || normalize(wrong) === normalize(right)) continue;
    return {
      kind: "word",
      wrong,
      right,
      explanation: `the sentence means ${entry.en[0]!.replace(/^to /, "")}: ${right}`,
    };
  }
  return undefined;
}

/** A noun slot as shown, article and all, in lower case: "el cine", "muchos parques". */
function phraseText(sentence: RenderedSentence, slot: string): string {
  return sentence.segments
    .filter((part) => part.slot === slot && part.text !== "")
    .map((part) => part.text)
    .join(" ")
    .toLowerCase();
}

/**
 * hay put where estar belongs, or the other way round. hay becomes está or
 * están, agreeing with what follows it. estar becomes hay only when its subject
 * is shown with el or la — something known; after "hay un cine. Está cerca",
 * "Hay cerca" would not be a clear mistake.
 */
function hayEstarBreak(
  frame: Frame,
  sentence: RenderedSentence,
  slot: string,
  entry: Entry,
  right: string,
): Break | undefined {
  if (entry.id === "hay") {
    const at = sentence.segments.findIndex((part) => part.slot === slot);
    const noun = sentence.segments
      .slice(at + 1)
      .find((part) => part.slot && frame.slots[part.slot]?.kind === "noun")?.slot;
    if (!noun) return undefined;
    const number = sentence.slots[noun]?.number ?? "sg";
    const negated = /\bno\s$/i.test(sentence.segments[at - 1]?.text ?? "");
    const what = sentence.segments
      .slice(at + 1)
      .filter((part) => part.slot && part.slot !== noun && frame.slots[part.slot]?.kind === "adj")
      .map((part) => part.text);
    return {
      kind: "hay-estar",
      wrong: number === "pl" ? "están" : "está",
      right,
      explanation: `hay says what there is: ${negated ? "no " : ""}hay ${[...what, phraseText(sentence, noun)].join(" ")}`,
    };
  }
  const detail = sentence.slots[slot];
  if (entry.id !== "estar" || !detail?.agreesWith) return undefined;
  if (!frame.es.includes(`{${detail.agreesWith}:el}`)) return undefined;
  return {
    kind: "hay-estar",
    wrong: "hay",
    right,
    explanation: `estar says where something known is: ${phraseText(sentence, detail.agreesWith)} ${right}`,
  };
}

/** The slot of the nearest filled word before (-1) or after (1) this one. */
function neighbour(sentence: RenderedSentence, slot: string, step: 1 | -1): string | undefined {
  const filled = sentence.segments.filter((part) => part.slot && !part.article);
  const at = filled.findIndex((part) => part.slot === slot);
  return filled[at + step]?.slot;
}

/**
 * The mix-up English speakers make between "very" and "a lot": mucho before an
 * adjective (es mucho tranquilo) or muy after a verb (trabajo muy). Both are
 * always wrong, so the break needs no frame tag, only the word beside it.
 */
function muyMuchoBreak(
  frame: Frame,
  sentence: RenderedSentence,
  slot: string,
  entry: Entry,
  right: string,
): Break | undefined {
  const after = neighbour(sentence, slot, 1);
  if (entry.id === "muy" && after && frame.slots[after]?.kind === "adj") {
    return {
      kind: "muy-mucho",
      wrong: "mucho",
      right,
      explanation: `before an adjective it is muy: muy ${wordText(sentence, after)}`,
    };
  }
  const before = neighbour(sentence, slot, -1);
  if (entry.id === "mucho-2" && before && frame.slots[before]?.kind === "verb") {
    return {
      kind: "muy-mucho",
      wrong: "muy",
      right,
      explanation: `after a verb it is mucho: ${wordText(sentence, before).toLowerCase()} mucho`,
    };
  }
  return undefined;
}

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
        wrong: otherGender,
        right,
        explanation: `${noun} is ${describe(gender, number)}, so ${right}`,
      });
    }
    const otherNumber = adjectiveForm(entry as AdjEntry, gender, number === "pl" ? "sg" : "pl");
    if (otherNumber !== right) {
      out.push({
        kind: "number",
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
        wrong: other,
        right,
        explanation: `it describes ${noun}, who is ${gender === "f" ? "female" : "male"}, so ${right}`,
      });
    }
  }

  // A direct object pronoun in the wrong gender or number: lo for la, lo for los.
  if (spec.kind === "pronoun" && detail.agreesWith) {
    const noun = wordText(sentence, detail.agreesWith);
    const gender = detail.gender === "f" ? "f" : "m";
    const number = detail.number ?? "sg";
    const explanation = `it stands for ${noun}, ${describe(gender, number)}, so ${right}`;
    out.push(
      {
        kind: "agreement",
        wrong: DIRECT_OBJECT[gender === "f" ? "m" : "f"][number],
        right,
        explanation,
      },
      {
        kind: "number",
        wrong: DIRECT_OBJECT[gender][number === "pl" ? "sg" : "pl"],
        right,
        explanation,
      },
    );
    return out;
  }

  // Gustar and the like: break the agreement with what is liked (me gusta los
  // zapatos) — the classic mistake — or the person's pronoun.
  if (spec.kind === "verb" && entry.pos === "verb" && detail.subject && detail.liked) {
    const number = detail.number ?? "sg";
    const likedSlot = frame.slots[detail.liked];
    const thing =
      likedSlot?.kind === "verb" ? "an activity" : wordText(sentence, detail.liked) || "it";
    const otherNumber = likeForm(
      entry as VerbEntry,
      detail.subject,
      number === "pl" ? "sg" : "pl",
      dictionary,
    );
    if (otherNumber && normalize(otherNumber) !== normalize(right)) {
      out.push({
        kind: "number",
        wrong: otherNumber,
        right,
        explanation:
          likedSlot?.kind === "verb"
            ? `${thing} takes the singular: ${right}`
            : `${thing} is ${number === "pl" ? "plural" : "singular"}, so ${right}`,
      });
    }
    return out;
  }

  // hay says what there is (hay un cine, hay muchos parques); estar says where
  // something known is (el cine está cerca). Swapped, either is plainly wrong,
  // so only frames written for the contrast offer it.
  if (frame.grammar.includes("hay-estar")) {
    const hayEstar = hayEstarBreak(frame, sentence, slot, entry, right);
    if (hayEstar) out.push(hayEstar);
  }

  const muyMucho = muyMuchoBreak(frame, sentence, slot, entry, right);
  if (muyMucho) out.push(muyMucho);

  const swap = wordSwap(frame, sentence, slot, entry, dictionary, random);
  if (swap) out.push(swap);

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
        wrong,
        right,
        explanation: `for ${subjectText} it is ${right}`,
      });
      break;
    }
  }

  return out;
}

/** The mistake renderMistake returns, before its frame is recorded as used. */
function findMistake(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
): Mistake | undefined {
  const entry = context.dictionary.find((candidate) => candidate.id === entryId);
  if (!entry) return undefined;

  for (const { frame, slot } of framesToTry(targets, entryId, context).slice(0, 8)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (!sentence) continue;

    const pronounSlot = Object.keys(frame.slots).find(
      (name) => name !== slot && frame.slots[name]!.kind === "pronoun" && sentence.fills[name],
    );
    if (pronounSlot && context.random() < PRONOUN_SHARE) {
      const pronoun = context.dictionary.find((other) => other.id === sentence.fills[pronounSlot])!;
      const [chosen] = shuffle(
        breaksFor(frame, sentence, pronounSlot, pronoun, context.dictionary, context.random),
        context.random,
      );
      if (chosen) {
        return {
          sentence,
          slot: pronounSlot,
          entryId: pronoun.id,
          ...chosen,
          accepts: acceptsFor(chosen),
        };
      }
    }

    const breaks = shuffle(
      breaksFor(frame, sentence, slot, entry, context.dictionary, context.random),
      context.random,
    );
    if (breaks.length === 0) continue;

    // A form break (agreement, number, person) leads when the word offers one; a
    // word swap is close to always available, so unweighted it took over.
    const form = breaks.find((option) => option.kind !== "word");
    const swap = breaks.find((option) => option.kind === "word");
    const chosen = form && swap ? (context.random() < FORM_SHARE ? form : swap) : (form ?? swap)!;
    return { sentence, slot, entryId, ...chosen, accepts: acceptsFor(chosen) };
  }
  return undefined;
}

/**
 * A sentence with one mistake aimed at an entry: the entry fills the broken
 * slot, or, in a frame with a direct object pronoun, usually the pronoun does
 * (`entryId` says which). Undefined when no frame holding the entry can be
 * broken cleanly.
 */
export function renderMistake(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
): Mistake | undefined {
  const mistake = findMistake(entryId, targets, context);
  if (mistake) context.usedFrames?.add(mistake.sentence.frameId);
  return mistake;
}

/** What counts as a fix: the whole corrected text, or the one word that changed. */
function acceptsFor(chosen: Break): string[] {
  const accepts = [chosen.right];
  const word = changedWord(chosen.right, chosen.wrong);
  if (word) accepts.push(word);
  return accepts;
}

/**
 * The broken sentence as tappable words. A word belongs to the mistake if it is
 * part of the broken text; tapping any of them counts as finding it.
 */
export function mistakeTokens(mistake: Mistake): MistakeToken[] {
  const tokens: MistakeToken[] = [];
  for (const segment of mistake.sentence.segments) {
    const broken = segment.slot === mistake.slot && !segment.article;
    let text = broken ? mistake.wrong : segment.text;
    // Keep the capital if the broken text starts a sentence (the renderer gave it one).
    if (broken && /^\p{Lu}/u.test(segment.text)) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    for (const match of text.matchAll(/(\p{L}+)|([^\p{L}]+)/gu)) {
      // Spaces inside the broken text belong to it too, so replacing the broken
      // words with the fix does not leave their gaps behind.
      tokens.push({ text: match[0], word: match[1] !== undefined, broken });
    }
  }
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
