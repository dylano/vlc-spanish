import raw from "../../data/dictionary.json";
import { dictionarySchema, type Entry } from "../lib/schema.ts";

/**
 * The dictionary ships inside the build. Nothing in the app writes words, so a
 * copy in Blobs would only be a second source of truth to keep in sync; bundling
 * the file means a deploy is the import. The build validates it first
 * (`scripts/validate-dictionary.ts`), so this parse is for types, not a gate.
 */
export const entries: Entry[] = dictionarySchema.parse(raw).entries;
