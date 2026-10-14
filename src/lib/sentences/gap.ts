import type { Grade } from "../grade.ts";
import {
  differsOnlyByAccent,
  differsOnlyInEnding,
  editDistance,
  foldAccents,
  normalize,
} from "../normalize.ts";
import { shuffle } from "../random.ts";
import type { Entry, VerbEntry } from "../schema.ts";
import { verbForm } from "./conjugate.ts";
import { SUBJECTS, type Subject } from "./english.ts";
import {
  directObjectAgreement,
  framesToTry,
  DIRECT_OBJECT,
  isDirectObject,
  likeForm,
  renderFrame,
  slotCandidates,
  spanishPlural,
  type Frame,
  type RenderContext,
  type RenderedSentence,
} from "./frames.ts";

export interface GapBlank {
  slot: string;
  entryId: string;
  /** The text shown after answering: the form this sentence needed. */
  expected: string;
}

/**
 * A sentence with one or more slots blanked out. The first blank chosen is the
 * word being practised; any others are further words in the same sentence.
 */
export interface Gap {
  sentence: RenderedSentence;
  /** In the order they appear in the sentence. */
  blanks: GapBlank[];
}

/**
 * Where each entry can be the gap: entry id → the frames and cloze slots that
 * could hold it. Built once per session from the frames' slot selections.
 */
export function gapTargets(
  frames: Frame[],
  context: Pick<RenderContext, "dictionary" | "eligible">,
): Map<string, { frame: Frame; slot: string }[]> {
  const targets = new Map<string, { frame: Frame; slot: string }[]>();
  for (const frame of frames) {
    for (const slot of frame.cloze) {
      const spec = frame.slots[slot];
      if (!spec || spec.kind === "glue") continue;
      for (const entry of slotCandidates(spec, context)) {
        // A pronoun only fits a frame whose noun has its number: los never stands for el pan.
        if (spec.kind === "pronoun") {
          const noun = frame.slots[spec.agree];
          const number = noun?.kind === "noun" ? noun.number : "sg";
          if (directObjectAgreement(entry.id)?.number !== number) continue;
        }
        targets.set(entry.id, [...(targets.get(entry.id) ?? []), { frame, slot }]);
      }
    }
  }
  return targets;
}

/** How many attempts at different frames before giving up on an entry. */
const RENDER_ATTEMPTS = 6;

/**
 * A gap aimed at an entry, or undefined when no frame can hold it with the words
 * available. Up to `blanks` slots are blanked: the aimed one, then others from
 * the frame's cloze list, so a frame with fewer useful slots gives fewer blanks.
 * `canBlank` limits which other words may be blanked.
 *
 * In a frame with a direct object pronoun the pronoun is the point, so it is
 * always among the blanks: as a second one, past `blanks`, when `limit` allows.
 */
export function renderGap(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
  blanks = 1,
  canBlank: (entryId: string) => boolean = () => true,
  limit = blanks,
): Gap | undefined {
  const options = framesToTry(targets, entryId, context);
  for (const { frame, slot } of options.slice(0, RENDER_ATTEMPTS)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (!sentence) continue;

    const shuffled = shuffle(
      frame.cloze.filter(
        (name) => name !== slot && sentence.fills[name] && canBlank(sentence.fills[name]!),
      ),
      context.random,
    );
    const isPronoun = (name: string) => frame.slots[name]?.kind === "pronoun";
    const others = [...shuffled.filter(isPronoun), ...shuffled.filter((name) => !isPronoun(name))];
    const count = others.some(isPronoun) ? Math.max(blanks, Math.min(2, limit)) : blanks;
    const chosen = [slot, ...others.slice(0, count - 1)];
    const position = (name: string) =>
      sentence.segments.findIndex((part) => part.slot === name && !part.article);
    if (chosen.some((name) => position(name) < 0)) continue;

    // Always leave some Spanish showing: a sentence that is nothing but blanks
    // ("___ ___.") gives the learner only the English to go on. Drop extra blanks
    // until at least one word outside them remains.
    const showsSpanish = () =>
      sentence.segments.some(
        (part) =>
          /\p{L}/u.test(part.text) && !(part.slot && !part.article && chosen.includes(part.slot)),
      );
    while (chosen.length > 1 && !showsSpanish()) chosen.pop();
    if (!showsSpanish()) continue;

    context.usedFrames?.add(frame.id);
    return {
      sentence,
      blanks: chosen
        .sort((a, b) => position(a) - position(b))
        .map((name) => ({
          slot: name,
          entryId: sentence.fills[name]!,
          expected: sentence.slots[name]!.accepts[0]!,
        })),
    };
  }
  return undefined;
}

