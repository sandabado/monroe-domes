import assert from "node:assert/strict";
import test from "node:test";

import {
  V2_EXPECTED_COUNTS,
  V2_LONG_CHORD_FACTOR,
  V2_SHORT_CHORD_FACTOR,
  buildV2Hemisphere,
} from "../lib/geodesic.ts";

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("builds the audited frequency-2 hemispherical topology", () => {
  const dome = buildV2Hemisphere(72);

  assert.equal(dome.frequency, 2);
  assert.equal(dome.vertices.length, V2_EXPECTED_COUNTS.vertices);
  assert.equal(dome.edges.length, V2_EXPECTED_COUNTS.edges);
  assert.equal(dome.faces.length, V2_EXPECTED_COUNTS.faces);
  assert.equal(dome.baseVertexIds.length, V2_EXPECTED_COUNTS.baseVertices);
  assert.deepEqual(dome.audit.counts.struts, V2_EXPECTED_COUNTS.struts);
  assert.deepEqual(dome.audit.counts.hubs, V2_EXPECTED_COUNTS.hubs);

  assert.equal(dome.audit.topology.eulerCharacteristic, 1);
  assert.equal(dome.audit.topology.boundaryEdgeCount, 10);
  assert.equal(dome.audit.topology.strutEndpointCount, 130);
  assert.equal(dome.audit.topology.hubPortCount, 130);
  assert.deepEqual(
    {
      connectedComponentCount: dome.audit.topology.connectedComponentCount,
      uniqueVertexCount: dome.audit.topology.uniqueVertexCount,
      invalidEdgeEndpointCount: dome.audit.topology.invalidEdgeEndpointCount,
      uniqueFaceCount: dome.audit.topology.uniqueFaceCount,
      nondegenerateFaceCount: dome.audit.topology.nondegenerateFaceCount,
      duplicateFaceCount: dome.audit.topology.duplicateFaceCount,
      faceEdgeIncidenceCount: dome.audit.topology.faceEdgeIncidenceCount,
      manifoldBoundaryEdgeCount: dome.audit.topology.manifoldBoundaryEdgeCount,
      manifoldInteriorEdgeCount: dome.audit.topology.manifoldInteriorEdgeCount,
      invalidEdgeIncidenceCount: dome.audit.topology.invalidEdgeIncidenceCount,
      unmodeledFaceEdgeCount: dome.audit.topology.unmodeledFaceEdgeCount,
      boundaryVertexCount: dome.audit.topology.boundaryVertexCount,
      boundaryCycleCount: dome.audit.topology.boundaryCycleCount,
      boundaryDegreeErrorCount: dome.audit.topology.boundaryDegreeErrorCount,
      outwardFaceCount: dome.audit.topology.outwardFaceCount,
    },
    {
      connectedComponentCount: 1,
      uniqueVertexCount: 26,
      invalidEdgeEndpointCount: 0,
      uniqueFaceCount: 40,
      nondegenerateFaceCount: 40,
      duplicateFaceCount: 0,
      faceEdgeIncidenceCount: 120,
      manifoldBoundaryEdgeCount: 10,
      manifoldInteriorEdgeCount: 55,
      invalidEdgeIncidenceCount: 0,
      unmodeledFaceEdgeCount: 0,
      boundaryVertexCount: 10,
      boundaryCycleCount: 1,
      boundaryDegreeErrorCount: 0,
      outwardFaceCount: 40,
    },
  );
  closeTo(dome.audit.topology.minimumOutwardNormalDot, 0.999468099212803, 1e-12);
  assert.deepEqual(dome.audit.checks, {
    isTriangulatedDisk: true,
    isConnected: true,
    hasUniqueNondegenerateFaces: true,
    hasManifoldEdgeIncidence: true,
    hasSingleClosedBoundary: true,
    hasOutwardWinding: true,
    hasPlanarBase: true,
    hasRegularDecagonBase: true,
    hasBalancedConnections: true,
    hasTwoEdgeClasses: true,
  });
});

