import assert from "node:assert/strict";
import test from "node:test";

import {
  V3_CHORD_FACTORS,
  V3_FIVE_EIGHTHS_EXPECTED_COUNTS,
  buildV3FiveEighthsDome,
} from "../lib/geodesic3v.ts";
import {
  CONSTRUCTION_HOLDS_3V,
  DOME_MODEL_3V,
  MEMBERS_3V,
  PANEL_FAMILIES_3V,
  PANELS_3V,
  PROJECT_3V,
  REFERENCE_SYSTEMS_3V,
  SOURCE_PLAN_3V,
  THREE_V_RELEASE_BOUNDARY,
} from "../lib/spec3v.ts";

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test("builds the independently audited Class-I 3V 5/8 topology", () => {
  const dome = buildV3FiveEighthsDome(76);
  const expected = V3_FIVE_EIGHTHS_EXPECTED_COUNTS;

  assert.equal(dome.frequency, 3);
  assert.equal(dome.fraction, "5/8");
  assert.equal(dome.vertices.length, expected.vertices);
  assert.equal(dome.edges.length, expected.edges);
  assert.equal(dome.faces.length, expected.faces);
  assert.equal(dome.boundaryVertexIds.length, expected.boundaryVertices);
  assert.equal(dome.boundaryEdgeIds.length, expected.boundaryEdges);
  assert.deepEqual(dome.audit.counts.struts, expected.struts);
  assert.deepEqual(dome.audit.counts.hubs, expected.hubs);
  assert.equal(dome.audit.topology.faceEdgeIncidences, expected.faceEdgeIncidences);
  assert.equal(dome.audit.topology.eulerCharacteristic, 1);
  assert.equal(dome.audit.topology.strutEndpointCount, dome.audit.topology.hubPortCount);
  assert.equal(dome.audit.checks.hasSingleConnectedComponent, true);
  assert.equal(dome.audit.checks.hasManifoldEdges, true);
  assert.equal(dome.audit.checks.hasSingleBoundaryCycle, true);
  assert.equal(dome.audit.checks.hasUniqueFaces, true);
  assert.equal(dome.audit.checks.hasConsistentOutwardWinding, true);
  assert.equal(dome.audit.checks.isTriangulatedDisk, true);
  assert.ok(Object.values(dome.audit.checks).every(Boolean));
});

test("derives three radius-scaled chord families", () => {
  const dome = buildV3FiveEighthsDome(76);
  assert.deepEqual(dome.edgeClasses.map(({ type, count }) => ({ type, count })), [
    { type: "A", count: 30 },
    { type: "B", count: 55 },
    { type: "C", count: 80 },
  ]);
  for (const edgeClass of dome.edgeClasses) {
    closeTo(edgeClass.chordFactor, V3_CHORD_FACTORS[edgeClass.type]);
    closeTo(edgeClass.length, V3_CHORD_FACTORS[edgeClass.type] * 76);
  }
  closeTo(dome.edgeClasses[0].length, 26.49477715034568);
  closeTo(dome.edgeClasses[1].length, 30.669664137475017);
  closeTo(dome.edgeClasses[2].length, 31.343273187548583);
});

test("keeps the 5/8 boundary intentionally non-planar", () => {
  const dome = buildV3FiveEighthsDome(76);
  assert.equal(dome.audit.boundary.lowNodeCount, 5);
  assert.equal(dome.audit.boundary.highNodeCount, 10);
  closeTo(dome.audit.boundary.rippleInches, 1.212440735250391, 1e-8);
  closeTo(dome.audit.boundary.maximumNodePairSpanInches, 148.873676993935, 1e-8);
  closeTo(dome.audit.boundary.minimumCaliperSpanInches, 147.93570271785, 1e-8);
  closeTo(dome.audit.envelope.maximumMeshPlanSpanInches, 149.74429861996762, 1e-8);
  closeTo(dome.peakHeight, 90.25702803046607, 1e-8);
});

test("keeps every vertex on the 76 inch source sphere", () => {
  const dome = buildV3FiveEighthsDome(76);
  for (const vertex of dome.vertices) {
    closeTo(
      Math.hypot(
        vertex.position[0],
        vertex.position[1] - dome.sphereCenterHeight,
        vertex.position[2],
      ),
      76,
      1e-9,
    );
  }
  assert.ok(dome.audit.errors.maxSphereRadius < 1e-9);
  assert.ok(dome.audit.errors.maxEdgeClass < 1e-9);
});

