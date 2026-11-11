import { normalize } from "../normalize.ts";
import {
  framesToTry,
  renderFrame,
  type Frame,
  type RenderContext,
  type RenderedSentence,
} from "./frames.ts";

/**
 * A whole English sentence to put into Spanish. It is never graded: there are
 * too many valid ways to translate even a short sentence, so the learner compares
 * their version with the one the sentence was rendered from, by eye.
 */
export interface Translation {
  sentence: RenderedSentence;
}

/**
 * Whether a translation is exactly the one the sentence was rendered from,
 * ignoring only capitals, spacing and the closing punctuation. This is not
 * grading — a different translation can be just as right — only a way to say
 * "that is exactly it" when it is. Accents count: a missing one is not a match.
 * Where the English does not show a person's gender (the nurse), the sentence
 * with them in the other gender matches too.
 */
export function matchesTranslation(given: string, translation: Translation): boolean {
  const text = normalize(given);
  const { es, otherGenders = [] } = translation.sentence;
  return text !== "" && [es, ...otherGenders].some((model) => normalize(model) === text);
}

/** A sentence containing an entry, or undefined when no frame can hold it with the words available. */
export function renderTranslation(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
): Translation | undefined {
  for (const { frame, slot } of framesToTry(targets, entryId, context).slice(0, 6)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (!sentence) continue;
    context.usedFrames?.add(frame.id);
    return { sentence };
  }
  return undefined;
}

/** How many sentences "Practice more like this" adds after a translation. */
export const MORE_LIKE_THIS = 3;

/** Renders to try per frame before giving up on finding new sentences in it. */
const ATTEMPTS = 30;

/**
 * Sentences like one just translated, for "Practice more like this": the same
 * frame again with every slot re-rolled. The frame is the structure — its own
 * words, and slots with only one possible word (tener que, hay), stay as they
 * are — so what varies is the content: other verbs, people and things in that
 * structure. Keeping one chosen word instead only drilled that word (three
 * sentences of "mucho" after "Salís mucho"). Of the sentences the frame can
 * make, the ones chosen differ most — from the sentence missed and from each
 * other — so a small frame does not give "the computer" twice. When the frame
 * cannot make enough new sentences, frames sharing its first grammar tag fill
 * in. None repeats a sentence in `seen`.
 */
export function moreLikeThis(
  sentence: RenderedSentence,
  frames: readonly Frame[],
  context: RenderContext,
  seen: Iterable<string>,
  count = MORE_LIKE_THIS,
): Translation[] {
  const frame = frames.find((candidate) => candidate.id === sentence.frameId);
  if (!frame) return [];

  const shown = new Set([...seen, sentence.es].map(normalize));
  const out: Translation[] = [];
  // How many slots two sentences fill differently.
  const apart = (a: RenderedSentence, b: RenderedSentence) =>
    Object.keys({ ...a.fills, ...b.fills }).filter((slot) => a.fills[slot] !== b.fills[slot])
      .length;
  const collect = (from: Frame) => {
    const candidates: RenderedSentence[] = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const made = renderFrame(from, context);
      if (!made || shown.has(normalize(made.es))) continue;
      if (candidates.some((other) => other.es === made.es)) continue;
      candidates.push(made);
    }
    // Greedily, the candidate furthest from everything already shown.
    const picked = [sentence, ...out.map((made) => made.sentence)];
    while (out.length < count && candidates.length > 0) {
      let best = 0;
      let bestScore = -1;
      candidates.forEach((candidate, index) => {
        const score = Math.min(...picked.map((other) => apart(candidate, other)));
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
      const [chosen] = candidates.splice(best, 1);
      shown.add(normalize(chosen!.es));
      picked.push(chosen!);
      out.push({ sentence: chosen! });
    }
  };

  collect(frame);
  const tag = frame.grammar[0];
  if (out.length < count && tag) {
    const related = frames
      .filter((other) => other.id !== frame.id && other.grammar.includes(tag))
      .map((other) => ({ other, order: context.random() }))
      .sort((a, b) => a.order - b.order);
    for (const { other } of related) {
      if (out.length >= count) break;
      collect(other);
    }
  }
  return out;
}
