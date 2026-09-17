// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { V3_BASE_MAX_PAIR_FACTOR, buildV3FiveEighthsDome, type V3StrutType } from "./geodesic3v.ts";

export const PROJECT_3V = Object.freeze({
  id: "WB-DOME-12-8-V3",
  revision: "INTAKE-01",
  nominalBaseDiameterInches: 152,
  sphereRadiusInches: 152 / V3_BASE_MAX_PAIR_FACTOR,
  frequency: 3,
  fraction: "5/8",
  geometryMethod: "Class-I 3V icosahedron · radial projection · 5/8 face cut",
  status: "GEOMETRY VERIFIED · CONSTRUCTION PACKAGE INCOMPLETE",
});

export const DOME_MODEL_3V = buildV3FiveEighthsDome(PROJECT_3V.sphereRadiusInches);

const memberCounters: Record<V3StrutType, number> = { A: 0, B: 0, C: 0 };
export const MEMBERS_3V = Object.freeze(DOME_MODEL_3V.edges.map((edge) => Object.freeze({
  ...edge,
  pieceId: `${edge.type}-${String(++memberCounters[edge.type]).padStart(3, "0")}`,
  status: "NODE-CENTER CHORD · NOT A FINISHED CUT",
})));

export type DomeMember3V = (typeof MEMBERS_3V)[number];
export type PanelFamily3V = "PENT" | "HEX";

const edgeByVertexPair = new Map(DOME_MODEL_3V.edges.map((edge) => [
  [edge.start, edge.end].sort().join(":"),
  edge,
]));

function triangleArea(sideA: number, sideB: number, sideC: number): number {
  const semiperimeter = (sideA + sideB + sideC) / 2;
  return Math.sqrt(
    semiperimeter
      * (semiperimeter - sideA)
      * (semiperimeter - sideB)
      * (semiperimeter - sideC),
  );
}

