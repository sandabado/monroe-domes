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
  assert.deepEqual(dome.audit.checks, {
    isTriangulatedDisk: true,
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

  for (const face of dome.faces) {
    assert.equal(new Set(face.vertices).size, 3);
    const [a, b, c] = face.vertices.map((id) => byId.get(id));
    assert.ok(a && b && c);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
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

  const baseEdgeSet = new Set(dome.baseEdgeIds);
  for (const [id, incidence] of incidences) {
    assert.equal(incidence, baseEdgeSet.has(id) ? 1 : 2);
  }
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

  assert.throws(() => buildV2Hemisphere(0), RangeError);
  assert.throws(() => buildV2Hemisphere(-1), RangeError);
  assert.throws(() => buildV2Hemisphere(Number.NaN), RangeError);
  assert.throws(() => buildV2Hemisphere(Number.POSITIVE_INFINITY), RangeError);
});
