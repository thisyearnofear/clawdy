// Cloud visual + perf verification. Runs inside the Playwright container against a production build.
// Usage: BASE_URL=http://localhost:3100 OUT=/out node shoot.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100'
const OUT = process.env.OUT ?? '/out'
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 12000)
mkdirSync(OUT, { recursive: true })

const viewports = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'narrow', width: 390, height: 844, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

// Software GL (SwiftShader): frame times are a relative signal for regressions, not GPU numbers.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const report = { baseUrl: BASE_URL, startedAt: new Date().toISOString(), runs: [] }

const only = process.env.VIEWPORTS?.split(',')
for (const viewport of viewports.filter(v => !only || only.includes(v.name))) {
  const { name, ...contextOptions } = viewport
  const context = await browser.newContext({ ...contextOptions, viewport: { width: viewport.width, height: viewport.height } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__glEvents = []
    document.addEventListener('webglcontextlost', () => window.__glEvents.push(`contextlost@${Math.round(performance.now())}`), true)
    document.addEventListener('webglcontextrestored', () => window.__glEvents.push(`contextrestored@${Math.round(performance.now())}`), true)
  })
  const consoleErrors = []
  const failedRequests = []
  if (process.env.DEBUG_CONSOLE) page.on('console', message => console.error(`[console.${message.type()}] ${message.text().slice(0, 300)}`))
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`) })
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', request => failedRequests.push(`${request.url()} ${request.failure()?.errorText}`))
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`) })

  const t0 = Date.now()
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 120000 })
  const canvas = await page.waitForSelector('canvas', { timeout: 120000 }).catch(() => null)
  const canvasMs = canvas ? Date.now() - t0 : null
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: `${OUT}/${name}-initial.png` })

  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1500 }).catch(() => {})
  await page.getByRole('button', { name: 'Play', exact: true }).click({ timeout: 3000 }).catch(() => {})
  const viewportSection = page.getByRole('region', { name: 'Generated world and autonomous rovers' })
  await viewportSection.scrollIntoViewIfNeeded().catch(() => {})
  let elapsed = 0
  const clockSamples = []
  for (const seconds of (process.env.SHOTS ?? '3,8,15').split(',').map(Number)) {
    await page.waitForTimeout((seconds - elapsed) * 1000)
    elapsed = seconds
    await viewportSection.screenshot({ path: `${OUT}/${name}-racing-t${seconds}.png` }).catch(() => {})
    // The match clock must run down while racing; a frozen clock means the episode loop stalled.
    clockSamples.push({ seconds, clock: await viewportSection.innerText({ timeout: 1000 }).then(text => text.match(/\d\d:\d\d/)?.[0] ?? null).catch(() => null) })
  }
  await page.screenshot({ path: `${OUT}/${name}-racing.png` })
  const canvasProbe = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    const probe = document.createElement('canvas')
    probe.width = 32
    probe.height = 32
    const context = probe.getContext('2d')
    context.drawImage(canvas, 0, 0, 32, 32)
    const { data } = context.getImageData(0, 0, 32, 32)
    let sum = 0
    let sumSquares = 0
    for (let i = 0; i < data.length; i += 4) {
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 3
      sum += luma
      sumSquares += luma * luma
    }
    const count = data.length / 4
    const rect = canvas.getBoundingClientRect()
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return { width: canvas.width, height: canvas.height, cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height), lumaMean: Math.round(sum / count), lumaStdDev: Math.round(Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2)) * 10) / 10, contextLost: gl?.isContextLost?.() ?? null }
  })

  const frames = await page.evaluate(() => new Promise(resolve => {
    const deltas = []
    let last = performance.now()
    const stop = last + 4000
    const tick = now => {
      deltas.push(now - last)
      last = now
      if (now < stop) requestAnimationFrame(tick)
      else resolve(deltas)
    }
    requestAnimationFrame(tick)
  }))
  const sorted = [...frames].sort((a, b) => a - b)
  const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null

  const cameraGroup = page.getByRole('group', { name: 'Camera view' })
  const cameraButtons = await cameraGroup.getByRole('button').all().catch(() => [])
  for (let index = 0; index < cameraButtons.length; index++) {
    const label = ((await cameraButtons[index].textContent()) ?? `view${index}`).trim().toLowerCase().replace(/\W+/g, '-') || `view${index}`
    await cameraButtons[index].click().catch(() => {})
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${name}-camera-${label}.png` })
  }

  report.runs.push({
    viewport: name,
    canvasReadyMs: canvasMs,
    frames: { count: frames.length, medianMs: pct(0.5), p95Ms: pct(0.95), worstMs: sorted.at(-1) ?? null },
    clockSamples,
    canvasProbe,
    frameLimiter: await page.evaluate(() => ({ fl: window.__fl ?? null, cam: window.__ec ?? null })),
    cameraViews: cameraButtons.length,
    glEvents: await page.evaluate(() => window.__glEvents ?? []),
    consoleErrors: [...new Set(consoleErrors)].slice(0, 30),
    failedRequests: [...new Set(failedRequests)].slice(0, 30),
  })
  await context.close()
}

await browser.close()
report.finishedAt = new Date().toISOString()
report.failures = report.runs.flatMap(run => {
  const failures = []
  if (run.canvasReadyMs === null) failures.push(`${run.viewport}: no canvas`)
  if ((run.canvasProbe?.lumaStdDev ?? 0) < 5) failures.push(`${run.viewport}: canvas is blank after Play (luma stddev ${run.canvasProbe?.lumaStdDev})`)
  if (run.canvasProbe?.contextLost) failures.push(`${run.viewport}: WebGL context lost`)
  const clocks = run.clockSamples.map(sample => sample.clock).filter(Boolean)
  if (clocks.length > 1 && clocks[0] === clocks.at(-1)) failures.push(`${run.viewport}: match clock never advanced (${clocks[0]})`)
  if (run.failedRequests.length) failures.push(`${run.viewport}: ${run.failedRequests.length} failed request(s)`)
  if (run.consoleErrors.some(line => line.startsWith('error') || line.startsWith('pageerror'))) failures.push(`${run.viewport}: console errors`)
  return failures
})
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (report.failures.length) {
  console.error(`VERIFY FAILED:\n${report.failures.join('\n')}`)
  process.exitCode = 1
}
