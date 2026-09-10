// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { MEMBERS_3V, PROJECT_3V } from "./spec3v.ts";

export const V3_CENTERLINE_CSV_STATUS =
  "GEOMETRY ONLY - NODE-CENTER REFERENCE - NOT A CUT LIST - NOT FOR FABRICATION";

export const V3_CENTERLINE_CSV_COLUMNS = Object.freeze([
  "project_id",
  "revision",
  "status",
  "units",
  "measurement_basis",
  "piece_id",
  "edge_id",
  "class",
  "class_label",
  "centerline_chord_inches",
  "chord_factor",
  "start_node",
  "end_node",
] as const);

export const V3_CENTERLINE_CSV_DOWNLOAD_NAME =
  `${PROJECT_3V.id.toLowerCase()}-${PROJECT_3V.revision.toLowerCase()}-node-center-reference-not-cut-list.csv`;

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Detached mathematical-axis reference. Each row carries its own identity,
 * units, measurement basis, and release warning so a copied row is not
 * mistaken for a fabrication schedule.
 */
export function makeV3CenterlineMemberCsv(): string {
  const rows: Array<ReadonlyArray<string | number>> = [V3_CENTERLINE_CSV_COLUMNS];

  for (const member of MEMBERS_3V) {
    rows.push([
      PROJECT_3V.id,
      PROJECT_3V.revision,
      V3_CENTERLINE_CSV_STATUS,
      "inches",
      "node-center chord",
      member.pieceId,
      member.id,
      member.type,
      `Class ${member.type}`,
      member.length,
      member.chordFactor,
      member.start,
      member.end,
    ]);
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}