/**
 * Share out an answer typed into one blank over the blanks that follow it with
 * nothing but a space between: "los quiere" in the first of "Sí, ___ ___."
 * fills both. Each blank takes as many words as its expected form has, the
 * last of the run takes the rest. Undefined when there is nothing to share: one
 * word too few for a spill, or no blank right after this one.
 */
export function spreadAnswer(
  gap: Gap,
  index: number,
  typed: string,
): Map<number, string> | undefined {
  const words = typed.trim().split(/\s+/).filter(Boolean);
  const position = (blank: GapBlank) =>
    gap.sentence.segments.findIndex((part) => part.slot === blank.slot && !part.article);
  // The run of blanks from this one, each separated from the next by spaces only.
  const run = [index];
  while (run.length < gap.blanks.length - index) {
    const here = position(gap.blanks[run.at(-1)!]!);
    const next = position(gap.blanks[run.at(-1)! + 1]!);
    const between = gap.sentence.segments.slice(here + 1, next);
    if (next <= here || between.some((part) => part.text.trim() !== "")) break;
    run.push(run.at(-1)! + 1);
  }
  const wordsIn = (blankIndex: number) => gap.blanks[blankIndex]!.expected.split(/\s+/).length;
  if (run.length < 2 || words.length <= wordsIn(index)) return undefined;

  const out = new Map<number, string>();
  let at = 0;
  run.forEach((blankIndex, step) => {
    const take = step === run.length - 1 ? words.length - at : wordsIn(blankIndex);
    out.set(blankIndex, words.slice(at, at + take).join(" "));
    at += take;
  });
  // Stop at the last blank that got something, so a short answer does not blank the rest.
  for (const [blankIndex, text] of [...out].reverse()) {
    if (text !== "") break;
    out.delete(blankIndex);
  }
  return out.size > 1 ? out : undefined;
}

const SPANISH_SUBJECT: Record<Subject, string> = {
  yo: "yo",
  tu: "tú",
  el: "él or ella",
  nosotros: "nosotros",
  vosotros: "vosotros",
  ellos: "ellos",
};

/** Every inflected form of an entry, for recognising a right word in the wrong form. */
function formsOf(entry: Entry, dictionary: Entry[]): string[] {
  switch (entry.pos) {
    case "verb":
      return SUBJECTS.map((subject) => verbForm(entry as VerbEntry, subject, dictionary) ?? "");
    case "adj": {
      const feminine = entry.forms?.f;
      return [
        entry.es,
        feminine ?? "",
        entry.forms?.pl ?? spanishPlural(entry.es),
        feminine ? spanishPlural(feminine) : "",
      ];
    }
    case "noun": {
      const feminine = entry.forms?.f;
      return [
        entry.es,
        feminine ?? "",
        entry.forms?.pl ?? "",
        feminine ? spanishPlural(feminine) : "",
      ];
    }
    default:
      // lo, la, los and las are one word in four forms, chosen by the noun.
      if (isDirectObject(entry))
        return Object.values(DIRECT_OBJECT).flatMap((by) => Object.values(by));
      return [entry.es, ...Object.values(entry.forms ?? {})];
  }
}

function describeAgreement(gender: string | undefined, number: string | undefined): string {
  const genderWord = gender === "f" ? "feminine" : gender === "m" ? "masculine" : "";
  return [genderWord, number === "pl" ? "plural" : ""].filter(Boolean).join(" ") || "singular";
}

/**
 * Grade the word typed into one blank of a gap. Each blank is graded against
 * the sentence as shown, not against what was typed in the other blanks.
 *
 * Anything the slot accepts is correct; the same with only an accent wrong is
 * "hard". The right word in the wrong form is wrong — agreement and conjugation
 * are what a gap tests — with a note naming the rule. A single-letter slip on
 * anything else is "hard", as in the typed quiz.
 */
