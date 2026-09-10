---
name: Static alias safety analysis
description: Control-flow and scope rules for static guards that track aliases to unsafe operations.
---

Static safety guards must use possible-state analysis for aliases: resolve writes and calls to the same lexical binding, deactivate risk only after an unconditional unrelated write, and preserve possible risk across conditional restoration or captured closure use.

**Why:** Textual name and source-order tracking can both miss real unsafe calls and create false positives. Conditional writes do not establish one runtime state, and nested closures can execute in an order different from their source positions.

**How to apply:** When extending AST-based validation guards, model lexical shadowing (including catch, destructuring, block, and function bindings), RHS-before-assignment evaluation, and conservative state transitions before accepting a reassignment as proof that an alias is safe.