test("derives both strut classes and their exact radius scaling", () => {
  const radius = 72;
  const dome = buildV2Hemisphere(radius);
  const short = dome.edgeClasses.find(({ type }) => type === "S");
  const long = dome.edgeClasses.find(({ type }) => type === "L");

  assert.ok(short);
  assert.ok(long);
  assert.equal(short.count, 30);
  assert.equal(long.count, 35);
  closeTo(short.chordFactor, V2_SHORT_CHORD_FACTOR);
  closeTo(long.chordFactor, V2_LONG_CHORD_FACTOR);
  closeTo(short.length, 39.35038016342473, 1e-10);
  closeTo(long.length, 44.49844718999241, 1e-10);

  for (const edge of dome.edges) {
    closeTo(
      edge.chordFactor,
      edge.type === "S" ? V2_SHORT_CHORD_FACTOR : V2_LONG_CHORD_FACTOR,
      1e-12,
    );
  }
});

test("places every node on the sphere and the regular decagon on the equator", () => {
  const radius = 72;
  const dome = buildV2Hemisphere(radius);
  const byId = new Map(dome.vertices.map((vertex) => [vertex.id, vertex]));

  for (const vertex of dome.vertices) {
    closeTo(Math.hypot(...vertex.position), radius, 1e-10);
  }

  const apex = dome.vertices.find(({ position }) => Math.abs(position[1] - radius) < 1e-10);
  assert.ok(apex);
  assert.equal(apex.valence, 5);

  const base = dome.baseVertexIds.map((id) => byId.get(id));
  assert.ok(base.every(Boolean));
  for (const vertex of base) {
    assert.equal(vertex.isBase, true);
    closeTo(vertex.position[1], 0);
    closeTo(Math.hypot(vertex.position[0], vertex.position[2]), radius);
    assert.equal(vertex.valence, 4);
  }

  const sideLengths = base.map((vertex, index) => {
    const next = base[(index + 1) % base.length];
    return Math.hypot(
      vertex.position[0] - next.position[0],
      vertex.position[2] - next.position[2],
    );
  });
  for (const sideLength of sideLengths) {
    closeTo(sideLength, radius * V2_LONG_CHORD_FACTOR, 1e-10);
  }
});

