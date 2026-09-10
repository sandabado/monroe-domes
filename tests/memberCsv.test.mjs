import assert from "node:assert/strict";
import test from "node:test";

import {
  makeV2CenterlineMemberCsv,
  V2_CENTERLINE_CSV_COLUMNS,
  V2_CENTERLINE_CSV_DOWNLOAD_NAME,
  V2_CENTERLINE_CSV_STATUS,
} from "../lib/memberCsv.ts";
import { MEMBERS, PROJECT } from "../lib/spec.ts";

function parseCurrentCsv(csv) {
  const lines = csv.trimEnd().split("\n");
  const [header, ...rows] = lines.map((line) => line.split(","));
  return { header, rows };
}

test("2V member CSV repeats its detached-reference boundary on every row", () => {
  const { header, rows } = parseCurrentCsv(makeV2CenterlineMemberCsv());
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  assert.deepEqual(header, [...V2_CENTERLINE_CSV_COLUMNS]);
  assert.equal(rows.length, MEMBERS.length);
  assert.equal(rows.length, 65);

  for (const row of rows) {
    assert.equal(row[column.project_id], PROJECT.id);
    assert.equal(row[column.revision], `REV-${PROJECT.revision}`);
    assert.equal(row[column.status], V2_CENTERLINE_CSV_STATUS);
    assert.equal(row[column.units], "inches");
    assert.equal(row[column.measurement_basis], "node-center chord");
  }
});

test("2V member CSV preserves canonical identity, topology, and exact stored values", () => {
  const { header, rows } = parseCurrentCsv(makeV2CenterlineMemberCsv());
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  for (const [index, member] of MEMBERS.entries()) {
    const row = rows[index];
    assert.equal(row[column.piece_id], member.pieceId);
    assert.equal(row[column.edge_id], member.id);
    assert.equal(row[column.class], member.type);
    assert.equal(row[column.class_label], member.type === "S" ? "Short" : "Long");
    assert.equal(Number(row[column.centerline_chord_inches]), member.length);
    assert.equal(Number(row[column.chord_factor]), member.chordFactor);
    assert.equal(row[column.start_node], member.start);
    assert.equal(row[column.end_node], member.end);
  }

  assert.equal(new Set(rows.map((row) => row[column.piece_id])).size, MEMBERS.length);
  assert.equal(new Set(rows.map((row) => row[column.edge_id])).size, MEMBERS.length);
  assert.equal(rows.filter((row) => row[column.class] === "S").length, 30);
  assert.equal(rows.filter((row) => row[column.class] === "L").length, 35);
});

test("2V member CSV omits ambiguous orientation and uses a safe filename", () => {
  const header = V2_CENTERLINE_CSV_COLUMNS.join(",");

  assert.doesNotMatch(header, /bearing|slope|cut_length|blank_length/i);
  assert.match(header, /centerline_chord_inches/);
  assert.match(V2_CENTERLINE_CSV_DOWNLOAD_NAME, /node-center-reference-not-cut-list\.csv$/);
  assert.doesNotMatch(V2_CENTERLINE_CSV_DOWNLOAD_NAME, /issued/i);
});
