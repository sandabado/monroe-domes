import { buildV2Hemisphere } from "./geodesic";
import { deriveV2Joinery } from "./joinery";

export const PROJECT = Object.freeze({
  id: "WB-DOME-12-V2",
  revision: "05",
  diameterInches: 144,
  radiusInches: 72,
  peakHeightInches: 72,
  frequency: 2,
  baseShape: "Regular decagon",
  geometryMethod: "Class-I 2V icosahedron · radial projection · equatorial cut",
});

export const DOME_MODEL = buildV2Hemisphere(PROJECT.radiusInches);
export const JOINERY_MODEL = deriveV2Joinery(DOME_MODEL);

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

export const JOINERY_NOTES = Object.freeze([
  ["Connection status", "REJECTED · redesign required"],
  ["Exact geometry", "130 directed connection axes"],
  ["Supplied envelope", "3 in across · 2 in radial reference"],
  ["Rejected tenon", "1.5 × 1.25 × 0.5 in"],
  ["Collision result", "Every unclipped tested tenon pair intersects"],
  ["Finished cuts", "WITHHELD"],
] as const);

export const MODEL_ASSUMPTIONS = Object.freeze([
  "All dimensions are generated from a 72 in spherical radius.",
  "Member lengths are node-center to node-center chords, not finished stock cuts.",
  "Rendered hub prisms are schematic topology markers; the full-length timber solids overlap them by construction.",
  "At a 1.5 in common tangent-plane offset, every tested pair of 1.5 in tenon volumes intersects; no hub solid was derived or clipped.",
  "The geometric cap is complete; loads, connections, foundations, openings, and code compliance are outside this model.",
  "The 2 × 2 section is modeled at a dressed 1.5 × 1.5 in and must be checked against the actual stock.",
]);

export const JANTSZ_MESSAGE = `Hey Jantsz —

Stop before cutting or ordering anything from the earlier notes. The 12 ft V2 centerline geometry is now audited, but the supplied mortise-and-tenon hub is not viable.

Verified centerline geometry:
• 26 nodes
• 65 individual timber axes
• 40 triangular faces
• 10-vertex planar decagon base
• Coordinate datum: +Y up; base V017 is +18° from +X in the XZ plane
• 30 short chords @ 39.350380 in
• 35 long chords @ 44.498447 in
• 10 × 4-way base nodes
• 6 × 5-way nodes
• 10 × 6-way nodes
• 130 member endpoints = 130 directed connection axes

Rejected connection concept:
• 3 in across × 2 in thick hub
• 1.5 × 1.25 × 0.5 in tenons
• 1.5 in “through” mortises

Using the exact installed 4-, 5-, and 6-way axes and a common 1.5 in tangent-plane offset, every pair of the untrimmed tenon test volumes intersects. Rotating the tenons 90° does not cure it. This test does not derive or clip against a 2 in hub solid; the visible node markers are schematic, not machinable solids. The 10 base H4 stars also divide into five positive- and five reflected-handed installations, so no single H4 machining template is released.

No finished timber lengths, hub blocks, mortises, wedges, CNC files, PDFs, or blueprints are released. The next step is to choose a physically viable hub family and supply the actual stock, material, exposure, load, assembly, and tooling inputs. Then the new solid must pass collision, ligament, grain, assembly-access, prototype, and structural review before a fabrication release.`;
