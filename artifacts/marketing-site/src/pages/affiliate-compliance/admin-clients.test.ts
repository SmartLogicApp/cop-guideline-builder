import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AdminClients.tsx", import.meta.url), "utf8");

test("Admin Clients exposes Client/Affiliate type sorting and filtering", () => {
  assert.match(source, /\{ key: "type", label: "Type" \}/);
  assert.match(source, /aria-label="Filter by type"/);
  assert.match(source, /<option value="Client">Client<\/option>/);
  assert.match(source, /<option value="Affiliate">Affiliate<\/option>/);
  assert.match(source, /typeFilter === "All" \|\| client\.type === typeFilter/);
});

test("affiliate-only rows cannot remove client accounts but matched direct clients stay manageable", () => {
  assert.match(source, /client\.isClientAccount \? client\.status === "Removed"/);
  assert.match(source, /Remove client/);
});