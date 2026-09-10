// Node's direct TypeScript runner requires source extensions in the audit tests.
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
import { buildV2Hemisphere } from "./geodesic.ts";
import {
  REDESIGN_HUB_ENVELOPE,
  REDESIGN_CONTINUOUS_POCKET_ENVELOPE,
  REDESIGN_CAPTURE_STUDY,
  REDESIGN_JOINERY_STUDY,
  REDESIGN_POCKET_ENVELOPE,
  auditAxialTenonCollisions,
  buildRedesignHubVertices,
  deriveV2Joinery,
// @ts-expect-error TS5097 is intentionally suppressed because this repo does not emit a test build.
} from "./joinery.ts";

export const PROJECT = Object.freeze({
  id: "WB-DOME-12-V2",
  revision: "08",
  diameterInches: 144,
  radiusInches: 72,
  peakHeightInches: 72,
  frequency: 2,
  baseShape: "Regular decagon",
  geometryMethod: "Class-I 2V icosahedron · radial projection · equatorial cut",
});

export const HANDOFF = Object.freeze({
  preparedFor: "Jantz",
  company: "Black Belt Building",
  preparedBy: "Whole Body",
  title: "12 ft 2V dome geometry + field planning reference",
});

export const DOME_MODEL = buildV2Hemisphere(PROJECT.radiusInches);
export const JOINERY_MODEL = deriveV2Joinery(DOME_MODEL);
/** The redesign changes the joint solids, not the already-audited installed axes. */
export const REDESIGN_JOINERY_MODEL = JOINERY_MODEL;
export const REDESIGN_POCKET_AUDIT = Object.freeze(
  auditAxialTenonCollisions(
    REDESIGN_JOINERY_MODEL.installedHubs,
    REDESIGN_JOINERY_STUDY.shoulderSetback,
    REDESIGN_POCKET_ENVELOPE,
  ),
);

function dot3(first: readonly number[], second: readonly number[]): number {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

function subtract3(first: readonly number[], second: readonly number[]): [number, number, number] {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

/** Exact maximum planar footprint of each convex port-normal hub family. */
export const REDESIGN_BODY_FAMILIES = Object.freeze(([4, 5, 6] as const).map((valence) => {
  const hub = REDESIGN_JOINERY_MODEL.installedHubs.find((candidate) => candidate.valence === valence);
  if (!hub) throw new Error(`Missing H${valence} redesign representative.`);
  const vertices = buildRedesignHubVertices(hub).map(({ position }) => position);
  let maximumPlanarDiameter = 0;
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      const difference = subtract3(vertices[first], vertices[second]);
      const radial = dot3(difference, hub.outwardNormal);
      const planarSquared = Math.max(0, dot3(difference, difference) - radial * radial);
      maximumPlanarDiameter = Math.max(maximumPlanarDiameter, Math.sqrt(planarSquared));
    }
  }
  return Object.freeze({
    id: `H${valence}` as const,
    valence,
    installedCount: REDESIGN_JOINERY_MODEL.installedHubs.filter((candidate) => candidate.valence === valence).length,
    convexVertexCount: vertices.length,
    maximumPlanarDiameter,
    radialThickness: REDESIGN_HUB_ENVELOPE.radialThickness,
  });
}));

/** Mathematical study extents only; these are intentionally not released cut lengths. */
export const REDESIGN_MEMBER_LENGTH_STUDY = Object.freeze(DOME_MODEL.edgeClasses.map((memberClass) => {
  const shoulderLength = memberClass.length - 2 * REDESIGN_JOINERY_STUDY.shoulderSetback;
  const tipToTipExtent = shoulderLength + 2 * REDESIGN_JOINERY_STUDY.tenon.length;
  return Object.freeze({
    type: memberClass.type,
    count: memberClass.count,
    centerlineLength: memberClass.length,
    shoulderLength,
    tipToTipExtent,
    status: "CAD STUDY ONLY · NOT A CUT LENGTH",
  });
}));