export function gradeGap(
  gap: Gap,
  blank: GapBlank,
  given: string,
  entry: Entry,
  dictionary: Entry[],
): Grade {
  const detail = gap.sentence.slots[blank.slot]!;
  const expected = blank.expected;
  const answer = normalize(given);
  const accepts = detail.accepts.map(normalize);

  if (answer === "") return { result: "wrong", expected };
  if (accepts.includes(answer)) return { result: "correct", expected };

  const nearAccent = detail.accepts.find((accepted) =>
    differsOnlyByAccent(normalize(accepted), answer),
  );
  if (nearAccent)
    return { result: "hard", expected, note: `almost — check the accent: ${nearAccent}` };

  // Gustar and the like: the right verb with the wrong agreement or pronoun is
  // wrong, not a near miss, however close the spelling (me gusta for me gustan).
  if (detail.liked && entry.pos === "verb" && detail.subject) {
    const segments = gap.sentence.segments;
    const liked = gap.sentence.slots[detail.liked];
    // A liked noun has a gender; a liked infinitive (leer) has none.
    const isActivity = !!liked && liked.gender === undefined;
    const thing = segments.find((part) => part.slot === detail.liked && !part.article)?.text ?? "";
    for (const person of SUBJECTS) {
      for (const number of ["sg", "pl"] as const) {
        const form = likeForm(entry as VerbEntry, person, number, dictionary);
        if (!form || foldAccents(normalize(form)) !== foldAccents(answer)) continue;
        const note =
          person !== detail.subject
            ? `right verb, wrong person: for ${detail.agreesWith ? (segments.find((part) => part.slot === detail.agreesWith && !part.article)?.text ?? "") : SPANISH_SUBJECT[detail.subject]} it is ${expected}`
            : isActivity
              ? `an activity takes the singular: ${expected}`
              : `${thing} is ${detail.number === "pl" ? "plural" : "singular"}, so ${expected}`;
        return { result: "wrong", expected, note };
      }
    }
  }

  // le is the indirect object (le gusta). Using it for a person (le veo) is
  // leísmo, which the class has not met; it is not a slip of lo.
  if (isDirectObject(entry) && (answer === "le" || answer === "les")) {
    const noun = detail.agreesWith
      ? (gap.sentence.segments.find((part) => part.slot === detail.agreesWith && !part.article)
          ?.text ?? "")
      : "";
    return {
      result: "wrong",
      expected,
      note: `${answer} is for an indirect object (${answer} gusta); ${noun ? `for ${noun}` : "here"} it is ${expected}`,
    };
  }

  const otherForm = formsOf(entry, dictionary)
    .filter(Boolean)
    .some((form) => foldAccents(normalize(form)) === foldAccents(answer));
  if (otherForm) {
    const segments = gap.sentence.segments;
    if (entry.pos === "verb" && detail.subject) {
      const subjectText = detail.agreesWith
        ? (segments.find((part) => part.slot === detail.agreesWith && !part.article)?.text ?? "")
        : SPANISH_SUBJECT[detail.subject];
      return {
        result: "wrong",
        expected,
        note: `right verb, wrong person: for ${subjectText} it is ${expected}`,
      };
    }
    if (detail.agreesWith) {
      const noun =
        segments.find((part) => part.slot === detail.agreesWith && !part.article)?.text ?? "";
      const nounDetail = gap.sentence.slots[detail.agreesWith];
      return {
        result: "wrong",
        expected,
        note: `right word, wrong form: ${noun} is ${describeAgreement(nounDetail?.gender, nounDetail?.number)}, so ${expected}`,
      };
    }
    return { result: "wrong", expected, note: `right word, wrong form: here it is ${expected}` };
  }

  // A different word the learner actually knows is a confusion, not a typo:
  // padre for madre is one letter away but means something else.
  const otherWord = dictionary.find(
    (candidate) =>
      candidate.id !== entry.id &&
      [candidate.es, ...Object.values(candidate.forms ?? {})].some(
        (form) => typeof form === "string" && foldAccents(normalize(form)) === foldAccents(answer),
      ),
  );
  if (otherWord) {
    return { result: "wrong", expected, note: `‘${given.trim()}’ is ${otherWord.en[0]}` };
  }

  // As in the typed quiz, the last letter of a noun or adjective carries gender
  // and number, so a change there is a mistake about the language, not a slip.
  const inflects = entry.pos === "noun" || entry.pos === "adj";
  const slip = accepts.some(
    (accepted) =>
      editDistance(foldAccents(answer), foldAccents(accepted), 1) <= 1 &&
      !(inflects && differsOnlyInEnding(foldAccents(accepted), foldAccents(answer))),
  );
  if (slip) {
    return { result: "hard", expected, note: "almost — check the spelling" };
  }
  return { result: "wrong", expected, note: entry.notes };
}
