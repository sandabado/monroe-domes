// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { MATERIAL, MEMBERS, PROJECT } from "./spec.ts";

export const V2_CENTERLINE_CSV_STATUS =
  "REFERENCE ONLY - NODE-CENTER GEOMETRY - NOT A CUT LIST - NOT FOR FABRICATION";

export const V2_CENTERLINE_CSV_COLUMNS = Object.freeze([
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
  "material_reference",
  "modeled_section_reference_inches",
] as const);

export const V2_CENTERLINE_CSV_DOWNLOAD_NAME =
  `${PROJECT.id.toLowerCase()}-rev-${PROJECT.revision.toLowerCase()}-node-center-reference-not-cut-list.csv`;

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Detached mathematical member reference. Every row repeats its own release
 * boundary so sorting, filtering, or copying rows cannot strip the warning.
 */
export function makeV2CenterlineMemberCsv(): string {
  const rows: Array<ReadonlyArray<string | number>> = [V2_CENTERLINE_CSV_COLUMNS];

  for (const member of MEMBERS) {
    rows.push([
      PROJECT.id,
      `REV-${PROJECT.revision}`,
      V2_CENTERLINE_CSV_STATUS,
      "inches",
      "node-center chord",
      member.pieceId,
      member.id,
      member.type,
      member.type === "S" ? "Short" : "Long",
      member.length,
      member.chordFactor,
      member.start,
      member.end,
      MATERIAL.species,
      `${MATERIAL.modeledSectionInches} x ${MATERIAL.modeledSectionInches}`,
    ]);
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}
