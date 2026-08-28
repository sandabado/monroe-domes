import assert from "node:assert/strict";
import test from "node:test";

import {
  PROPOSED_JOINERY,
  auditTenonCollisions,
  buildV2Joinery,
  centerlineToBlankLength,
  centerlineToShoulderLength,
  derivePortFrame,
  intersectOrientedBoxes,
  makeTenonObb,
  resolveFabricationClasses,
  tangentFaceSetback,
} from "../lib/joinery.ts";

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const magnitude = (vector) => Math.hypot(...vector);

test("derives 130 deterministic endpoint frames with opposite edge axes", () => {
  const joinery = buildV2Joinery(72);

  assert.equal(joinery.installedHubs.length, 26);
  assert.equal(joinery.ports.length, 130);
  assert.deepEqual(
    joinery.hubOrbits.map(({ id, templateId, valence, count }) => ({ id, templateId, valence, count })),
    [
      { id: "O4", templateId: "H4", valence: 4, count: 10 },
      { id: "O5", templateId: "H5", valence: 5, count: 6 },
      { id: "O6", templateId: "H6", valence: 6, count: 10 },
    ],
  );

  for (const port of joinery.ports) {
    closeTo(magnitude(port.axis), 1);
    closeTo(magnitude(port.outwardNormal), 1);
    closeTo(magnitude(port.tangentDirection), 1);
    closeTo(magnitude(port.radialRollAxis), 1);
    closeTo(magnitude(port.tangentialRollAxis), 1);
    closeTo(dot(port.axis, port.radialRollAxis), 0);
    closeTo(dot(port.axis, port.tangentialRollAxis), 0);
    closeTo(dot(port.radialRollAxis, port.tangentialRollAxis), 0);
  }

  for (const edge of joinery.geometry.edges) {
    const endpointPorts = joinery.ports.filter(({ edgeId }) => edgeId === edge.id);
    assert.equal(endpointPorts.length, 2);
    closeTo(endpointPorts[0].axis[0], -endpointPorts[1].axis[0]);
    closeTo(endpointPorts[0].axis[1], -endpointPorts[1].axis[1]);
    closeTo(endpointPorts[0].axis[2], -endpointPorts[1].axis[2]);
  }

  const apex = joinery.installedHubs.find(({ id }) => id === "V001");
  assert.ok(apex);
  assert.deepEqual(apex.position, [0, 72, 0]);
  assert.deepEqual(apex.tangentX, [0.9999999999999999, 0, 0]);
  closeTo(apex.tangentY[0], 0);
  closeTo(apex.tangentY[1], 0);
  closeTo(apex.tangentY[2], 1);
  const first = apex.ports[0];
  closeTo(first.axis[0], 0.9619383577839175);
  closeTo(first.axis[1], -0.2732665289126719);
  closeTo(first.axis[2], 0);
  closeTo(first.radialRollAxis[0], 0.2732665289126719);
  closeTo(first.radialRollAxis[1], 0.9619383577839172);
  closeTo(first.tangentialRollAxis[0], 0);
  closeTo(first.tangentialRollAxis[1], 0);
  closeTo(first.tangentialRollAxis[2], 1);
  closeTo(first.tangentSlopeDegrees, 15.8587372057305);
});

