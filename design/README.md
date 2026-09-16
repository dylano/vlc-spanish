# Design canvas

Source artboards for the quiz screen designs, published as a Claude Design canvas:
<https://claude.ai/artifact/75hQU2j5LgsnYjdJsPpuZ8>

Each `*.dc.html` file is one phone artboard (390×844); `canvas.json` positions them and holds the
sticky notes. The seeded `spanish-vocab-quiz-screens.html` is generated from these and is gitignored
— it is ~2.5MB of editor payload, and `vp check --fix` corrupts it if it is ever formatted.

## What is authoritative

**For screens already built, the app is authoritative, not these files.** Home, the typed quiz, the
three feedback states, settings, and the name picker all shipped — read `src/screens/` for how they
actually behave.

These artboards still earn their place because four of them describe work that does not exist yet:

- `MultipleChoice.dc.html` — distractors drawn from the same part of speech and tag
- `Flashcard.dc.html` / `FlashcardBack.dc.html` — self-marked, with the back doubling as a
  dictionary entry
- `Summary.dc.html` — the correct/almost/missed tally

Delete the superseded ones when Phase 2 lands, rather than letting them drift.

## Changing the design

Edit the `.dc.html` files, then re-seed and republish — the canvas is regenerated from scratch each
time, never edited in place. The `/design` skill carries the exact commands.
