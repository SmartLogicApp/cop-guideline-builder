import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPolicyDocumentText } from '../src/lib/policy-file-text.js';

// Minimal valid Word document: two paragraphs. A plain-text read would start
// with ZIP bytes and XML instead of the policy sentences asserted below.
const docxBase64 =
  'UEsDBBQAAAAIABJ9N13MVIwQ4AAAAJwBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2Qy07DMBBFf8XyFsUTukAIJekCyhJYlA+w7Eli4Zc8bil/z6QtXaDC0r6PM7rd+hC82GMhl2Ivb1UrBUaTrItTL9+3z829XA/d9isjCbZG6uVca34AIDNj0KRSxsjKmErQlZ9lgqzNh54QVm17BybFirE2demQQ/eEo975KjYH/j5hC3qS4vFkXFi91Dl7Z3RlHfbR/qI0Z4Li5NFDs8t0wwYJVwmL8jfgnHvlHYqzKN50qS86sAs+U7Fgk9kFTqr/a67cmcbRGbzkl7ZckkEiHjh4dVGCdvHnfjjOPXwDUEsDBBQAAAAIABJ9N102V97cogAAABgBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRN6pCwNCqGkXhNQVlQNEiZtGNA8l4XV7MjBQxMBo+/dnuekedmY3isl4x2Fd1cDISa+M0xzOw3G1g65tTjSLXBJpMiGxsuIShynnsEdMciIrUuUDuTIZfbQilzJqDEJehCbc1PUW46cBS5P1ikPs1RrY8Az0j+3H0Ug6eHm15PKPE1+JIouoKXO4+6hQvdtVYQHbBhcvti9QSwMEFAAAAAgAEn03XR4PeJ3GAAAAKgEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PzUrFMBCFX2XI3qa6EClt707uUlAfIDeZNoFmEjJTa9/eRBBB3Jxh/j7OGS+fcYMPLBwSTeq+6xUg2eQCrZN6f3u+e1KXeTwGl+wekQTqPfFwTMqL5EFrth6j4S5lpLpbUolGaltWfaTickkWmSsubvqh7x91NIFUQ96SO1vNTUoTma+GHFzPNSAhvKQt2HPUbdG0fGv++/MqZlkg7ixwGPbgK4PhhtUKQuOZRbAAGushGwktRcu4Ux13/+D1jzf9m3v+AlBLAQIUAxQAAAAIABJ9N13MVIwQ4AAAAJwBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAEn03XTZX3tyiAAAAGAEAAAsAAAAAAAAAAAAAAIABEQEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAEn03XR4PeJ3GAAAAKgEAABEAAAAAAAAAAAAAAIAB3AEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAANECAAAAAA==';

test('extracts policy paragraphs from a real DOCX ZIP rather than reading XML as text', async () => {
  const file = new File([Buffer.from(docxBase64, 'base64')], 'policy.DOCX');
  const text = await extractPolicyDocumentText(file);
  assert.equal(text, 'Hand Hygiene Policy\n\nStaff must wash hands before and after each patient encounter.');
  assert.doesNotMatch(text, /<w:|PK\x03\x04/);
});

test('rejects invalid Word files and unsupported legacy DOC explicitly', async () => {
  await assert.rejects(
    extractPolicyDocumentText(new File(['not a Word document'], 'broken.docx')),
    /Could not read this DOCX/,
  );
  await assert.rejects(
    extractPolicyDocumentText(new File(['binary'], 'old.doc')),
    /Older \.doc files cannot be read here/,
  );
});

test('plain text is read as text, and empty documents cannot be scanned', async () => {
  assert.equal(
    await extractPolicyDocumentText(new File(['  Hand hygiene policy  '], 'policy.txt')),
    'Hand hygiene policy',
  );
  await assert.rejects(extractPolicyDocumentText(new File([' \n'], 'empty.md')), /No readable text/);
});