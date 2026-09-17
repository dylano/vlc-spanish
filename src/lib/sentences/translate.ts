import { shuffle } from "../random.ts";
import { renderFrame, type Frame, type RenderContext, type RenderedSentence } from "./frames.ts";

/**
 * A whole English sentence to put into Spanish. It is never graded: there are
 * too many valid ways to translate even a short sentence, so the learner compares
 * their version with the one the sentence was rendered from, by eye.
 */
export interface Translation {
  sentence: RenderedSentence;
}

/** A sentence containing an entry, or undefined when no frame can hold it with the words available. */
export function renderTranslation(
  entryId: string,
  targets: Map<string, { frame: Frame; slot: string }[]>,
  context: RenderContext,
): Translation | undefined {
  for (const { frame, slot } of shuffle(targets.get(entryId) ?? [], context.random).slice(0, 6)) {
    const sentence = renderFrame(frame, context, { [slot]: entryId });
    if (sentence) return { sentence };
  }
  return undefined;
}
