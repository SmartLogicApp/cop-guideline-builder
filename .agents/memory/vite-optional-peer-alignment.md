---
name: Vite optional peer alignment
description: Why pnpm can create incompatible Vite type identities at the same Vite version.
---

Vite plugins whose published type declarations import Vite without declaring it as a peer can resolve through pnpm's workspace fallback. The consuming artifact must use the same Vite optional-peer context, including optional packages such as YAML, or TypeScript treats the plugin and config Vite types as unrelated.

**Why:** Matching Vite version numbers alone did not prevent duplicate plugin type trees because pnpm encoded different optional-peer versions into separate Vite instances.

**How to apply:** When a Vite config reports incompatible plugin types from two paths with the same Vite version, compare the full pnpm virtual-store suffixes and align the differing optional peer instead of casting plugin types.