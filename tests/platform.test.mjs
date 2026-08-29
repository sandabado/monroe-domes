import assert from "node:assert/strict";
import test from "node:test";

import {
  DOME_MODEL,
  ENTRANCE_STUDY,
  MEMBERS,
  PLATFORM_CONCEPT,
  PROJECT,
} from "../lib/spec.ts";

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("keeps the platform spatial concept derived from the canonical dome", () => {
  assert.equal(PROJECT.diameterInches, 144);
  assert.equal(PLATFORM_CONCEPT.diameterInches, 192);
  assert.ok(PLATFORM_CONCEPT.diameterInches > PROJECT.diameterInches);
  assert.equal(
    PLATFORM_CONCEPT.radiusInches - PROJECT.radiusInches,
    PLATFORM_CONCEPT.radialApronBeyondDomeNodesInches,
  );
  closeTo(
    PLATFORM_CONCEPT.flatApronInches,
    PLATFORM_CONCEPT.radialApronBeyondDomeNodesInches * Math.cos(Math.PI / 10),
  );
  closeTo(
    PLATFORM_CONCEPT.decagonSideInches,
    2 * PLATFORM_CONCEPT.radiusInches * Math.sin(Math.PI / 10),
  );
  assert.equal(
    PLATFORM_CONCEPT.clearBelowFrameInches
      + PLATFORM_CONCEPT.frameDepthInches
      + PLATFORM_CONCEPT.deckThicknessInches,
    PLATFORM_CONCEPT.deckTopInches,
  );
  assert.ok(
    PLATFORM_CONCEPT.deckBoardCount * PLATFORM_CONCEPT.deckBoardPitchInches
      >= PLATFORM_CONCEPT.diameterInches,
  );
  assert.ok(
    (PLATFORM_CONCEPT.deckBoardCount - 1) * PLATFORM_CONCEPT.deckBoardPitchInches
      < PLATFORM_CONCEPT.diameterInches,
  );
});

test("aligns the entrance study with one canonical base bay without changing the source dome", () => {
  assert.equal(MEMBERS.length, 65);
  const [startId, endId] = DOME_MODEL.baseVertexIds;
  const baseEdge = DOME_MODEL.edges.find((edge) =>
    (edge.start === startId && edge.end === endId)
      || (edge.start === endId && edge.end === startId),
  );
  assert.ok(baseEdge);
  assert.ok(DOME_MODEL.baseEdgeIds.includes(baseEdge.id));
  assert.ok(baseEdge.length > PLATFORM_CONCEPT.entryWidthInches);

  const adjoiningFace = DOME_MODEL.faces.find((face) =>
    face.vertices.includes(startId) && face.vertices.includes(endId),
  );
  assert.ok(adjoiningFace);
  assert.equal(DOME_MODEL.audit.topology.boundaryEdgeCount, 10);

  assert.deepEqual(
    ENTRANCE_STUDY.hiddenFaceIds,
    ["F006", "F007", "F012", "F021", "F022", "F023"],
  );
  assert.deepEqual(
    ENTRANCE_STUDY.hiddenMemberPieceIds,
    ["L-03", "L-06", "S-11", "S-12", "L-16", "L-17", "L-26"],
  );
  assert.deepEqual(ENTRANCE_STUDY.hiddenNodeIds, ["V007"]);
  assert.equal(ENTRANCE_STUDY.clearWidthInches, 36);
  assert.equal(ENTRANCE_STUDY.clearRiseInches, 58);
  assert.ok(ENTRANCE_STUDY.outerHeightInches < ENTRANCE_STUDY.sourcePatchRiseInches);
  assert.equal(MEMBERS.length, 65);
});
