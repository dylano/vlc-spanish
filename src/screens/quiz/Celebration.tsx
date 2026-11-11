import { useState } from "react";
import ReactConfetti from "react-confetti";

/**
 * Confetti on the summary of a perfect session: one blast up from the foot of
 * the screen, which then falls away, and the canvas is removed. A surprise, so
 * nothing announces it. It never blocks a tap, and anyone who has asked their
 * device for less motion gets none.
 *
 * The colours are the app's own (src/index.css): the accent, the amber and the
 * red, each in its light and its dark version, so it suits either theme.
 */
const COLORS = ["#2f6d4f", "#7ecfa0", "#9a6b12", "#e0b357", "#a83a2c", "#ef8378"];

const GRAVITY = 0.25;

function reducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The launch speed (pixels a frame) that would carry a piece a share of the way
 * up the screen, before air slows it: so the blast peaks on screen, on a phone
 * or a tall desktop window alike, rather than flying off the top.
 */
function launchSpeed(height: number, share: number): number {
  return Math.sqrt(2 * GRAVITY * height * share);
}

export default function Celebration() {
  const [done, setDone] = useState(reducedMotion);
  // Fixed for the life of the blast; a resize mid-flight does not matter.
  const [{ width, height }] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  if (done) return null;
  return (
    <ReactConfetti
      width={width}
      height={height}
      confettiSource={{ x: width * 0.2, y: height - 4, w: width * 0.6, h: 0 }}
      colors={COLORS}
      numberOfPieces={220}
      recycle={false}
      tweenDuration={450}
      gravity={GRAVITY}
      initialVelocityX={{ min: -6, max: 6 }}
      // Air slows the pieces to about half the height these would reach without it.
      initialVelocityY={{ min: -launchSpeed(height, 2), max: -launchSpeed(height, 1) }}
      style={{ position: "fixed", inset: 0, zIndex: 10 }}
      onConfettiComplete={() => {
        setDone(true);
      }}
    />
  );
}
