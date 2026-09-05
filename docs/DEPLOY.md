# Clawdy — Development and Release Guide

**Status: Season 0 implementation and deployment are pending.** This guide replaces the retired contract-deployment instructions. The [canonical plan](HACKATHON.md) defines the product; this document distinguishes existing commands from the release work still required.

No wallet funding, chain deployment, indexer, or financial persistence service is a Season 0 prerequisite. Do not use the legacy deployment scripts to launch the new product. A headless reference foundation now exists, but the application scene, legacy configuration, and external deployments have not migrated to it.

## Current Local Commands

CI currently uses Node.js 20 and npm. From the repository root:

```bash
npm ci
npm run dev
```

The existing `prepare` lifecycle configures local Git hooks, and `postinstall` checks the Rapier version. Review lifecycle behavior before installation; do not bypass security checks to resolve failures.

For verification and production preview:

```bash
npm run lint
npm test
npm run build
npm run start
```

These scripts build or run the application, whose scene still uses the legacy runtime. The new reference episode and world-query tests run headlessly; see the [verification snapshot](HACKATHON.md#verification-snapshot) for current results. Passing them does not establish an integrated training league. Learned-policy and artifact-validation coverage remain future work.

## Configuration During Consolidation

- Inspect configuration examples before using them. They still contain legacy chain and persistence settings; do not copy them blindly or overwrite an existing local environment file.
- Public world asset URLs may be exposed to the client. Coaching/generation credentials, training service credentials, and deployment tokens must remain server-side or in the operator's secure local environment.
- Never mirror an API secret into a `NEXT_PUBLIC_*` variable. Do not ship private credentials in policy manifests, examples, logs, or model artifacts.
- Next.js client configuration must use supported build-time public references or a validated explicit config payload. Marble configuration now uses explicit references; the legacy runtime-profile configuration still needs consolidation. Verify the intended asset selection in the browser when that testing scope is approved.
- See the [world asset guide](../public/marble/README.md) for the existing generator, its environment-loading behavior, output replacement risks, and collider validation.

## Target Release Components

| Component | Intended responsibility | Configuration status |
| --- | --- | --- |
| Next.js application | Practice, coaching, checkpoint selection, rendered matches, and replay. | Existing app shell; new flows pending. |
| Controlled simulation/policy runner | Fixed-step episodes, legal actions, frozen weights, and recorded results. | Runtime/hosting configuration pending. |
| Training execution | Update the supported small policy from approved examples. | Backend, limits, and serialization format pending a measured prototype. |
| Convex | Ownership, reviewed examples, training status, checkpoint metadata, match/replay records. | Integration and deployment configuration pending. |
| Artifact storage | Versioned checkpoints, snapshots, generated assets, and appropriate access controls. | Storage selection and limits pending. |
| Coaching provider | Translate feedback into reviewable examples during practice. | Provider configuration pending; not a scored-match inference dependency. |

Do not invent environment variable names or deployment commands for these services before choosing and implementing them. Update this guide with tested commands and exact configuration when the corresponding milestone is complete.

The application may access its backend while a match runs. The entrant itself remains a bounded, network-free policy. Convex must not receive physics updates at render-frame frequency or be represented as an automatic training-compute service.

## Release Gates

1. Reconcile retired providers, API routes, dependencies, configuration examples, CI variables, and deployment helpers with the new architecture. Do not shut down external services or delete their data without specific approval.
2. Pin a tested application revision, world/collider/route graph, rule version, simulation configuration, baseline, and checkpoint artifacts.
3. Verify the entire autonomous round and reset before adding coaching or training to the release claim.
4. Verify one real training/export/load cycle and the associated held-out comparison. Preserve actual provenance and failure records.
5. Enforce artifact validation, ownership, training-record access, and server-controlled acceptance of results. Reject arbitrary executable uploads.
6. Run lint, relevant tests, and a production build. Keep existing repository security controls intact.
7. Test the production preview on the presentation device: asset loading, stable renderer, controls, camera, responsive layout, console/network errors, autonomous play, coaching approval, checkpoint selection, replay, and reset.
8. Verify browser output cannot bypass match validation or modify the active checkpoint. Do not call a local exhibition a secure public ranked service.
9. Save a clearly labeled fallback recording and prepared checkpoint evidence.
10. Record the actual deployed URL and submitted commit in [SUBMISSION.md](SUBMISSION.md). Do not reuse a previous URL as evidence without checking its current contents.

The complete acceptance checklist is [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).

## Deployment Status

There is no verified Season 0 deployment recorded by this documentation update. Legacy contract addresses, deployer instructions, and old service links have intentionally been removed from active guidance. Their history is available in Git; they are not part of the new launch path.
