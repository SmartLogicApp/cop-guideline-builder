---
name: CI path-filter parsing
description: Why release-contract scanner discovery must understand both block and flow YAML.
---

Provider workflow path filters must be classified from their YAML structure, including quoted keys and both block and flow collections; line-oriented key regular expressions are not sufficient.

**Why:** Valid compact provider syntax can place nested path-filter keys on one line, allowing a scanner to bypass portability audit if discovery only inspects line-leading keys.

**How to apply:** When extending CI scanner discovery, preserve provider-specific ancestor checks across block and flow YAML and add ordinary-configuration counterexamples alongside every new positive fixture.