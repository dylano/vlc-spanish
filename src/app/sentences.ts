import framesFile from "../../data/frames.json";
import glueFile from "../../data/glue.json";
import { framesFileSchema, glueSchema } from "../lib/sentences/frames.ts";

/**
 * Sentence frames and glue ship inside the build, like the dictionary. The build
 * validates them first (`scripts/validate-frames.ts`), so this parse is for types.
 */
export const sentences = {
  frames: framesFileSchema.parse(framesFile).frames,
  glue: glueSchema.parse(glueFile),
};
