---
name: Public document bundling boundary
description: Why browser-side trimming of uploaded legal drafts does not keep review notes private
---

Never import an entire draft document into browser code and rely on runtime slicing or replacement to hide private sections. Vite embeds the original raw import in shipped JavaScript, so attorney notes and superseded business details can remain readable even if the UI renders only a subset.

**Why:** The published marketing bundle exposed draft-only attorney review notes from a raw Terms attachment because the application trimmed them only after bundling.

**How to apply:** Prepare the public text on the build side, emit only the approved result to client modules, and fail the build when draft-only markers appear in generated browser files. Independently verify which assets the live homepage references after each publish; old hashed asset URLs may remain cached.