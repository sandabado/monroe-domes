import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { HANDOFF, PROJECT } from "../lib/spec.ts";

const pdfName = `black-belt-building-dome-field-reference-rev-${PROJECT.revision.toLowerCase()}.pdf`;

test("Rev 08 release identity is canonical", () => {
  assert.equal(PROJECT.revision, "08");
  assert.equal(HANDOFF.preparedFor, "Jantz");
  assert.equal(HANDOFF.company, "Black Belt Building");
  assert.equal(HANDOFF.preparedBy, "Whole Body");
});

test("public and source Rev 08 PDFs are identical artifacts", async () => {
  const [source, published] = await Promise.all([
    readFile(new URL(`../output/pdf/${pdfName}`, import.meta.url)),
    readFile(new URL(`../public/downloads/${pdfName}`, import.meta.url)),
  ]);

  assert.equal(source.subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(published, source);
});

test("retired Rev 07 PDF is not shipped beside the current field reference", async () => {
  await Promise.all([
    assert.rejects(
      readFile(new URL("../output/pdf/black-belt-building-dome-field-reference-rev-07.pdf", import.meta.url)),
      { code: "ENOENT" },
    ),
    assert.rejects(
      readFile(new URL("../public/downloads/black-belt-building-dome-field-reference-rev-07.pdf", import.meta.url)),
      { code: "ENOENT" },
    ),
  ]);
});
