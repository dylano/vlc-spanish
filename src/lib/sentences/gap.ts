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
 */
export function renderGap(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
  blanks = 1,
  canBlank: (entryId: string) => boolean = () => true,
): Gap | undefined {
  const options = shuffle(targets.get(entryId) ?? [], context.random);
  for (const { frame, slot } of options.slice(0, RENDER_ATTEMPTS)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (!sentence) continue;

    const others = shuffle(
      frame.cloze.filter(
        (name) => name !== slot && sentence.fills[name] && canBlank(sentence.fills[name]!),
      ),
      context.random,
    );
    const chosen = [slot, ...others.slice(0, blanks - 1)];
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
