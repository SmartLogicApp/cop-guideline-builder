---
name: Browser document parsing compatibility
description: Browser/runtime differences encountered while extracting local PDF and DOCX text.
---

Browser-side document parsing must be verified in the preview browser with an actual PDF and Word document, not just by compiling the bundle. PDF.js v6 invoked `Map.prototype.getOrInsertComputed` in the available Chromium runtime, causing PDF extraction to fail even though Vite built successfully. A compatible PDF.js v4 release parsed the same real PDF correctly. Its cleanup API belongs to the document loading task, not the resolved PDF proxy.

**Why:** A successful bundle and a readable DOCX did not predict whether the PDF worker could parse a real PDF; the mismatch silently blocked the policy scan before it reached analysis.

**How to apply:** When upgrading document parsers or browser targets, test actual PDF/DOCX bytes through the browser-facing extractor. Keep browser-only libraries locally bundled for same-origin loading, and check PDF worker compatibility explicitly. Mammoth's browser input uses `arrayBuffer`, whereas its Node build uses `buffer` if testing the same extractor under Node.