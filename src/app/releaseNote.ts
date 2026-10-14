import raw from "../../data/release-note.json";
import { releaseNoteFileSchema, type ReleaseNote } from "../lib/releaseNote.ts";

/**
 * The note ships inside the build. A note that does not parse is no note: Home
 * should never break over it. The tests check the file, so a bad one fails CI.
 */
const parsed = releaseNoteFileSchema.safeParse(raw);
export const releaseNote: ReleaseNote | null = parsed.success ? parsed.data : null;
