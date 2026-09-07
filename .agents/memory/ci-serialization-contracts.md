---
name: CI serialization contracts
description: How static workflow guards should validate serialized environment-variable values.
---

Static CI contract checks must accept a producer only when they can establish the
shape of its resulting value. Seeing `JSON.stringify`, `toJSON`, or `jq` is not
enough: each can emit a scalar string, and matching tokens in comments creates
additional bypasses.

**Why:** Token-based serializer detection allowed newline-producing assignments
to pass when a serializer name appeared in a comment, and allowed serializers
whose actual result was a JSON string instead of the required array.

**How to apply:** Match and validate the complete assignment expression. Reject
dynamic forms conservatively unless their output type is explicitly modeled and
covered by negative tests for scalar output, comments, and unrelated fragments.