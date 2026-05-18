# Design skills

Design skills are small, editable rule packs that the resolver can inject into the
agent's system prompt. They guide the model without changing the actions or tools
available to it.

## Adding or editing a skill

Create or edit a markdown file in this directory and register it in `index.ts`.
Each file starts with frontmatter:

```md
---
id: layout-composition
title: Layout and Composition
description: Organize shapes into a readable spatial structure.
triggers:
  - organize
  - layout
  - arrange
priority: 80
alwaysInclude: false
---

Write concise guidance here.
```

- `id` must be unique.
- `triggers` are case-insensitive phrases matched against the user's prompt.
- `priority` breaks ties when multiple skills match.
- `alwaysInclude` skills are selected for every request.

After reviewing an output, codify feedback by editing the most relevant skill or
by adding durable preferences to `feedback-overrides.md`.
