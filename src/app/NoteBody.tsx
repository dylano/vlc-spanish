import { emphasis } from "../lib/releaseNote.ts";

/** A note's text with its *starred* words in italics, wherever a note is shown. */
export default function NoteBody({ body }: { body: string }) {
  return (
    <>
      {emphasis(body).map((run, index) =>
        run.italic ? <i key={index}>{run.text}</i> : <span key={index}>{run.text}</span>,
      )}
    </>
  );
}
