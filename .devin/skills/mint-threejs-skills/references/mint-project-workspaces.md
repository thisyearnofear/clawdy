# Mint Project Workspaces

Use one Mint Project as the remote workspace for each local Three.js codebase
that creates assets through Mint MCP. A local project is the folder or
repository being edited; a Mint Project owns the Mint chats and assets produced
for that work. Do not use the two meanings interchangeably.

## When To Resolve A Mint Project

Resolve the Mint Project immediately before the first Mint write, including a
generation start or reference-image upload. Do not create an empty Mint Project
for a codebase that never needs Mint assets.

Every Mint account has a default `First Project`, so an account never truly has
no Projects. The relevant condition is whether this local codebase already has
an associated Mint Project.

## Resolution Workflow

1. Inspect the project-root `mint-assets.json` for `mintProject.projectId`.
2. If it exists, call `list_projects` with `include_archived: true` and validate
   that the authenticated account owns that Project. The stored ID is
   authoritative; refresh the stored name when Mint returns a newer name.
3. Reuse an active validated Project. Do not create another Project for a new
   asset, a new chat, or a later Codex session in the same codebase.
4. If the recorded Project is archived, ask whether to restore it or create a
   new destination. If the ID is missing or belongs to another account, explain
   the mismatch and ask before replacing the association.
5. If no association exists, honor an explicit user-selected Mint Project. Do
   not choose an existing Project merely because its name resembles the local
   folder or prompt.
6. Otherwise infer one concise name from the original product brief, call
   `create_project`, and immediately persist the returned `project_id` and name
   in `mint-assets.json` before starting generation. MCP Project creation does
   not change the active Project in the Mint web app.

If `list_projects` or `create_project` is unavailable, or the connection lacks
`mint:projects:write`, report the exact capability or authorization blocker. Do
not silently route the work into `First Project` or the active web Project.

## Naming Contract

Derive a short, human-readable product name from the user's first substantive
brief. Prefer the thing being built plus its useful type:

| Brief | Mint Project name |
| --- | --- |
| Build a cozy mushroom shop game | `Mushroom Shop Game` |
| Create a robotic knight viewer | `Robotic Knight Viewer` |
| Make an interactive solar system | `Interactive Solar System` |

- Prefer a specific noun phrase over the raw prompt, repository slug, or a
  generic label such as `Three.js Project`.
- Preserve a user-provided name when present.
- Keep the name within the live `create_project` schema limit; Mint currently
  accepts at most 32 characters.
- Do not rename `First Project` automatically. Use it only when the user
  explicitly selects it or it is already the recorded association.

## Durable Association

Persist the association at the top level of `mint-assets.json`:

```json
{
  "registryVersion": 1,
  "mintProject": {
    "projectId": "p97...",
    "name": "Mushroom Shop Game"
  },
  "assetRoot": "public/assets/mint",
  "assets": {}
}
```

The Project ID is canonical. The name is a readable snapshot and may be updated
after validation. This field is workspace metadata, not generated-artifact
metadata. The asset sync preserves and validates it.

## Chat And Generation Routing

- Pass the resolved `project_id` to every generation-start tool when
  `chat_id` is absent, and to every reference-image upload.
- Let independent asset generations create separate Mint chats inside the same
  Project. The Project, not one long chat, is the organizing boundary.
- Continue preview, revision, approval, retry, animation, conversion, and other
  derivative work in the returned source chat or source asset lifecycle.
- When both `chat_id` and `project_id` are supplied, they must identify the same
  Mint Project.
- Do not create one Mint Project per asset, per generation, or per chat.

The final response may include the relevant Mint chat handoff links. Keep the
Mint Project ID and registry metadata out of the runtime application UI.
