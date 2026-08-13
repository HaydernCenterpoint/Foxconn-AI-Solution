---
tags: [convention, git]
updated: 2026-08-13
---

# Git and Pins

## ODF
Gitlink `third_party/open-data-fusion` = reviewed pin. [[30 Decisions/ODF Source Authority]]

Do not commit dirty submodule WIP (Events/Labels, unreviewed API) with an Operations UI PR.

## Vault
`obsidian-fii-ai/` is documentation. Skip `.obsidian/workspace.json` noise and local graph pan/zoom if it is only UI state.

## Do not commit
- `.omx/`, `.freebuff/`, scratch dirs
- Secrets, `Idea.docx` dumps, `Foxconn-AI-Solution/` copies

## Related
- [[10 Project/Repo Map]]
