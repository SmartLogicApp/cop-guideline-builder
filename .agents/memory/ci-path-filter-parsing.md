---
name: CI path-filter parsing
description: Why release-contract scanner discovery must understand both block and flow YAML.
---

Provider workflow path filters must be classified from their resolved YAML structure, including quoted keys, block and flow collections, and reusable mappings referenced through anchors or aliases; line-oriented key regular expressions are not sufficient.

**Why:** Valid compact or reusable provider syntax can place nested path-filter keys on one line or inherit them at an alias use site, allowing a scanner to bypass portability audit if discovery only inspects line-leading keys or anchor declarations.

**How to apply:** When extending CI scanner discovery, preserve provider-specific ancestor checks across block, flow, and alias-resolved YAML and add ordinary-configuration counterexamples alongside every new positive fixture.