export const REDESIGN_STUDY = Object.freeze({
  status: "SPATIAL CLEARANCE VERIFIED · STRUCTURAL REVIEW OPEN",
  joinery: REDESIGN_JOINERY_STUDY,
  pocketEnvelope: REDESIGN_POCKET_ENVELOPE,
  continuousRollPocketEnvelope: REDESIGN_CONTINUOUS_POCKET_ENVELOPE,
  hubEnvelope: REDESIGN_HUB_ENVELOPE,
  captureStudy: REDESIGN_CAPTURE_STUDY,
  bodyFamilies: REDESIGN_BODY_FAMILIES,
  memberLengthStudy: REDESIGN_MEMBER_LENGTH_STUDY,
  selectedRoll: "width-radial · fixed",
  testedRollRange: "0°–90° sampled at 1° for robustness; fabrication study fixed width-radial",
  sampledPairTests: 24_570,
  sampledRollStartDegrees: 0,
  sampledRollEndDegrees: 90,
  sampledRollIncrementDegrees: 1,
  sampledRollPositionCount: 91,
  sampledPocketCollisions: 0,
  minimumSampledPocketSeparation: 1.3966370358711595,
  externalMemberPairTests: 24_570,
  externalMemberEnvelopeLengthInches: 6,
  externalMemberCollisions: 0,
  minimumSampledMemberSeparation: 1.537727207024575,
  continuousRollPocketPairTests: 270,
  continuousRollPocketCollisions: 0,
  minimumContinuousRollPocketSeparation: 1.380330594889732,
  continuousRollMemberPairTests: 270,
  continuousRollMemberCollisions: 0,
  minimumContinuousRollMemberSeparation: 1.4082572258959356,
  pocketRadialRange: Object.freeze([-1.68450137039492, -0.28425532968014683] as const),
  minimumPocketSplitPenetration: 0.3479797804634188,
  minimumPocketToOtherFaceClearance: 1.34943926762163,
  shoulderRadialRange: Object.freeze([-1.9493603647211608, -0.37161234731274195] as const),
  minimumShoulderToOtherFaceClearance: 1.0111180062094594,
  minimumH4ShoulderBottomRim: 0.75,
  minimumCrossKeyReliefToOtherPocketSeparation: 2.221133183531644,
  minimumCrossKeyReliefToReliefSeparation: 2.2831317760435668,
  minimumClampBoreToPocketSeparation: 1.7376390384477332,
  minimumClampBoreToCrossKeyReliefSeparation: 2.168412480127734,
  note: "Clearance result only. The sampled record covers 270 installed port pairs at 91 one-degree roll positions from 0 through 90 degrees; its external member proxies extend 6 inches from each shoulder. Port-normal shoulders, fixed width-radial roll, exact convex shells, and the common split make the geometry explicit; retention capacity, strength, durability, tolerances, and fabrication remain unissued.",
});

export const REJECTED_HUB = Object.freeze({
  radialThicknessInches: 2,
  note: "Comparison envelope only; not a machinable hub solid.",
});

const memberCounters = { S: 0, L: 0 };
export const MEMBERS = Object.freeze(DOME_MODEL.edges.map((edge) => ({
  ...edge,
  pieceId: `${edge.type}-${String(++memberCounters[edge.type]).padStart(2, "0")}`,
})));

export type DomeMember = (typeof MEMBERS)[number];

export const MATERIAL = Object.freeze({
  species: "Douglas fir",
  nominalSection: "2 × 2 in",
  modeledSection: "1.5 × 1.5 in",
  modeledSectionInches: 1.5,
  note: "Confirm dressed stock dimensions, moisture content, grade, and joint setbacks before issuing finished cuts.",
});

export type WoodPanelType = "P1" | "P2";

