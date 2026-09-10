import assert from "node:assert/strict";
import test from "node:test";

import {
  makeV3CenterlineMemberCsv,
  V3_CENTERLINE_CSV_COLUMNS,
  V3_CENTERLINE_CSV_DOWNLOAD_NAME,
  V3_CENTERLINE_CSV_STATUS,
} from "../lib/memberCsv3v.ts";
import { MEMBERS_3V, PROJECT_3V } from "../lib/spec3v.ts";

function parseCurrentCsv(csv) {
  const lines = csv.trimEnd().split("\n");
  const [header, ...rows] = lines.map((line) => line.split(","));
  return { header, rows };
}

test("3V CSV keeps the non-fabrication boundary on every detached row", () => {
  const { header, rows } = parseCurrentCsv(makeV3CenterlineMemberCsv());
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  assert.deepEqual(header, [...V3_CENTERLINE_CSV_COLUMNS]);
  assert.equal(rows.length, 165);
  for (const row of rows) {
    assert.equal(row[column.project_id], PROJECT_3V.id);
    assert.equal(row[column.revision], PROJECT_3V.revision);
    assert.equal(row[column.status], V3_CENTERLINE_CSV_STATUS);
    assert.equal(row[column.units], "inches");
    assert.equal(row[column.measurement_basis], "node-center chord");
  }
});

test("3V CSV preserves every canonical axis and exact stored chord", () => {
  const { header, rows } = parseCurrentCsv(makeV3CenterlineMemberCsv());
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  for (const [index, member] of MEMBERS_3V.entries()) {
    const row = rows[index];
    assert.equal(row[column.piece_id], member.pieceId);
    assert.equal(row[column.edge_id], member.id);
    assert.equal(row[column.class], member.type);
    assert.equal(Number(row[column.centerline_chord_inches]), member.length);
    assert.equal(Number(row[column.chord_factor]), member.chordFactor);
    assert.equal(row[column.start_node], member.start);
    assert.equal(row[column.end_node], member.end);
  }

  assert.equal(new Set(rows.map((row) => row[column.piece_id])).size, MEMBERS_3V.length);
  assert.equal(new Set(rows.map((row) => row[column.edge_id])).size, MEMBERS_3V.length);
  assert.equal(rows.filter((row) => row[column.class] === "A").length, 30);
  assert.equal(rows.filter((row) => row[column.class] === "B").length, 55);
  assert.equal(rows.filter((row) => row[column.class] === "C").length, 80);
});

test("3V CSV cannot be mistaken for a cut list by its header or filename", () => {
  const header = V3_CENTERLINE_CSV_COLUMNS.join(",");

  assert.doesNotMatch(header, /cut_length|blank_length|bearing|slope/i);
  assert.match(header, /centerline_chord_inches/);
  assert.match(V3_CENTERLINE_CSV_DOWNLOAD_NAME, /node-center-reference-not-cut-list\.csv$/);
});
