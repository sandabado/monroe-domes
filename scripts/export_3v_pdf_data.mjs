import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

// Next.js resolves extensionless local TypeScript imports. Node's standalone
// type-stripper does not, so mirror the application resolver for this export.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  CONSTRUCTION_HOLDS_3V,
  DOME_MODEL_3V,
  MEMBERS_3V,
  MODEL_ASSUMPTIONS_3V,
  PANELS_3V,
  PANEL_FAMILIES_3V,
  PROJECT_3V,
  REFERENCE_SYSTEMS_3V,
  SOURCE_PLAN_3V,
  THREE_V_RELEASE_BOUNDARY,
} = await import("../lib/spec3v.ts");

const nearlyEqual = (actual, expected, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;

function assertExportContract() {
  const { audit } = DOME_MODEL_3V;
  const classByType = Object.fromEntries(
    DOME_MODEL_3V.edgeClasses.map((item) => [item.type, item]),
  );
  const hubByValence = Object.fromEntries(
    DOME_MODEL_3V.hubClasses.map((item) => [String(item.valence), item]),
  );
  const familyById = Object.fromEntries(
    PANEL_FAMILIES_3V.map((item) => [item.family, item]),
  );

  if (PROJECT_3V.revision !== "INTAKE-01") throw new Error("Unexpected 3V revision.");
  if (PROJECT_3V.status !== "GEOMETRY VERIFIED · CONSTRUCTION PACKAGE INCOMPLETE") {
    throw new Error("The 3V export must remain a geometry-only construction hold.");
  }
  if (!Object.values(audit.checks).every(Boolean)) throw new Error("3V audit checks are not all true.");
  if (
    audit.counts.vertices !== 61
    || audit.counts.edges !== 165
    || audit.counts.faces !== 105
    || audit.counts.boundaryVertices !== 15
    || audit.topology.boundaryEdgeCount !== 15
    || audit.topology.eulerCharacteristic !== 1
    || audit.topology.faceEdgeIncidences !== 315
  ) throw new Error("Unexpected 3V topology in PDF export.");
  if (
    classByType.A?.count !== 30
    || classByType.B?.count !== 55
    || classByType.C?.count !== 80
  ) throw new Error("Unexpected 3V edge-class counts in PDF export.");
  if (
    hubByValence["4"]?.count !== 15
    || hubByValence["5"]?.count !== 6
    || hubByValence["6"]?.count !== 40
  ) throw new Error("Unexpected 3V node-valence counts in PDF export.");
  if (
    familyById.PENT?.count !== 30
    || familyById.HEX?.count !== 75
    || PANELS_3V.length !== 105
  ) throw new Error("Unexpected 3V gross-face families in PDF export.");
  if (
    familyById.PENT?.baseClass !== "B"
    || familyById.HEX?.baseClass !== "B"
    || !nearlyEqual(familyById.PENT?.grossHeightInches, 22.059649374295724)
    || !nearlyEqual(familyById.HEX?.grossHeightInches, 27.90980510917699)
  ) throw new Error("The 3V face-family B-edge altitude convention changed unexpectedly.");
  if (!nearlyEqual(audit.boundary.maximumNodePairSpanInches, 152, 1e-8)) {
    throw new Error("The normalized 3V boundary maximum span is not 152 inches.");
  }
  if (
    MEMBERS_3V.length !== 165
    || new Set(MEMBERS_3V.map(({ pieceId }) => pieceId)).size !== 165
    || new Set(PANELS_3V.map(({ pieceId }) => pieceId)).size !== 105
  ) throw new Error("3V schedule IDs are not complete and unique.");
  if (SOURCE_PLAN_3V.reportedComponentCounts.panelFrameEdgePieces !== 315) {
    throw new Error("Unexpected private-source face-edge-piece count.");
  }
  if (
    THREE_V_RELEASE_BOUNDARY.fabrication !== "NOT RELEASED"
    || THREE_V_RELEASE_BOUNDARY.structure !== "NOT ENGINEERED"
    || THREE_V_RELEASE_BOUNDARY.joinery !== "NOT MODELED"
  ) throw new Error("The 3V release boundary was widened unexpectedly.");
}

assertExportContract();

const payload = {
  project: PROJECT_3V,
  model: {
    sphereRadius: DOME_MODEL_3V.sphereRadius,
    sphereCenterHeight: DOME_MODEL_3V.sphereCenterHeight,
    peakHeight: DOME_MODEL_3V.peakHeight,
    frequency: DOME_MODEL_3V.frequency,
    fraction: DOME_MODEL_3V.fraction,
    vertices: DOME_MODEL_3V.vertices,
    edges: DOME_MODEL_3V.edges,
    faces: DOME_MODEL_3V.faces,
    boundaryVertexIds: DOME_MODEL_3V.boundaryVertexIds,
    boundaryEdgeIds: DOME_MODEL_3V.boundaryEdgeIds,
    edgeClasses: DOME_MODEL_3V.edgeClasses,
    hubClasses: DOME_MODEL_3V.hubClasses,
    audit: DOME_MODEL_3V.audit,
  },
  members: MEMBERS_3V,
  panels: PANELS_3V,
  panelFamilies: PANEL_FAMILIES_3V,
  sourcePlan: SOURCE_PLAN_3V,
  referenceSystems: REFERENCE_SYSTEMS_3V,
  constructionHolds: CONSTRUCTION_HOLDS_3V,
  modelAssumptions: MODEL_ASSUMPTIONS_3V,
  releaseBoundary: THREE_V_RELEASE_BOUNDARY,
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

const sourceDigest = createHash("sha256")
  .update(JSON.stringify(canonicalize(payload)))
  .digest("hex");

process.stdout.write(JSON.stringify({ ...payload, sourceDigest }));
