# Clawdy — Development and Release Guide

**Accepted Direction:** Season 0: Train Your Champion.

This guide replaces retired contract and web3 deployment instructions. No wallet funding, chain deployment, indexer, or financial persistence service is a Season 0 prerequisite.

---

## Local Development & Commands

### Prerequisites
- Node.js: v20+ or v24+
- npm: v10+

### Install Dependencies
```bash
npm ci
```
*(Runs postinstall to verify `@dimforge/rapier3d-compat` version 0.19.2)*

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the interactive 3D arena.

### Builder Starter Training
```bash
npm run starter:train
```
Runs the headless trainer and generates `starter/champion-checkpoint.json`.

---

## Verification Commands

Every release or submission commit must pass all four gates:

```bash
# 1. Run unit & integration test suites
npm test

# 2. Type checking
npx tsc --noEmit

# 3. Strict ESLint checks
npm run lint

# 4. Production Next.js static build
npm run build
```

---

## Architecture & Deployment Notes

- **Static Export Friendly:** The Next.js application compiles cleanly to static HTML/JS/CSS without requiring custom server runtimes or databases.
- **Client-Side Storage:** Trained checkpoints and approved examples persist in browser `localStorage` under `clawdy_checkpoints_v1` and `clawdy_examples_v1` with SSR hydration fallbacks.
- **Import/Export:** Checkpoints are serialized to standard JSON files that can be imported and exported between browser sessions and builder CLI scripts.
- **World Assets:** Public world assets (`public/marble/arena.spz` and `public/marble/collider.glb`) are served statically. The collider is checked against a cryptographic SHA-256 digest (`68b6b27d...`) before physics initialization.
