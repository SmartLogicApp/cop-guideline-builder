---
name: Public document bundling boundary
description: Keep approved documents exact and draft-only material out of the public shell
---

Never import an entire draft document into browser code and rely on runtime slicing or replacement to hide private sections. Vite embeds the original raw import in shipped JavaScript, so attorney notes and superseded business details can remain readable even if the UI renders only a subset.

**Why:** The published marketing bundle exposed draft-only attorney review notes from a raw Terms attachment because the application trimmed them only after bundling.

**How to apply:** Prepare the public text on the build side, emit only the approved result to client modules, and fail the build when draft-only markers appear in generated browser files. Independently verify which assets the live homepage references after each publish; old hashed asset URLs may remain cached.

Long approved legal documents should be loaded with their public legal routes, not eagerly bundled into the homepage shell. Their routes can still be statically prerendered; plain-text documents need a semantic heading in the renderer for the public-page build check.

**Why:** A full pair of approved documents pushed the public entry beyond its release budget, while a plain-text Terms title did not satisfy the prerendered-heading check.

**How to apply:** Keep verbatim source strings independently verifiable against the approved input, load their pages on demand, and confirm the prerendered legal pages contain their headings before publishing.