test("matches each valence family while preserving installed handedness", () => {
  const joinery = buildV2Joinery(72);
  const byId = new Map(joinery.hubTemplates.map((template) => [template.id, template]));
  const h4 = byId.get("H4");
  const h5 = byId.get("H5");
  const h6 = byId.get("H6");
  assert.ok(h4 && h5 && h6);

  const h4Handedness = joinery.installedHubs
    .filter(({ valence }) => valence === 4)
    .reduce((counts, { handedness }) => ({
      ...counts,
      [handedness]: (counts[handedness] ?? 0) + 1,
    }), {});
  assert.deepEqual(h4Handedness, { "1": 5, "-1": 5 });

  assert.deepEqual(h4.ports.map(({ role, type }) => `${role}:${type}`), [
    "base:L",
    "shell:S",
    "shell:L",
    "base:L",
  ]);
  assert.deepEqual(h4.ports.map(({ azimuthDegrees }) => azimuthDegrees), [
    0,
    58.28252558853902,
    116.56505117707805,
    180,
  ]);
  h4.ports.map(({ includedAngleToNextDegrees }) => includedAngleToNextDegrees).forEach((angle, index) =>
    closeTo(angle, [55.5690117921037, 55.5690117921037, 60, 144][index]),
  );

  assert.deepEqual(h5.ports.map(({ type }) => type), ["S", "S", "S", "S", "S"]);
  h5.ports.forEach((port, index) => {
    closeTo(port.azimuthDegrees, index * 72);
    closeTo(port.includedAngleToNextDegrees, 68.8619764157927);
  });

  assert.deepEqual(h6.ports.map(({ type }) => type), ["S", "L", "L", "S", "L", "L"]);
  [0, 58.282525588539, 121.717474411461, 180, 238.282525588539, 301.717474411461]
    .forEach((angle, index) => closeTo(h6.ports[index].azimuthDegrees, angle));
  [55.569011792104, 60, 55.569011792104, 55.569011792104, 60, 55.569011792104]
    .forEach((angle, index) => closeTo(h6.ports[index].includedAngleToNextDegrees, angle));

  for (const hub of joinery.installedHubs) {
    const template = byId.get(hub.templateId);
    assert.ok(template);
    assert.equal(hub.ports.length, template.ports.length);
    hub.ports.forEach((port, index) => {
      assert.equal(port.type, template.ports[index].type);
      assert.equal(port.role, template.ports[index].role);
      closeTo(port.azimuthDegrees, template.ports[index].azimuthDegrees);
      closeTo(port.tangentSlopeDegrees, template.ports[index].tangentSlopeDegrees);
    });
  }
});

test("derives exactly five endpoint fabrication classes", () => {
  const joinery = buildV2Joinery(72);
  assert.deepEqual(
    joinery.fabricationClasses.map(({ id, type, firstHubValence, secondHubValence, count }) => ({
      id,
      type,
      firstHubValence,
      secondHubValence,
      count,
    })),
    [
      { id: "S-5-6", type: "S", firstHubValence: 5, secondHubValence: 6, count: 20 },
      { id: "S-4-5", type: "S", firstHubValence: 4, secondHubValence: 5, count: 10 },
      { id: "L-6-6", type: "L", firstHubValence: 6, secondHubValence: 6, count: 15 },
      { id: "L-4-6", type: "L", firstHubValence: 4, secondHubValence: 6, count: 10 },
      { id: "L-4-4", type: "L", firstHubValence: 4, secondHubValence: 4, count: 10 },
    ],
  );
  assert.equal(
    joinery.fabricationClasses.reduce((total, memberClass) => total + memberClass.count, 0),
    65,
  );

  const setbacks = { 4: 2, 5: 2.5, 6: 3 };
  const tenons = { 4: 1.25, 5: 1.5, 6: 1.75 };
  const resolved = resolveFabricationClasses(joinery.fabricationClasses, setbacks, tenons);
  for (const memberClass of resolved) {
    closeTo(
      memberClass.shoulderLength,
      memberClass.centerlineLength -
        setbacks[memberClass.firstHubValence] -
        setbacks[memberClass.secondHubValence],
    );
    closeTo(
      memberClass.blankLength,
      memberClass.shoulderLength +
        tenons[memberClass.firstHubValence] +
        tenons[memberClass.secondHubValence],
    );
  }

  closeTo(centerlineToShoulderLength(44.5, 2, 3), 39.5);
  closeTo(centerlineToBlankLength(44.5, 2, 3, 1.5, 1.25), 42.25);
});

test("derives tangent-face setbacks from the installed port axes", () => {
  const joinery = buildV2Joinery(72);
  const short = joinery.tangentSetbacks.find(({ type }) => type === "S");
  const long = joinery.tangentSetbacks.find(({ type }) => type === "L");
  assert.ok(short && long);
  closeTo(short.setback, 1.5593514780465263);
  closeTo(short.tipDistance, 0.0593514780465263);
  closeTo(long.setback, 1.5771933363574007);
  closeTo(long.tipDistance, 0.0771933363574007);

  for (const port of joinery.ports) {
    const expected = port.type === "S" ? short.setback : long.setback;
    closeTo(tangentFaceSetback(1.5, port.axis, port.outwardNormal), expected);
  }
});