test("is deterministic at any positive scale", () => {
  const first = buildV3FiveEighthsDome(76);
  const second = buildV3FiveEighthsDome(76);
  assert.deepEqual(first, second);

  const unit = buildV3FiveEighthsDome(1);
  for (let index = 0; index < first.edgeClasses.length; index += 1) {
    closeTo(first.edgeClasses[index].length / 76, unit.edgeClasses[index].length);
  }
});

test("rejects invalid sphere radii", () => {
  assert.throws(() => buildV3FiveEighthsDome(0), RangeError);
  assert.throws(() => buildV3FiveEighthsDome(-1), RangeError);
  assert.throws(() => buildV3FiveEighthsDome(Number.NaN), RangeError);
  assert.throws(() => buildV3FiveEighthsDome(Number.POSITIVE_INFINITY), RangeError);
});

test("reconciles the two canonical face families without publishing cut sizes", () => {
  assert.equal(PROJECT_3V.nominalBaseDiameterInches, 152);
  closeTo(DOME_MODEL_3V.audit.boundary.maximumNodePairSpanInches, 152, 1e-9);
  closeTo(DOME_MODEL_3V.sphereRadius * 2, 155.19197528076938, 1e-8);
  closeTo(DOME_MODEL_3V.peakHeight, 92.152410940906, 1e-8);
  assert.equal(MEMBERS_3V.length, 165);
  assert.equal(PANELS_3V.length, 105);
  assert.deepEqual(PANEL_FAMILIES_3V.map(({ family, classSignature, count }) => ({ family, classSignature, count })), [
    { family: "PENT", classSignature: "AAB", count: 30 },
    { family: "HEX", classSignature: "BCC", count: 75 },
  ]);
  const [pentFamily, hexFamily] = PANEL_FAMILIES_3V;
  assert.equal(pentFamily.baseClass, "B");
  assert.equal(hexFamily.baseClass, "B");
  closeTo(pentFamily.baseLengthInches, 31.313722096661344, 1e-9);
  closeTo(pentFamily.grossHeightInches, 22.059649374295724, 1e-9);
  closeTo(hexFamily.baseLengthInches, 31.31372209666134, 1e-9);
  closeTo(hexFamily.grossHeightInches, 27.909805109273513, 1e-9);
  assert.ok(MEMBERS_3V.every(({ status }) => status.includes("NOT A FINISHED CUT")));
  assert.ok(PANELS_3V.every(({ status }) => status.includes("NOT A FINISHED PANEL")));

  const reported = SOURCE_PLAN_3V.reportedComponentCounts;
  assert.equal(reported.fullHexPanels + (reported.rightDoorHalfPanels + reported.leftDoorHalfPanels) / 2, 75);
  assert.equal(reported.pentPanels, 30);
  assert.equal(reported.panelFrameEdgePieces, DOME_MODEL_3V.audit.topology.faceEdgeIncidences);
});

test("keeps geometric axes separate from the unresolved panel-frame schedule", () => {
  assert.equal(PROJECT_3V.status, "GEOMETRY VERIFIED · CONSTRUCTION PACKAGE INCOMPLETE");
  assert.deepEqual(REFERENCE_SYSTEMS_3V.map(({ id, count }) => ({ id, count })), [
    { id: "geometry-skeleton", count: 165 },
    { id: "source-panel-method", count: 315 },
  ]);
  assert.match(REFERENCE_SYSTEMS_3V[0].status, /NOT CUT LENGTHS/);
  assert.match(REFERENCE_SYSTEMS_3V[1].status, /CUTS WITHHELD/);
  assert.match(SOURCE_PLAN_3V.reconciliation, /doorway-piece allocation remains unresolved/i);
  assert.match(SOURCE_PLAN_3V.dimensionCrossCheck, /A −0\.011337 in/);
  assert.match(SOURCE_PLAN_3V.dimensionCrossCheck, /not machining accuracy or fabrication tolerances/i);
  assert.match(THREE_V_RELEASE_BOUNDARY.panelFrameMethod, /CUT SCHEDULE WITHHELD/);
  assert.match(THREE_V_RELEASE_BOUNDARY.entrance, /DO NOT CUT/);
  assert.match(THREE_V_RELEASE_BOUNDARY.platform, /ALL-WOOD OPTION NOT DESIGNED/);
  assert.match(THREE_V_RELEASE_BOUNDARY.occupancy, /NOT ESTABLISHED/);
  assert.ok(CONSTRUCTION_HOLDS_3V.every(({ status }) => status.length > 0));
});
