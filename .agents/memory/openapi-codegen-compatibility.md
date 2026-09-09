---
name: OpenAPI codegen compatibility
description: Non-obvious package and schema constraints required by the current Orval and Zod toolchain.
---

Keep Orval’s YAML parser on a compatible 4.x `js-yaml` release in this workspace. For integer-valued OpenAPI fields generated against Zod 3, express integer semantics as a number with `multipleOf: 1` rather than a schema form that causes the generator to emit `zod.int()`.

**Why:** A newer incompatible `js-yaml` export shape prevents Orval from loading the specification, and generated `zod.int()` is unavailable in the installed Zod major version.

**How to apply:** After changing the OpenAPI document or dependency overrides, regenerate both client and Zod outputs and run the library typecheck before editing generated files or diagnosing downstream failures.