test("finds every proposed tenon pair colliding in every 4, 5, and 6-way hub", () => {
  const joinery = buildV2Joinery(72);
  assert.deepEqual(joinery.collisionAudits.map(({ orientation }) => orientation), [
    "width-tangential",
    "width-radial",
  ]);

  for (const audit of joinery.collisionAudits) {
    assert.equal(audit.apothem, 1.5);
    assert.deepEqual(audit.tenon, { length: 1.5, width: 1.25, thickness: 0.5 });
    assert.equal(audit.allPairsCollide, true);
    assert.deepEqual(
      audit.byValence.map(
        ({ valence, hubCount, pairsPerHub, collisionsPerHub, allPairsCollide }) => ({
          valence,
          hubCount,
          pairsPerHub,
          collisionsPerHub,
          allPairsCollide,
        }),
      ),
      [
        { valence: 4, hubCount: 10, pairsPerHub: 6, collisionsPerHub: 6, allPairsCollide: true },
        { valence: 5, hubCount: 6, pairsPerHub: 10, collisionsPerHub: 10, allPairsCollide: true },
        { valence: 6, hubCount: 10, pairsPerHub: 15, collisionsPerHub: 15, allPairsCollide: true },
      ],
    );
    for (const hub of audit.hubs) {
      assert.equal(hub.pairCount, (hub.valence * (hub.valence - 1)) / 2);
      assert.equal(hub.collisionCount, hub.pairCount);
      assert.ok(hub.pairs.every(({ intersects }) => intersects));
    }
  }

  const apex = joinery.installedHubs.find(({ id }) => id === "V001");
  assert.ok(apex);
  const direct = auditTenonCollisions(
    [apex],
    PROPOSED_JOINERY.apothem,
    PROPOSED_JOINERY.tenon,
    "width-tangential",
  );
  assert.equal(direct.hubs[0].collisionCount, 10);
});

test("uses a complete separating-axis test for rotated rectangular boxes", () => {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const first = { id: "A", center: [0, 0, 0], axes, halfExtents: [1, 1, 1] };
  const touching = { id: "B", center: [2, 0, 0], axes, halfExtents: [1, 1, 1] };
  const separated = { id: "C", center: [3, 0, 0], axes, halfExtents: [1, 1, 1] };
  assert.equal(intersectOrientedBoxes(first, touching).intersects, true);
  const result = intersectOrientedBoxes(first, separated);
  assert.equal(result.intersects, false);
  closeTo(result.separation, 1);

  const joinery = buildV2Joinery(72);
  const port = joinery.installedHubs[0].ports[0];
  const tangential = makeTenonObb(port, 1.5, PROPOSED_JOINERY.tenon, "width-tangential");
  const radial = makeTenonObb(port, 1.5, PROPOSED_JOINERY.tenon, "width-radial");
  assert.deepEqual(tangential.halfExtents, radial.halfExtents);
  assert.deepEqual(tangential.axes[1], radial.axes[2]);
  assert.deepEqual(tangential.axes[2], radial.axes[1]);
});

test("rejects invalid radii, dimensions, frames, setbacks, and boxes", () => {
  assert.throws(() => buildV2Joinery(0), RangeError);
  assert.throws(() => buildV2Joinery(Number.NaN), RangeError);
  assert.throws(
    () => buildV2Joinery(72, { apothem: 0, tenon: PROPOSED_JOINERY.tenon }),
    RangeError,
  );
  assert.throws(
    () => buildV2Joinery(72, { apothem: 1.5, tenon: { length: 1.5, width: 0, thickness: 0.5 } }),
    RangeError,
  );
  assert.throws(() => derivePortFrame([0, 0, 0], [1, 0, 0]), RangeError);
  assert.throws(() => derivePortFrame([1, 0, 0], [1, 0, 0]), RangeError);
  assert.throws(() => tangentFaceSetback(0, [1, 0, 0], [0, 1, 0]), RangeError);
  assert.throws(() => tangentFaceSetback(1.5, [1, 0, 0], [1, 0, 0]), RangeError);
  assert.throws(() => centerlineToShoulderLength(4, 2, 2), RangeError);
  assert.throws(() => centerlineToBlankLength(10, 1, 1, -1, 1), RangeError);
  assert.throws(
    () => auditTenonCollisions([], 1.5, PROPOSED_JOINERY.tenon, "width-tangential"),
    RangeError,
  );

  const invalidBox = {
    id: "invalid",
    center: [0, 0, 0],
    axes: [[2, 0, 0], [0, 1, 0], [0, 0, 1]],
    halfExtents: [1, 1, 1],
  };
  const validBox = {
    id: "valid",
    center: [0, 0, 0],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    halfExtents: [1, 1, 1],
  };
  assert.throws(() => intersectOrientedBoxes(invalidBox, validBox), RangeError);
});
