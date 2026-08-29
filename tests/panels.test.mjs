import assert from "node:assert/strict";
import test from "node:test";

import {
  DOME_MODEL,
  WOOD_PANEL_CONCEPT,
  WOOD_PANELS,
} from "../lib/spec.ts";

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("derives every gross wood panel face from the canonical dome", () => {
  assert.equal(WOOD_PANELS.length, DOME_MODEL.faces.length);
  assert.equal(new Set(WOOD_PANELS.map((panel) => panel.pieceId)).size, WOOD_PANELS.length);
  assert.equal(new Set(WOOD_PANELS.map((panel) => panel.faceId)).size, DOME_MODEL.faces.length);
  assert.deepEqual(
    Object.fromEntries(WOOD_PANEL_CONCEPT.types.map((panelType) => [panelType.type, panelType.count])),
    { P1: 30, P2: 10 },
  );
});

test("records the exact two gross triangle families without issuing finished cuts", () => {
  const p1 = WOOD_PANEL_CONCEPT.types.find(({ type }) => type === "P1");
  const p2 = WOOD_PANEL_CONCEPT.types.find(({ type }) => type === "P2");
  assert.ok(p1);
  assert.ok(p2);

  closeTo(p1.sideLengthsInches[0], 39.35038016342473);
  closeTo(p1.sideLengthsInches[1], 39.35038016342473);
  closeTo(p1.sideLengthsInches[2], 44.49844718999241);
  closeTo(p1.grossHeightInches, 32.45650117350783);
  closeTo(p1.areaSquareInches, 722.1319517206325);

  p2.sideLengthsInches.forEach((side) => closeTo(side, 44.49844718999241));
  closeTo(p2.grossHeightInches, 38.5367856954937);
  closeTo(p2.areaSquareInches, 857.4135615714904);
  closeTo(WOOD_PANEL_CONCEPT.grossTotalAreaSquareFeet, 209.98676505092973);

  assert.ok(WOOD_PANELS.every((panel) => panel.status.includes("NOT A FINISHED PANEL CUT")));
  assert.match(WOOD_PANEL_CONCEPT.note, /not finished panel cuts/i);
});
