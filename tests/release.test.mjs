import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { HANDOFF, PROJECT } from "../lib/spec.ts";

const pdfName = `black-belt-building-dome-field-reference-rev-${PROJECT.revision.toLowerCase()}.pdf`;

test("Rev 07 release identity is canonical", () => {
  assert.equal(PROJECT.revision, "07");
  assert.equal(HANDOFF.preparedFor, "Jantz");
  assert.equal(HANDOFF.company, "Black Belt Building");
  assert.equal(HANDOFF.preparedBy, "Whole Body");
});

test("public and source Rev 07 PDFs are identical artifacts", async () => {
  const [source, published] = await Promise.all([
    readFile(new URL(`../output/pdf/${pdfName}`, import.meta.url)),
    readFile(new URL(`../public/downloads/${pdfName}`, import.meta.url)),
  ]);

  assert.equal(source.subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(published, source);
});