const edgeByVertexPair = new Map(DOME_MODEL.edges.map((edge) => [
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

const panelCounters: Record<WoodPanelType, number> = { P1: 0, P2: 0 };
export const WOOD_PANELS = Object.freeze(DOME_MODEL.faces.map((face) => {
  const vertexPairs = [
    [face.vertices[0], face.vertices[1]],
    [face.vertices[1], face.vertices[2]],
    [face.vertices[2], face.vertices[0]],
  ] as const;
  const faceEdges = vertexPairs.map(([start, end]) => edgeByVertexPair.get([start, end].sort().join(":")));
  if (faceEdges.some((edge) => !edge)) throw new Error(`Unable to resolve the edges of ${face.id}.`);
  const resolvedEdges = faceEdges.filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
  const longEdgeCount = resolvedEdges.filter((edge) => edge.type === "L").length;
  const type: WoodPanelType = longEdgeCount === 3 ? "P2" : longEdgeCount === 1 ? "P1" : (() => { throw new Error(`Unexpected edge family on ${face.id}.`); })();
  const sideLengths = resolvedEdges.map((edge) => edge.length).sort((first, second) => first - second);
  const [sideA, sideB, sideC] = sideLengths;
  const areaSquareInches = triangleArea(sideA, sideB, sideC);
  const perimeterInches = sideA + sideB + sideC;
  const baseLengthInches = sideC;
  return Object.freeze({
    pieceId: `${type}-${String(++panelCounters[type]).padStart(2, "0")}`,
    faceId: face.id,
    type,
    vertices: face.vertices,
    sideLengthsInches: Object.freeze([sideA, sideB, sideC] as const),
    anglesDegrees: Object.freeze([
      oppositeAngleDegrees(sideA, sideB, sideC),
      oppositeAngleDegrees(sideB, sideA, sideC),
      oppositeAngleDegrees(sideC, sideA, sideB),
    ] as const),
    baseLengthInches,
    grossHeightInches: 2 * areaSquareInches / baseLengthInches,
    perimeterInches,
    inradiusInches: 2 * areaSquareInches / perimeterInches,
    areaSquareInches,
    status: "GROSS NODE-CENTER FACE · NOT A FINISHED PANEL CUT",
  });
}));

const woodPanelTypes = (["P1", "P2"] as const).map((type) => {
  const pieces = WOOD_PANELS.filter((panel) => panel.type === type);
  const representative = pieces[0];
  if (!representative) throw new Error(`Missing ${type} wood panel family.`);
  return Object.freeze({
    type,
    label: type === "P1" ? "Isosceles S-S-L face" : "Equilateral L-L-L face",
    count: pieces.length,
    sideLengthsInches: representative.sideLengthsInches,
    anglesDegrees: representative.anglesDegrees,
    baseLengthInches: representative.baseLengthInches,
    grossHeightInches: representative.grossHeightInches,
    perimeterInches: representative.perimeterInches,
    inradiusInches: representative.inradiusInches,
    areaSquareInches: representative.areaSquareInches,
  });
});

if (WOOD_PANELS.length !== DOME_MODEL.faces.length || woodPanelTypes[0].count !== 30 || woodPanelTypes[1].count !== 10) {
  throw new Error("Wood panel families do not match the audited dome faces.");
}

export const WOOD_PANEL_CONCEPT = Object.freeze({
  status: "GROSS FACE TEMPLATES VERIFIED · FINISHED PANEL CUTS WITHHELD",
  visualInwardOffsetInches: 0.86,
  panelCount: WOOD_PANELS.length,
  types: Object.freeze(woodPanelTypes),
  grossTotalAreaSquareInches: WOOD_PANELS.reduce((sum, panel) => sum + panel.areaSquareInches, 0),
  grossTotalAreaSquareFeet: WOOD_PANELS.reduce((sum, panel) => sum + panel.areaSquareInches, 0) / 144,
  note: "The two templates are exact node-center triangle faces translated inward for visualization. They are not finished panel cuts. Thickness, edge underlap or reveal, hub corner cutbacks, attachment, gasket and drainage geometry, moisture allowance, grain direction, fire behavior, weathering, and acoustic performance remain unset.",
});

const ENTRANCE_PATCH_FACE_IDS = Object.freeze([
  "F006",
  "F007",
  "F012",
  "F021",
  "F022",
  "F023",
] as const);
const entrancePatchFaceIdSet = new Set<string>(ENTRANCE_PATCH_FACE_IDS);
const faceIdsByEdgeId = new Map(DOME_MODEL.edges.map((edge) => [edge.id, [] as string[]]));
const faceIdsByVertexId = new Map(DOME_MODEL.vertices.map((vertex) => [vertex.id, [] as string[]]));
for (const face of DOME_MODEL.faces) {
  for (const vertexId of face.vertices) faceIdsByVertexId.get(vertexId)?.push(face.id);
  for (let index = 0; index < face.vertices.length; index += 1) {
    const start = face.vertices[index];
    const end = face.vertices[(index + 1) % face.vertices.length];
    const edge = edgeByVertexPair.get([start, end].sort().join(":"));
    if (!edge) throw new Error(`Unable to resolve an edge of entrance face ${face.id}.`);
    faceIdsByEdgeId.get(edge.id)?.push(face.id);
  }
}

const entranceHiddenMembers = MEMBERS.filter((member) => {
  const adjoiningFaces = faceIdsByEdgeId.get(member.id) ?? [];
  return adjoiningFaces.length > 0 && adjoiningFaces.every((faceId) => entrancePatchFaceIdSet.has(faceId));
});
const entranceHiddenNodeIds = DOME_MODEL.vertices
  .filter((vertex) => {
    const adjoiningFaces = faceIdsByVertexId.get(vertex.id) ?? [];
    return adjoiningFaces.length > 0 && adjoiningFaces.every((faceId) => entrancePatchFaceIdSet.has(faceId));
  })
  .map((vertex) => vertex.id);
const entrancePatchVertices = DOME_MODEL.vertices.filter((vertex) =>
  ENTRANCE_PATCH_FACE_IDS.some((faceId) => DOME_MODEL.faces.find((face) => face.id === faceId)?.vertices.includes(vertex.id)),
);

if (
  entranceHiddenMembers.map((member) => member.pieceId).join(",") !== "L-03,L-06,S-11,S-12,L-16,L-17,L-26"
  || entranceHiddenNodeIds.join(",") !== "V007"
) {
  throw new Error("Entrance study patch no longer matches the audited dome topology.");
}

export const ENTRANCE_STUDY = Object.freeze({
  status: "VISUAL OPENING STUDY · REPLACEMENT LOAD PATH NOT DESIGNED",
  clearWidthInches: 36,
  clearRiseInches: 58,
  jambWidthInches: 3,
  lintelDepthInches: 2.25,
  outerWidthInches: 42,
  outerHeightInches: 60.25,
  sourcePatchRiseInches: Math.max(...entrancePatchVertices.map((vertex) => vertex.position[1])),
  hiddenFaceIds: ENTRANCE_PATCH_FACE_IDS,
  hiddenMemberPieceIds: Object.freeze(entranceHiddenMembers.map((member) => member.pieceId)),
  hiddenNodeIds: Object.freeze(entranceHiddenNodeIds),
  retainedBoundaryMemberPieceIds: Object.freeze(["L-01", "S-06", "S-07", "S-21", "S-23"] as const),
  note: "Optional visualization only. Six canonical face panels, seven canonical members, and node V007 are hidden only in the entrance-and-platform view; the verified 65-member reference model and schedules remain unchanged. The 36 in clear by 58 in rise is a crouch entry, not full standing access. The replacement frame is schematic: load path, reinforcement, joints, door, threshold, weather seals, drainage, egress, guards, foundation, and acoustic performance remain unevaluated.",
});

const PLATFORM_RADIAL_APRON_INCHES = 24;
const PLATFORM_RADIUS_INCHES = PROJECT.radiusInches + PLATFORM_RADIAL_APRON_INCHES;
const PLATFORM_DECK_BOARD_PITCH_INCHES = 5.5;

export const PLATFORM_CONCEPT = Object.freeze({
  status: "UNENGINEERED SPATIAL CONCEPT · ACOUSTICS NOT MODELED",
  diameterInches: PROJECT.diameterInches + 2 * PLATFORM_RADIAL_APRON_INCHES,
  radiusInches: PLATFORM_RADIUS_INCHES,
  radialApronBeyondDomeNodesInches: PLATFORM_RADIAL_APRON_INCHES,
  flatApronInches: PLATFORM_RADIAL_APRON_INCHES * Math.cos(Math.PI / 10),
  decagonSideInches: 2 * PLATFORM_RADIUS_INCHES * Math.sin(Math.PI / 10),
  clearBelowFrameInches: 12,
  frameDepthInches: 5.5,
  deckThicknessInches: 1.5,
  deckTopInches: 19,
  deckBoardPitchInches: PLATFORM_DECK_BOARD_PITCH_INCHES,
  deckBoardFaceWidthInches: 5.35,
  deckBoardCount: Math.ceil((2 * PLATFORM_RADIUS_INCHES) / PLATFORM_DECK_BOARD_PITCH_INCHES),
  primaryJoistCount: 10,
  rimJoistCount: 10,
  centerHubCount: 1,
  supportCount: 10,
  entryWidthInches: 36,
  entryStepCount: 3,
  entryTreadDepthInches: 10,
  constructionStrategy: "10 equal rim segments aligned with dome nodes · 10 primary radial frame lines · 10 supports directly below dome base nodes · straight deck boards",
  metalPolicy: "ALL-WOOD CONNECTION GOAL · hardwood pegs and wedges · joint sizes not selected",
  joineryConcept: "Housed rim seats, wedged through-tenon supports, and pegged or keyed all-wood frame joints; sizes not released",
  note: "Independent visual study only. The platform is exactly 192 in corner-to-corner. Because it and the 144 in dome base are regular decagons, the apron is 24 in at corresponding vertices and 22.825 in normal to corresponding flats—not 24 in everywhere. The 12 in clear underside, base-node datum at deck top, and three-rise approach are spatial concepts. The H4 clearance body reaches 1.5 in below the base-node datum, so a recess or higher bearing datum remains unresolved. The optional entrance view hides six face panels, seven members, and one node and adds a schematic wood cassette; this changes the audited shell topology and requires a replacement structural solution. No dome-to-platform load path, acoustic tuning, isolation frequency, joist sizing, opening reinforcement, guard, connection, foundation, code, or occupancy claim is issued.",
});

export const JOINERY_NOTES = Object.freeze([
  ["Verified connection axes", "130 directed centerline axes"],
  ["Current spatial clearance study", "0 of 24,570 sampled pocket pairs intersect"],
  ["Joint study status", "SPATIAL FIT ONLY · not engineered"],
  ["Fabrication dimensions", "WITHHELD · structural review open"],
] as const);

export const MODEL_ASSUMPTIONS = Object.freeze([
  "All dimensions are generated from a 72 in spherical radius.",
  "Member lengths are node-center to node-center chords, not finished stock cuts.",
  "Rendered hub prisms are schematic topology markers; the full-length timber solids overlap them by construction.",
  "The current study uses exact port-normal faces at a 4 in axial shoulder setback.",
  "The 24,570 sampled checks are 270 installed port pairs evaluated at 91 one-degree roll positions from 0 through 90 degrees.",
  "The sampled and continuous full-section member checks use 6 in external envelopes beginning at each shoulder, not complete timber lengths.",
  "The two-shell joint study clears the modeled member, tenon, pocket, key-relief, and center-bore envelopes, but is not structurally approved or build-ready.",
  "The geometric cap is complete; loads, connections, foundations, openings, and code compliance are outside this model.",
  "The 2 × 2 section is modeled at a dressed 1.5 × 1.5 in and must be checked against the actual stock.",
]);

export const JANTSZ_MESSAGE = `${HANDOFF.preparedFor} —

DOME CENTERLINE GEOMETRY VERIFIED
CURRENT JOINT STUDY CLEARS THE SPATIAL FIT TEST
STRUCTURAL REVIEW STILL OPEN — DO NOT CUT YET

Current spatial clearance study
• Every shoulder face is perpendicular to its member axis at an axial setback S = 4.000 in
• The body is the exact convex intersection of those port-normal faces; maximum planar footprints are H4 9.694 in, H5 10.111 in, and H6 10.271 in
• Radial hub slab: q = −2.500 to +0.500 in from the node datum
• Integral tenon study: 1.250 × 0.750 × 0.500 in
• Oversized digital pocket envelope: 1.300 × 0.780 × 0.530 in — a clearance test, not a fit tolerance
• Two equal 1.500 in radial shells split at q = −1.000 in; the split passes through every pocket by at least 0.348 in
• Selected member roll: width-radial and fixed; changing roll is not a fabrication option
• Sample domain: 270 installed port pairs at 91 one-degree roll positions from 0° through 90°
• The full-section member clearance proxies extend 6.000 in outward from each shoulder; they are not complete timber members
• The H4 body extends 1.500 in below the base-node datum and leaves a 0.750 in rim below the full timber shoulder; a foundation recess or raised node datum is still required

What the exact geometry now proves
• A conservative square envelope that contains the pocket at every continuous roll clears all 270 installed pocket-pair checks; minimum separating-axis margin 1.380 in
• A conservative square envelope that contains a rotated 1.5 × 1.5 in member clears all 270 installed member-pair checks; minimum margin 1.408 in
• The explicit 1° sweep still records 0 of 24,570 pocket-pair intersections and 0 of 24,570 member-envelope intersections
• The minimum sampled margins are 1.397 in between pocket envelopes and 1.538 in between full-section 6-inch member proxies
• Every pocket stays inside the radial slab and all non-entry faces; the full 1.5 × 1.5 in shoulder also fits with at least 1.011 in to any non-entry port face
• The modeled cross-key reliefs and central square bore clear every non-own pocket; these are capture-space checks only, not retention-capacity checks
• H4 still requires five positive-handed and five reflected-handed base installations

Verified dome centerline geometry
• 26 nodes / 65 member axes / 40 triangular faces
• 10-node planar regular-decagon base
• 30 short node-center chords at 39.350380 in
• 35 long node-center chords at 44.498447 in
• 10 × H4, 6 × H5, and 10 × H6 node-valence installations

Wood face and entrance studies
• 30 gross P1 faces: 39.350380 / 39.350380 / 44.498447 in; 32.456501 in planar altitude
• 10 gross P2 faces: 44.498447 in equilateral; 38.536786 in planar altitude
• 209.986765 sq ft total gross model surface; this is not a panel purchase quantity or finished cut schedule
• The optional 36 in clear × 58 in rise crouch entrance hides six faces, seven members, and node V007 only in that view
• The entrance, replacement load path, panel build-up, door, weather seals, platform joints, and acoustic performance are not designed
• The platform retains an all-wood connection goal; no connection or joint sizes are released

What is not proved
This closes spatial interference only. The split makes a captured assembly path plausible, but no closure or retention part has been released. The study does not establish wood strength, mortise or tenon capacity, hub lamination strength, adhesive durability, retention, assembly sequence, moisture movement, tolerances, loads, foundation, anchorage, code compliance, or occupancy safety. The stated dimensions do not establish a TFEC-standard tension-loaded wood-peg detail within the modeled 1.5 in section, so no peg is specified here. Other joint or retention concepts require their own engineering and test evidence.

Member-length mathematics
With the same S = 4.000 in shoulder setback at both ends, the CAD-only shoulder spans are 31.350380 in for short members and 36.498447 in for long members. Adding the two 1.250 in study tenons produces modeled tip-to-tip extents of 33.850380 in and 38.998447 in. These values explain the solid model; they are not issued cut lengths and must not be used for fabrication.

PDF status
The Rev ${PROJECT.revision} downloadable PDF records the canonical geometry, all 65 timber IDs, all 40 gross face templates, the optional entrance patch, the 192 in platform study, and the current spatial-clearance audit. It is not a cut list, shop drawing, blueprint, structural design, or fabrication release. Finished timber lengths, finished panel cuts, machining datums, mortise fit, laminating schedule, wedges or keys, CNC paths, and structural capacities remain withheld.

Next gate
Confirm actual stock, species and grade, service moisture and exposure, loads and occupancy, foundation and anchorage, the hub material/lamination system, retention method, assembly sequence, and tooling. Then the joint needs exact Boolean solids, ligament and grain checks, engineered capacity calculations, a full-scale prototype/test program, and an explicit fabrication release.`;