test("emits unique manifold faces, edges, IDs, and outward winding", () => {
  const dome = buildV2Hemisphere(1);
  const byId = new Map(dome.vertices.map((vertex) => [vertex.id, vertex.position]));

  assert.equal(new Set(dome.vertices.map(({ id }) => id)).size, dome.vertices.length);
  assert.equal(new Set(dome.edges.map(({ id }) => id)).size, dome.edges.length);
  assert.equal(new Set(dome.faces.map(({ id }) => id)).size, dome.faces.length);

  const edgeKeys = dome.edges.map(({ start, end }) => [start, end].sort().join(":"));
  assert.equal(new Set(edgeKeys).size, dome.edges.length);

  const incidences = new Map(dome.edges.map((edge) => [edge.id, 0]));
  const edgeIdByKey = new Map(
    dome.edges.map((edge) => [[edge.start, edge.end].sort().join(":"), edge.id]),
  );

  const canonicalFaceKeys = new Set();
  for (const face of dome.faces) {
    assert.equal(new Set(face.vertices).size, 3);
    canonicalFaceKeys.add([...face.vertices].sort().join(":"));
    const [a, b, c] = face.vertices.map((id) => byId.get(id));
    assert.ok(a && b && c);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    assert.ok(Math.hypot(...normal) > 0);
    const centroid = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    assert.ok(normal[0] * centroid[0] + normal[1] * centroid[1] + normal[2] * centroid[2] > 0);

    for (const [start, end] of [
      [face.vertices[0], face.vertices[1]],
      [face.vertices[1], face.vertices[2]],
      [face.vertices[2], face.vertices[0]],
    ]) {
      const edgeId = edgeIdByKey.get([start, end].sort().join(":"));
      assert.ok(edgeId);
      incidences.set(edgeId, incidences.get(edgeId) + 1);
    }
  }
  assert.equal(canonicalFaceKeys.size, dome.faces.length);

  const baseEdgeSet = new Set(dome.baseEdgeIds);
  for (const [id, incidence] of incidences) {
    assert.equal(incidence, baseEdgeSet.has(id) ? 1 : 2);
  }

  const neighbors = new Map(dome.vertices.map(({ id }) => [id, new Set()]));
  for (const edge of dome.edges) {
    neighbors.get(edge.start).add(edge.end);
    neighbors.get(edge.end).add(edge.start);
  }
  const visited = new Set([dome.vertices[0].id]);
  const pending = [dome.vertices[0].id];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const neighbor of neighbors.get(current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      pending.push(neighbor);
    }
  }
  assert.equal(visited.size, dome.vertices.length);

  const boundaryEdges = dome.edges.filter(({ id }) => incidences.get(id) === 1);
  const boundaryNeighbors = new Map();
  for (const edge of boundaryEdges) {
    if (!boundaryNeighbors.has(edge.start)) boundaryNeighbors.set(edge.start, new Set());
    if (!boundaryNeighbors.has(edge.end)) boundaryNeighbors.set(edge.end, new Set());
    boundaryNeighbors.get(edge.start).add(edge.end);
    boundaryNeighbors.get(edge.end).add(edge.start);
  }
  assert.equal(boundaryNeighbors.size, boundaryEdges.length);
  assert.ok([...boundaryNeighbors.values()].every((adjacent) => adjacent.size === 2));
  const visitedBoundary = new Set([boundaryEdges[0].start]);
  const pendingBoundary = [boundaryEdges[0].start];
  while (pendingBoundary.length > 0) {
    const current = pendingBoundary.pop();
    for (const neighbor of boundaryNeighbors.get(current)) {
      if (visitedBoundary.has(neighbor)) continue;
      visitedBoundary.add(neighbor);
      pendingBoundary.push(neighbor);
    }
  }
  assert.equal(visitedBoundary.size, boundaryNeighbors.size);

  assert.equal(dome.audit.topology.connectedComponentCount, 1);
  assert.equal(dome.audit.topology.uniqueFaceCount, canonicalFaceKeys.size);
  assert.equal(dome.audit.topology.nondegenerateFaceCount, dome.faces.length);
  assert.equal(dome.audit.topology.faceEdgeIncidenceCount, dome.faces.length * 3);
  assert.equal(dome.audit.topology.manifoldBoundaryEdgeCount, boundaryEdges.length);
  assert.equal(dome.audit.topology.manifoldInteriorEdgeCount, dome.edges.length - boundaryEdges.length);
  assert.equal(dome.audit.topology.boundaryVertexCount, boundaryNeighbors.size);
  assert.equal(dome.audit.topology.boundaryCycleCount, 1);
  assert.equal(dome.audit.topology.outwardFaceCount, dome.faces.length);
});

test("is deterministic, scales linearly, and rejects invalid radii", () => {
  const first = buildV2Hemisphere(72);
  const second = buildV2Hemisphere(72);
  assert.deepEqual(second, first);

  const unit = buildV2Hemisphere(1);
  for (let index = 0; index < first.vertices.length; index += 1) {
    const fullScale = first.vertices[index].position;
    const unitScale = unit.vertices[index].position;
    closeTo(fullScale[0], unitScale[0] * 72);
    closeTo(fullScale[1], unitScale[1] * 72);
    closeTo(fullScale[2], unitScale[2] * 72);
  }
  closeTo(
    first.audit.topology.minimumOutwardNormalDot,
    unit.audit.topology.minimumOutwardNormalDot,
    1e-12,
  );

  assert.throws(() => buildV2Hemisphere(0), RangeError);
  assert.throws(() => buildV2Hemisphere(-1), RangeError);
  assert.throws(() => buildV2Hemisphere(Number.NaN), RangeError);
  assert.throws(() => buildV2Hemisphere(Number.POSITIVE_INFINITY), RangeError);
});
