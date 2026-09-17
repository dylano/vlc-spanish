import raw from "../../data/dictionary.json";
import { dictionarySchema, type Entry } from "../lib/schema.ts";

/**
 * The dictionary ships inside the build. Nothing in the app writes words, so
 * `data/dictionary.json` is the only copy and a deploy is how new words arrive.
 * The build validates it first (`scripts/validate-dictionary.ts`), so this parse
 * is for types, not a gate.
 */
export const entries: Entry[] = dictionarySchema.parse(raw).entries;
