interface FrameLimiterProps {
  fps?: number
}

// FrameLimiter component restricts the rendering FPS to the specified value
// to prevent unnecessary power usage on mobile devices.

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

function FrameLimiter({ fps = 60 }: FrameLimiterProps) {
  const { advance, set, frameloop: initFrameloop } = useThree();

  useLayoutEffect(() => {
    let then: number | null = null;
    // In frameloop "never" fiber derives useFrame delta as
    // (timestamp - clock.elapsedTime), so advance() must receive a monotonic
    // timestamp — not a per-frame duration. Accumulate emitted-frame seconds.
    let total = 0;
    let raf: number | null = null;
    const interval = 1000 / fps;

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

    set({ frameloop: "never" });

    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
      set({ frameloop: initFrameloop });
    };
  }, [fps, advance, set, initFrameloop]);

  return null;
}

export default FrameLimiter;