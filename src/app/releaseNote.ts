import raw from "../../data/release-note.json";
import { releaseNoteFileSchema, type ReleaseNote } from "../lib/releaseNote.ts";

/**
 * The notes ship inside the build. A file that does not parse is no notes: Home
 * should never break over it. The tests check the file, so a bad one fails CI.
 */
const parsed = releaseNoteFileSchema.safeParse(raw);
export const releaseNotes: readonly ReleaseNote[] = parsed.success ? parsed.data : [];
