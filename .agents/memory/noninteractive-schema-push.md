---
name: Noninteractive schema push
description: Drizzle's development schema push can report success despite an unapplied interactive prompt
---

In this workspace, Drizzle Kit's development `push` can print an interactive truncation prompt and a non-TTY error yet exit with status 0. A successful process exit alone does not prove that the development schema was updated. PostgreSQL constraints created by older plain `UNIQUE` SQL may also have `_key` names that differ from Drizzle's implicit `_unique` names, prompting it to propose redundant constraints on populated tables.

**Why:** An automatic post-merge run returned success after asking to truncate a populated affiliate table, even though no answer was possible and the schema was not applied.

**How to apply:** Keep automated pushes fail-closed on interactive or destructive prompts; never use force to bypass a truncation warning. Check existing constraint metadata and align harmless names when there is no actual schema difference. Preserve data and review any remaining diff explicitly.