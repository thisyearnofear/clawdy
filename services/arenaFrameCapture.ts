/**
 * Grab the live arena render as a 16:9 JPEG for Orbis image-to-video.
 *
 * Orbis anchors its first chunk on a reference image and every later chunk
 * inherits it, so the broadcast grows out of the player's actual arena
 * instead of a generic prompt. 16:9 works best; other ratios are
 * center-cropped here (not stretched). Returns null when no canvas is
 * mounted or the capture fails — callers fall back to text-to-video.
 */
const TARGET_WIDTH = 1280
const TARGET_HEIGHT = 720

export async function captureArenaFrame(source?: HTMLCanvasElement | null): Promise<Blob | null> {
  const canvas = source ?? (typeof document === 'undefined' ? null : document.querySelector('canvas'))
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null

  const out = document.createElement('canvas')
  out.width = TARGET_WIDTH
  out.height = TARGET_HEIGHT
  const ctx = out.getContext('2d')
  if (!ctx) return null

  // Cover-fit: crop the longer axis so the arena is never distorted.
  const targetRatio = TARGET_WIDTH / TARGET_HEIGHT
  const sourceRatio = canvas.width / canvas.height
  const cropWidth = sourceRatio > targetRatio ? canvas.height * targetRatio : canvas.width
  const cropHeight = sourceRatio > targetRatio ? canvas.height : canvas.width / targetRatio
  const sx = (canvas.width - cropWidth) / 2
  const sy = (canvas.height - cropHeight) / 2
  try {
    ctx.drawImage(canvas, sx, sy, cropWidth, cropHeight, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)
  } catch {
    return null
  }
  return new Promise(resolve => out.toBlob(blob => resolve(blob), 'image/jpeg', 0.9))
}
