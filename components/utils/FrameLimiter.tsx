interface FrameLimiterProps {
  fps?: number
}

// FrameLimiter restricts the rendering FPS to the specified value to prevent
// unnecessary power usage on mobile devices.

import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

function FrameLimiter({ fps = 60 }: FrameLimiterProps) {
  const advance = useThree(state => state.advance);
  const setFrameloop = useThree(state => state.setFrameloop);
  // Captured once: after this component switches the canvas to "never", a
  // re-read would restore "never" on unmount and freeze the canvas.
  const initFrameloop = useThree(state => state.frameloop);
  const restoreTo = useRef(initFrameloop);

  useLayoutEffect(() => {
    const restore = restoreTo.current;
    let then: number | null = null;
    let raf: number | null = null;
    const interval = 1000 / fps;

    // Must be the store's setFrameloop, not a raw `set({ frameloop })`: it
    // stops the clock and zeroes it. A still-running clock makes fiber's
    // getDelta() add wall time on top of the timestamp we hand to advance(),
    // so every useFrame delta goes hugely negative. That stalls the episode
    // clock and NaNs the follow camera (blank canvas on narrow/touch devices).
    setFrameloop("never");

    // In frameloop "never" fiber derives useFrame delta as
    // (timestamp - clock.elapsedTime), so advance() must receive a monotonic
    // timestamp in seconds. Accumulate emitted-frame seconds from the zeroed clock.
    let total = 0;

    function tick(t: number) {
      raf = requestAnimationFrame(tick);
      if (then === null) {
        then = t;
        return;
      }
      const elapsed = t - then;
      if (elapsed > interval) {
        total += elapsed / 1000;
        advance(total);
        then = t - (elapsed % interval);
      }
    }

    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
      setFrameloop(restore);
    };
  }, [fps, advance, setFrameloop]);

  return null;
}

export default FrameLimiter;