function oppositeAngleDegrees(side: number, adjacentA: number, adjacentB: number): number {
  const cosine = (adjacentA ** 2 + adjacentB ** 2 - side ** 2) / (2 * adjacentA * adjacentB);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

const panelCounters: Record<PanelFamily3V, number> = { PENT: 0, HEX: 0 };
export const PANELS_3V = Object.freeze(DOME_MODEL_3V.faces.map((face) => {
  const pairs = [
    [face.vertices[0], face.vertices[1]],
    [face.vertices[1], face.vertices[2]],
    [face.vertices[2], face.vertices[0]],
  ] as const;
  const faceEdges = pairs.map(([start, end]) => edgeByVertexPair.get([start, end].sort().join(":")));
  if (faceEdges.some((edge) => !edge)) throw new Error(`Unable to resolve the edges of ${face.id}.`);
  const resolvedEdges = faceEdges.filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
  const classSignature = resolvedEdges.map(({ type }) => type).toSorted().join("");
  const family: PanelFamily3V = classSignature === "AAB"
    ? "PENT"
    : classSignature === "BCC"
      ? "HEX"
      : (() => { throw new Error(`Unexpected 3V face family ${classSignature} on ${face.id}.`); })();
  const sideLengthsInches = resolvedEdges.map(({ length }) => length).toSorted((first, second) => first - second);
  const [sideA, sideB, sideC] = sideLengthsInches;
  const areaSquareInches = triangleArea(sideA, sideB, sideC);
  const perimeterInches = sideA + sideB + sideC;
  // Both isosceles families use their single B edge as the reference base.
  // That keeps the published altitude unambiguous: it is always perpendicular
  // to B, never an arbitrary altitude to one of the repeated equal sides.
  const baseClass = "B" as const;
  const baseLengthInches = family === "PENT" ? sideC : sideA;
  return Object.freeze({
    pieceId: `${family}-${String(++panelCounters[family]).padStart(3, "0")}`,
    faceId: face.id,
    family,
    classSignature,
    vertices: face.vertices,
    sideLengthsInches: Object.freeze([sideA, sideB, sideC] as const),
    anglesDegrees: Object.freeze([
      oppositeAngleDegrees(sideA, sideB, sideC),
      oppositeAngleDegrees(sideB, sideA, sideC),
      oppositeAngleDegrees(sideC, sideA, sideB),
    ] as const),
    baseClass,
    baseLengthInches,
    grossHeightInches: 2 * areaSquareInches / baseLengthInches,
    perimeterInches,
    areaSquareInches,
    status: "GROSS NODE-CENTER FACE · NOT A FINISHED PANEL OR MODULE CUT",
  });
}));

export const PANEL_FAMILIES_3V = Object.freeze((["PENT", "HEX"] as const).map((family) => {
  const pieces = PANELS_3V.filter((panel) => panel.family === family);
  const representative = pieces[0];
  if (!representative) throw new Error(`Missing ${family} 3V face family.`);
  return Object.freeze({
    family,
    label: family === "PENT" ? "Pentagon-sector A-A-B face" : "Hexagon-sector B-C-C face",
    count: pieces.length,
    classSignature: representative.classSignature,
    sideLengthsInches: representative.sideLengthsInches,
    anglesDegrees: representative.anglesDegrees,
    baseClass: representative.baseClass,
    baseLengthInches: representative.baseLengthInches,
    grossHeightInches: representative.grossHeightInches,
    areaSquareInches: representative.areaSquareInches,
  });
}));

if (
  PANELS_3V.length !== 105
  || PANEL_FAMILIES_3V.find(({ family }) => family === "PENT")?.count !== 30
  || PANEL_FAMILIES_3V.find(({ family }) => family === "HEX")?.count !== 75
) {
  throw new Error("3V face families do not match the audited 5/8 topology.");
}

export const SOURCE_PLAN_3V = Object.freeze({
  title: "12 ft 8 in · 5/8 3V dome",
  author: "Golden Trillium Geodesics LLC / Trillium Domes",
  publicationYear: 2023,
  suppliedFilename: "3v-12ft8-plans-min.pdf",
  licenseBoundary: "Private plan cross-check only. Original pages, artwork, prose, and proprietary shop layouts are not embedded or redistributed by this site.",
  reportedComponentCounts: Object.freeze({
    panelFrameEdgePieces: 315,
    fullHexPanels: 73,
    pentPanels: 30,
    rightDoorHalfPanels: 2,
    leftDoorHalfPanels: 2,
  }),
  reconciliation: "The canonical mesh has 105 triangular faces and exactly 315 face-edge incidences (three per face). That number matches the source-reported panel-frame total, but it does not verify a fabrication schedule: adjoining modules duplicate shared boundaries and doorway-piece allocation remains unresolved.",
  dimensionCrossCheck: "No blanket ±0.0015 in comparison tolerance is valid. Against the rounded source chords, the independent residuals are A −0.011337 in, B +0.001222 in, and C +0.001477 in. These are source-reconciliation differences—not machining accuracy or fabrication tolerances.",
});

export const REFERENCE_SYSTEMS_3V = Object.freeze([
  Object.freeze({
    id: "geometry-skeleton",
    eyebrow: "AUDITED MATHEMATICAL MODEL",
    label: "Geometry skeleton",
    count: MEMBERS_3V.length,
    unit: "unique node-center axes",
    status: "TOPOLOGY VERIFIED · NOT CUT LENGTHS",
    detail: "One axis is stored for each unique edge between node centers. No hub, joint, setback, stock section, or finished member is defined.",
  }),
  Object.freeze({
    id: "source-panel-method",
    eyebrow: "PRIVATE SOURCE METHOD",
    label: "Panel-frame reference",
    count: SOURCE_PLAN_3V.reportedComponentCounts.panelFrameEdgePieces,
    unit: "reported face-edge pieces",
    status: "COUNT RECONCILED · CUTS WITHHELD",
    detail: "Face-by-face framing duplicates shared boundaries. The count agrees with 3 × 105 face sides, but the doorway allocation and physical cuts remain unresolved.",
  }),
]);

export const CONSTRUCTION_HOLDS_3V = Object.freeze([
  Object.freeze({
    id: "doorway",
    label: "Doorway",
    status: "HOLD · DO NOT CUT",
    detail: "Clear opening, affected members, 3D cut datums, load path, threshold, and weather detailing are not resolved.",
  }),
  Object.freeze({
    id: "platform",
    label: "Platform",
    status: "NO 3V DESIGN",
    detail: "The reviewed source deck uses metal hardware. No all-wood platform, anchorage, uplift path, or foundation design is released.",
  }),
  Object.freeze({
    id: "structure",
    label: "Structure + occupancy",
    status: "CAPACITY NOT ESTABLISHED",
    detail: "Wind, snow, seismic, uplift, connection, foundation, egress, code, and site-specific review remain open.",
  }),
  Object.freeze({
    id: "enclosure",
    label: "Weather + acoustics",
    status: "NOT DESIGNED OR TESTED",
    detail: "No complete drainage, flashing, membrane, durability, moisture-movement, or acoustic-performance system is issued.",
  }),
]);

export const MODEL_ASSUMPTIONS_3V = Object.freeze([
  `The 3V display is independently generated from a vertex-up Class-I icosahedron subdivided at frequency 3 and radially projected to a ${PROJECT_3V.sphereRadiusInches.toFixed(6)} in sphere radius.`,
  "The 5/8 cap retains every triangular face at or above the lower boundary course, producing 61 nodes, 165 unique edges, 105 faces, and a 15-edge boundary.",
  `The 15 boundary nodes are intentionally non-planar: five sit at the low datum and ten sit ${DOME_MODEL_3V.audit.boundary.rippleInches.toFixed(3)} in higher at this scale. The source pony-wall system is not modeled.`,
  "The supplied plan labels 12 ft 8 in as an outside-frame dimension. For comparison, this display normalizes the maximum horizontal separation of boundary-node axes to 152 in; that does not prove the physical outside dimension.",
  "A, B, and C values are node-center chord lengths, not saw lengths. Stock section, bevels, miters, duplicated panel frames, openings, fasteners, tolerances, and moisture movement change physical parts.",
  "The displayed face angles are planar interior angles derived from node-center triangle sides. They are not miter, bevel, compound-saw, or joinery settings.",
  "The timber-like axis prisms and round node markers in the 3D viewport use arbitrary visual thickness. They do not specify stock size, hub diameter, hub depth, connector geometry, or material.",
  "The 315 count is retained only as the source plan's reported panel-frame count and as 3 x 105 mathematical face-edge incidences. It is not a verified physical schedule and is not relabeled as 165 unique structural edges.",
  "The 2V mortise-and-tenon study, entrance, platform, site placement, PDF, and joint-clearance results do not transfer to this 3V option.",
  "No structural capacity, stability, foundation, wind, seismic, snow, weather enclosure, acoustic, permit, occupancy, or fabrication claim is issued.",
]);

export const THREE_V_RELEASE_BOUNDARY = Object.freeze({
  geometry: "VERIFIED INDEPENDENTLY",
  topology: "VERIFIED INDEPENDENTLY",
  sourcePlanReconciliation: "COUNT-LEVEL MATCH · DOOR DETAIL OPEN",
  uniqueMemberLengths: "NODE-CENTER ONLY",
  panelFaces: "GROSS GEOMETRY ONLY",
  panelFrameMethod: "COUNT ONLY · CUT SCHEDULE WITHHELD",
  joinery: "NOT MODELED",
  entrance: "SOURCE TEMPLATES AMBIGUOUS · DO NOT CUT",
  ponyWall: "SOURCE CONCEPT ONLY · NOT MODELED",
  platform: "SOURCE USES METAL · ALL-WOOD OPTION NOT DESIGNED",
  weatherEnclosure: "NOT DESIGNED",
  acoustics: "NOT MODELED OR TESTED",
  structure: "NOT ENGINEERED",
  occupancy: "CAPACITY NOT ESTABLISHED",
  fabrication: "NOT RELEASED",
});
