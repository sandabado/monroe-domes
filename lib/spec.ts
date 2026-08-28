import { buildV2Hemisphere } from "./geodesic";
import {
  REDESIGN_HUB_ENVELOPE,
  REDESIGN_CONTINUOUS_POCKET_ENVELOPE,
  REDESIGN_CAPTURE_STUDY,
  REDESIGN_JOINERY_STUDY,
  REDESIGN_POCKET_ENVELOPE,
  auditAxialTenonCollisions,
  buildRedesignHubVertices,
  deriveV2Joinery,
} from "./joinery";

export const PROJECT = Object.freeze({
  id: "WB-DOME-12-V2",
  revision: "06",
  diameterInches: 144,
  radiusInches: 72,
  peakHeightInches: 72,
  frequency: 2,
  baseShape: "Regular decagon",
  geometryMethod: "Class-I 2V icosahedron · radial projection · equatorial cut",
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
  sampledPocketCollisions: 0,
  minimumSampledPocketSeparation: 1.3966370358711595,
  externalMemberPairTests: 24_570,
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
  note: "Clearance result only. Port-normal shoulders, fixed width-radial roll, exact convex shells, and the common split make the geometry explicit; retention capacity, strength, durability, tolerances, and fabrication remain unissued.",
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

export const PLATFORM_CONCEPT = Object.freeze({
  status: "UNENGINEERED CONCEPT · ACOUSTIC PERFORMANCE UNVERIFIED",
  diameterInches: 132,
  radiusInches: 66,
  decagonSideInches: 2 * 66 * Math.sin(Math.PI / 10),
  clearBelowFrameInches: 12,
  frameDepthInches: 5.5,
  deckThicknessInches: 1.5,
  deckTopInches: 19,
  deckBoardCount: 24,
  primaryJoistCount: 10,
  rimJoistCount: 10,
  centerHubCount: 1,
  supportCount: 10,
  note: "Independent visual study only. No shared dome load path, acoustic tuning, isolation frequency, joist capacity, connection, foundation, code, or occupancy claim is issued.",
});

export const JOINERY_NOTES = Object.freeze([
  ["Original tenon test", "FAILS · neighboring tenons overlap"],
  ["Verified connection axes", "130 directed centerline axes"],
  ["Original comparison envelope", "3 in across · 2 in radial reference"],
  ["Original test tenon", "1.5 × 1.25 × 0.5 in"],
  ["Redesign clearance study", "0 of 24,570 sampled pocket pairs intersect"],
  ["Fabrication dimensions", "WITHHELD · structural review open"],
] as const);

export const MODEL_ASSUMPTIONS = Object.freeze([
  "All dimensions are generated from a 72 in spherical radius.",
  "Member lengths are node-center to node-center chords, not finished stock cuts.",
  "Rendered hub prisms are schematic topology markers; the full-length timber solids overlap them by construction.",
  "At a 1.5 in common tangent-plane offset, every tested pair of 1.5 in tenon volumes intersects; no hub solid was derived or clipped.",
  "The redesign uses exact port-normal faces at a 4 in axial shoulder setback, not tangent faces or a claimed across-flats block size.",
  "The two-shell redesign clears the modeled member, tenon, pocket, key-relief, and center-bore envelopes, but is not structurally approved or build-ready.",
  "The geometric cap is complete; loads, connections, foundations, openings, and code compliance are outside this model.",
  "The 2 × 2 section is modeled at a dressed 1.5 × 1.5 in and must be checked against the actual stock.",
]);

export const JANTSZ_MESSAGE = `Jantsz —

DOME CENTERLINE GEOMETRY VERIFIED
REDESIGN CLEARS THE SPATIAL INTERFERENCE TEST
STRUCTURAL REVIEW STILL OPEN — DO NOT CUT YET

What failed — and why
The dome mathematics did not fail. The first joint sketch put 1.5 × 1.25 × 0.5 in tenons into a 3 in tangent envelope. The short-member tenon tips stopped only 0.059 in from the node center and the long-member tips only 0.077 in away. Neighboring tenons therefore occupied the same central wood. Every tested pair overlapped: H4 6/6, H5 10/10, and H6 15/15 in both tested 90° rolls.

What changed in the redesign study
• Every shoulder face is perpendicular to its member axis at an axial setback S = 4.000 in
• The body is the exact convex intersection of those port-normal faces; maximum planar footprints are H4 9.694 in, H5 10.111 in, and H6 10.271 in
• Radial hub slab: q = −2.500 to +0.500 in from the node datum
• Integral tenon study: 1.250 × 0.750 × 0.500 in
• Oversized digital pocket envelope: 1.300 × 0.780 × 0.530 in — a clearance test, not a fit tolerance
• Two equal 1.500 in radial shells split at q = −1.000 in; the split passes through every pocket by at least 0.348 in
• Selected member roll: width-radial and fixed; changing roll is not a fabrication option
• The H4 body extends 1.500 in below the base-node datum and leaves a 0.750 in rim below the full timber shoulder; a foundation recess or raised node datum is still required

What the exact geometry now proves
• A conservative square envelope that contains the pocket at every continuous roll clears all 270 installed pocket-pair checks; minimum separating-axis margin 1.380 in
• A conservative square envelope that contains a rotated 1.5 × 1.5 in member clears all 270 installed member-pair checks; minimum margin 1.408 in
• The explicit 1° sweep still records 0 of 24,570 pocket-pair intersections and 0 of 24,570 member-envelope intersections
• The minimum sampled margins are 1.397 in between pocket envelopes and 1.538 in between full member envelopes
• Every pocket stays inside the radial slab and all non-entry faces; the full 1.5 × 1.5 in shoulder also fits with at least 1.011 in to any non-entry port face
• The modeled cross-key reliefs and central square bore clear every non-own pocket; these are capture-space checks only, not retention-capacity checks
• H4 still requires five positive-handed and five reflected-handed base installations

Verified dome centerline geometry
• 26 nodes / 65 member axes / 40 triangular faces
• 10-node planar regular-decagon base
• 30 short node-center chords at 39.350380 in
• 35 long node-center chords at 44.498447 in
• 10 × H4, 6 × H5, and 10 × H6 node-valence installations

What is not proved
This closes spatial interference only. The split makes a captured assembly path plausible, but no closure or retention part has been released. The study does not establish wood strength, mortise or tenon capacity, hub lamination strength, adhesive durability, retention, assembly sequence, moisture movement, tolerances, loads, foundation, anchorage, code compliance, or occupancy safety. The 1.5 in strut section is too small for a standard pegged mortise-and-tenon detail under the cited timber-frame peg geometry, so no peg is specified here.

Member-length mathematics
With the same S = 4.000 in shoulder setback at both ends, the CAD-only shoulder spans are 31.350380 in for short members and 36.498447 in for long members. Adding the two 1.250 in study tenons produces modeled tip-to-tip extents of 33.850380 in and 38.998447 in. These values explain the solid model; they are not issued cut lengths and must not be used for fabrication.

PDF status
The downloadable PDF is a geometry and clearance audit. It is not a cut list, shop drawing, blueprint, structural design, or fabrication release. Finished timber lengths, machining datums, mortise fit, laminating schedule, wedges or keys, CNC paths, and structural capacities remain withheld.

Next gate
Confirm actual stock, species and grade, service moisture and exposure, loads and occupancy, foundation and anchorage, the hub material/lamination system, retention method, assembly sequence, and tooling. Then the joint needs exact Boolean solids, ligament and grain checks, engineered capacity calculations, a full-scale prototype/test program, and an explicit fabrication release.`;
