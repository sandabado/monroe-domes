// Node's direct TypeScript runner requires the source extension; this repo intentionally has no emitted JS test build.
// @ts-expect-error TS5097 is intentionally suppressed for direct Node execution.
import { buildV2Hemisphere, type GeodesicEdge, type HubValence, type StrutType, type V2Hemisphere, type Vector3Tuple } from "./geodesic.ts";

export type PortRole = "base" | "shell";
export type TenonRollOrientation = "width-tangential" | "width-radial";
export type FabricationClassId = "S-5-6" | "S-4-5" | "L-6-6" | "L-4-6" | "L-4-4";
export type HubTemplateId = "H4" | "H5" | "H6";
export type HubOrbitId = "O4" | "O5" | "O6";

export interface PortRollFrame {
  /** Unit vector from the hub center toward the neighboring hub. */
  readonly axis: Vector3Tuple;
  /** Unit sphere normal at the installed hub. */
  readonly outwardNormal: Vector3Tuple;
  /** Normalized projection of the port axis into the hub tangent plane. */
  readonly tangentDirection: Vector3Tuple;
  /** Radial roll datum projected into the plane normal to `axis`. */
  readonly radialRollAxis: Vector3Tuple;
  /** Completes the roll frame: axis cross radialRollAxis. */
  readonly tangentialRollAxis: Vector3Tuple;
  readonly tangentSlopeRadians: number;
  readonly tangentSlopeDegrees: number;
}

export interface InstalledPort extends PortRollFrame {
  readonly id: string;
  readonly hubId: string;
  readonly hubPosition: Vector3Tuple;
  readonly neighborId: string;
  readonly edgeId: string;
  readonly type: StrutType;
  readonly role: PortRole;
  readonly centerlineLength: number;
  readonly chordFactor: number;
  readonly templatePortIndex: number;
  readonly azimuthRadians: number;
  readonly azimuthDegrees: number;
}

export interface InstalledHub {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly valence: HubValence;
  readonly templateId: HubTemplateId;
  readonly orbitId: HubOrbitId;
  readonly handedness: 1 | -1;
  readonly outwardNormal: Vector3Tuple;
  readonly tangentX: Vector3Tuple;
  readonly tangentY: Vector3Tuple;
  readonly ports: readonly InstalledPort[];
}

export interface HubTemplatePort {
  readonly index: number;
  readonly type: StrutType;
  readonly role: PortRole;
  readonly azimuthRadians: number;
  readonly azimuthDegrees: number;
  readonly tangentSlopeRadians: number;
  readonly tangentSlopeDegrees: number;
  readonly includedAngleToNextRadians: number;
  readonly includedAngleToNextDegrees: number;
}

export interface HubTemplate {
  readonly id: HubTemplateId;
  readonly valence: HubValence;
  readonly ports: readonly HubTemplatePort[];
  readonly cyclicAzimuthGapsDegrees: readonly number[];
}

export interface HubOrbit {
  readonly id: HubOrbitId;
  readonly templateId: HubTemplateId;
  readonly valence: HubValence;
  readonly count: number;
  readonly hubIds: readonly string[];
}

export interface FabricationClass {
  readonly id: FabricationClassId;
  readonly type: StrutType;
  readonly firstHubValence: HubValence;
  readonly secondHubValence: HubValence;
  readonly count: number;
  readonly centerlineLength: number;
  readonly chordFactor: number;
  readonly edgeIds: readonly string[];
}

export interface FinishedMemberLengths {
  readonly shoulderLength: number;
  readonly blankLength: number;
}

export interface ResolvedFabricationClass extends FabricationClass, FinishedMemberLengths {
  readonly firstSetback: number;
  readonly secondSetback: number;
  readonly firstTenonProjection: number;
  readonly secondTenonProjection: number;
}

export interface TenonDimensions {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
}

export interface OrientedBox {
  readonly id: string;
  readonly center: Vector3Tuple;
  /** Longitudinal, width, and thickness axes. */
  readonly axes: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple];
  readonly halfExtents: readonly [number, number, number];
}

export interface ObbIntersection {
  readonly intersects: boolean;
  readonly testedAxisCount: number;
  /** Positive only when a separating axis exists. */
  readonly separation: number;
  /** Smallest tested-axis overlap when intersecting; zero otherwise. */
  readonly minimumOverlap: number;
  readonly separatingAxis?: Vector3Tuple;
}

export interface TenonPairCollision extends ObbIntersection {
  readonly firstPortId: string;
  readonly secondPortId: string;
}

export interface HubCollisionResult {
  readonly hubId: string;
  readonly valence: HubValence;
  readonly pairCount: number;
  readonly collisionCount: number;
  readonly allPairsCollide: boolean;
  readonly pairs: readonly TenonPairCollision[];
}

export interface CollisionValenceSummary {
  readonly valence: HubValence;
  readonly hubCount: number;
  readonly pairsPerHub: number;
  readonly collisionsPerHub: number;
  readonly totalPairCount: number;
  readonly totalCollisionCount: number;
  readonly allPairsCollide: boolean;
}

export interface TenonCollisionAudit {
  readonly apothem: number;
  readonly tenon: TenonDimensions;
  readonly orientation: TenonRollOrientation;
  readonly hubs: readonly HubCollisionResult[];
  readonly byValence: readonly CollisionValenceSummary[];
  readonly allPairsCollide: boolean;
}

export interface TangentSetbackClass {
  readonly type: StrutType;
  readonly apothem: number;
  readonly setback: number;
  readonly tipDistance: number;
}

export interface JoineryConfiguration {
  readonly apothem: number;
  readonly tenon: TenonDimensions;
}

export interface AxialJoineryConfiguration {
  readonly shoulderSetback: number;
  readonly tenon: TenonDimensions;
}

export interface AxialCollisionAudit {
  readonly shoulderSetback: number;
  readonly envelope: TenonDimensions;
  readonly hubs: readonly HubCollisionResult[];
  readonly byValence: readonly CollisionValenceSummary[];
  readonly pairCount: number;
  readonly collisionCount: number;
  readonly minimumSeparation: number;
  readonly allPairsClear: boolean;
}

export interface HubEnvelopeStudy {
  readonly faceDatum: "port-normal";
  readonly shoulderSetback: number;
  readonly radialThickness: number;
  readonly radialOutboard: number;
  readonly radialInboard: number;
  readonly radialSplit: number;
  readonly innerShellThickness: number;
  readonly outerShellThickness: number;
  readonly h4ClosureBelowDatum: number;
  readonly construction: string;
}

export interface CaptureHardwareStudy {
  readonly shellSplit: number;
  readonly crossKeyDepth: number;
  readonly crossKeyLength: number;
  readonly crossKeyDiameter: number;
  readonly crossKeyReliefLength: number;
  readonly crossKeyReliefSection: number;
  readonly clampSpindleSection: number;
  readonly clampBoreSection: number;
  readonly clampAxisLength: number;
  readonly clampCenterRadial: number;
}

export type RedesignHalfspaceKind =
  | "port-face"
  | "radial-outboard"
  | "radial-inboard"
  | "h4-bottom";

/** Hub-center-relative halfspace: normal dot localPoint <= offset. */
export interface RedesignHubHalfspace {
  readonly id: string;
  readonly kind: RedesignHalfspaceKind;
  readonly normal: Vector3Tuple;
  readonly offset: number;
  readonly portIndex?: number;
  readonly portId?: string;
}

export interface RedesignHubVertex {
  /** Hub-center-relative Cartesian position. */
  readonly position: Vector3Tuple;
  /** Every boundary plane containing this vertex within the solve tolerance. */
  readonly halfspaceIds: readonly string[];
}

export interface V2JoineryModel {
  readonly radius: number;
  readonly geometry: V2Hemisphere;
  readonly ports: readonly InstalledPort[];
  readonly installedHubs: readonly InstalledHub[];
  readonly hubTemplates: readonly HubTemplate[];
  readonly hubOrbits: readonly HubOrbit[];
  readonly fabricationClasses: readonly FabricationClass[];
  readonly tangentSetbacks: readonly TangentSetbackClass[];
  readonly collisionAudits: readonly TenonCollisionAudit[];
}

export const PROPOSED_JOINERY: JoineryConfiguration = Object.freeze({
  apothem: 1.5,
  tenon: Object.freeze({
    length: 1.5,
    width: 1.25,
    thickness: 0.5,
  }),
});

/**
 * Spatial-clearance redesign only. The dimensions below define a reproducible
 * solid-envelope study; they do not establish strength, retention, durability,
 * tolerances, or a fabrication release.
 */
export const REDESIGN_JOINERY_STUDY: AxialJoineryConfiguration = Object.freeze({
  shoulderSetback: 4,
  tenon: Object.freeze({
    length: 1.25,
    width: 0.75,
    thickness: 0.5,
  }),
});

/** Explicit alias used by consumers that distinguish this study from the tangent audit. */
export const PORT_NORMAL_REDESIGN_STUDY = REDESIGN_JOINERY_STUDY;

/** Slightly oversized digital pocket used to test clearance, not a fit spec. */
export const REDESIGN_POCKET_ENVELOPE: TenonDimensions = Object.freeze({
  length: 1.3,
  width: 0.78,
  thickness: 0.53,
});

/** Axis-aligned square enclosing the pocket at every possible roll angle. */
export const REDESIGN_CONTINUOUS_POCKET_ENVELOPE: TenonDimensions = Object.freeze({
  length: REDESIGN_POCKET_ENVELOPE.length,
  width: Math.hypot(REDESIGN_POCKET_ENVELOPE.width, REDESIGN_POCKET_ENVELOPE.thickness),
  thickness: Math.hypot(REDESIGN_POCKET_ENVELOPE.width, REDESIGN_POCKET_ENVELOPE.thickness),
});

export const REDESIGN_HUB_ENVELOPE: HubEnvelopeStudy = Object.freeze({
  faceDatum: "port-normal",
  shoulderSetback: REDESIGN_JOINERY_STUDY.shoulderSetback,
  radialThickness: 3,
  radialOutboard: 0.5,
  radialInboard: 2.5,
  radialSplit: -1,
  innerShellThickness: 1.5,
  outerShellThickness: 1.5,
  h4ClosureBelowDatum: 1.5,
  construction: "Two-shell hardwood capture-body study; stock build-up, closure, and adhesive unselected",
});

export const REDESIGN_CAPTURE_STUDY: CaptureHardwareStudy = Object.freeze({
  shellSplit: -1,
  crossKeyDepth: 0.625,
  crossKeyLength: 1.25,
  crossKeyDiameter: 0.25,
  crossKeyReliefLength: 1.28125,
  crossKeyReliefSection: 0.28125,
  clampSpindleSection: 1,
  clampBoreSection: 1.03125,
  clampAxisLength: 3,
  clampCenterRadial: -1,
});

const RADIANS_TO_DEGREES = 180 / Math.PI;
const FRAME_TOLERANCE = 1e-10;
const TEMPLATE_TOLERANCE_DEGREES = 1e-7;
const SAT_TOLERANCE = 1e-10;

const FABRICATION_CLASS_ORDER: readonly FabricationClassId[] = [
  "S-5-6",
  "S-4-5",
  "L-6-6",
  "L-4-6",
  "L-4-4",
];

const TEMPLATE_TOKENS: Readonly<Record<HubValence, readonly string[]>> = {
  4: ["base:L", "shell:S", "shell:L", "base:L"],
  5: ["shell:S", "shell:S", "shell:S", "shell:S", "shell:S"],
  6: ["shell:S", "shell:L", "shell:L", "shell:S", "shell:L", "shell:L"],
};

interface RawPort extends PortRollFrame {
  readonly id: string;
  readonly hubId: string;
  readonly hubPosition: Vector3Tuple;
  readonly neighborId: string;
  readonly edgeId: string;
  readonly type: StrutType;
  readonly role: PortRole;
  readonly centerlineLength: number;
  readonly chordFactor: number;
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: Vector3Tuple, scalar: number): Vector3Tuple {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(vector: Vector3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3Tuple, label: string): Vector3Tuple {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length <= FRAME_TOLERANCE) {
    throw new RangeError(`${label} must have non-zero finite length.`);
  }
  return scale(vector, 1 / length);
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function radiansToDegrees(radians: number): number {
  return radians * RADIANS_TO_DEGREES;
}

function positiveAngle(radians: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped = ((radians % fullTurn) + fullTurn) % fullTurn;
  return Math.abs(wrapped - fullTurn) <= FRAME_TOLERANCE || wrapped <= FRAME_TOLERANCE
    ? 0
    : wrapped;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number greater than or equal to zero.`);
  }
}

function assertVector(vector: Vector3Tuple, label: string): void {
  if (vector.length !== 3 || vector.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new RangeError(`${label} must contain three finite coordinates.`);
  }
}

function validateTenon(tenon: TenonDimensions): void {
  assertPositiveFinite(tenon.length, "Tenon length");
  assertPositiveFinite(tenon.width, "Tenon width");
  assertPositiveFinite(tenon.thickness, "Tenon thickness");
}

function portToken(port: Pick<RawPort, "role" | "type">): string {
  return `${port.role}:${port.type}`;
}

function stableTangentBasis(normal: Vector3Tuple): readonly [Vector3Tuple, Vector3Tuple] {
  const seeds: readonly Vector3Tuple[] = [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ];
  const seed = [...seeds].sort(
    (left, right) => Math.abs(dot(left, normal)) - Math.abs(dot(right, normal)),
  )[0];
  const tangentX = normalize(subtract(seed, scale(normal, dot(seed, normal))), "Tangent basis");
  const tangentY = normalize(cross(normal, tangentX), "Tangent basis");
  return [tangentX, tangentY];
}

function angleAroundNormal(
  direction: Vector3Tuple,
  tangentX: Vector3Tuple,
  tangentY: Vector3Tuple,
): number {
  return positiveAngle(Math.atan2(dot(direction, tangentY), dot(direction, tangentX)));
}

/**
 * Derives a deterministic port axis and natural rectangular-tenon roll frame.
 */
export function derivePortFrame(
  hubPosition: Vector3Tuple,
  neighborPosition: Vector3Tuple,
): PortRollFrame {
  assertVector(hubPosition, "Hub position");
  assertVector(neighborPosition, "Neighbor position");
  const outwardNormal = normalize(hubPosition, "Hub position");
  const axis = normalize(subtract(neighborPosition, hubPosition), "Port axis");
  const radialProjection = subtract(outwardNormal, scale(axis, dot(outwardNormal, axis)));
  const radialRollAxis = normalize(radialProjection, "Radial roll reference");
  const tangentialRollAxis = normalize(cross(axis, radialRollAxis), "Tangential roll reference");
  const tangentProjection = subtract(axis, scale(outwardNormal, dot(axis, outwardNormal)));
  const tangentDirection = normalize(tangentProjection, "Port tangent direction");
  const tangentSlopeRadians = Math.asin(clampUnit(-dot(axis, outwardNormal)));

  return {
    axis,
    outwardNormal,
    tangentDirection,
    radialRollAxis,
    tangentialRollAxis,
    tangentSlopeRadians,
    tangentSlopeDegrees: radiansToDegrees(tangentSlopeRadians),
  };
}

/**
 * Distance from a hub center to a side plane whose tangent-plane apothem is
 * `apothem`, measured along the installed port axis.
 */
export function tangentFaceSetback(
  apothem: number,
  axis: Vector3Tuple,
  outwardNormal: Vector3Tuple,
): number {
  assertPositiveFinite(apothem, "Hub apothem");
  assertVector(axis, "Port axis");
  assertVector(outwardNormal, "Outward normal");
  const unitAxis = normalize(axis, "Port axis");
  const unitNormal = normalize(outwardNormal, "Outward normal");
  const tangentMagnitude = magnitude(
    subtract(unitAxis, scale(unitNormal, dot(unitAxis, unitNormal))),
  );
  if (tangentMagnitude <= FRAME_TOLERANCE) {
    throw new RangeError("A radial port does not intersect a finite tangent side plane.");
  }
  return apothem / tangentMagnitude;
}

export function centerlineToShoulderLength(
  centerlineLength: number,
  firstSetback: number,
  secondSetback: number,
): number {
  assertPositiveFinite(centerlineLength, "Centerline length");
  assertNonNegativeFinite(firstSetback, "First hub setback");
  assertNonNegativeFinite(secondSetback, "Second hub setback");
  const shoulderLength = centerlineLength - firstSetback - secondSetback;
  if (shoulderLength <= 0) {
    throw new RangeError("Hub setbacks must leave a positive shoulder-to-shoulder length.");
  }
  return shoulderLength;
}

export function centerlineToBlankLength(
  centerlineLength: number,
  firstSetback: number,
  secondSetback: number,
  firstTenonProjection: number,
  secondTenonProjection: number,
): number {
  assertNonNegativeFinite(firstTenonProjection, "First tenon projection");
  assertNonNegativeFinite(secondTenonProjection, "Second tenon projection");
  return (
    centerlineToShoulderLength(centerlineLength, firstSetback, secondSetback) +
    firstTenonProjection +
    secondTenonProjection
  );
}

function rawPortsForGeometry(geometry: V2Hemisphere): Map<string, RawPort[]> {
  const verticesById = new Map(geometry.vertices.map((vertex) => [vertex.id, vertex]));
  const portsByHub = new Map<string, RawPort[]>(
    geometry.vertices.map((vertex) => [vertex.id, []]),
  );

  function installPort(edge: GeodesicEdge, hubId: string, neighborId: string): void {
    const hub = verticesById.get(hubId);
    const neighbor = verticesById.get(neighborId);
    if (!hub || !neighbor) throw new Error(`Edge ${edge.id} references an unknown vertex.`);
    const frame = derivePortFrame(hub.position, neighbor.position);
    const role: PortRole = hub.isBase && neighbor.isBase ? "base" : "shell";
    portsByHub.get(hubId)?.push({
      id: `${hubId}:${edge.id}`,
      hubId,
      hubPosition: hub.position,
      neighborId,
      edgeId: edge.id,
      type: edge.type,
      role,
      centerlineLength: edge.length,
      chordFactor: edge.chordFactor,
      ...frame,
    });
  }

  for (const edge of geometry.edges) {
    installPort(edge, edge.start, edge.end);
    installPort(edge, edge.end, edge.start);
  }
  return portsByHub;
}

function sequenceMatches(ports: readonly RawPort[], target: readonly string[]): boolean {
  return ports.length === target.length && ports.every((port, index) => portToken(port) === target[index]);
}

function orderedTemplatePorts(
  ports: readonly RawPort[],
  normal: Vector3Tuple,
  valence: HubValence,
): { ordered: RawPort[]; handedness: 1 | -1; tangentX: Vector3Tuple; tangentY: Vector3Tuple } {
  const [referenceX, referenceY] = stableTangentBasis(normal);
  const circular = [...ports].sort(
    (left, right) =>
      angleAroundNormal(left.tangentDirection, referenceX, referenceY) -
        angleAroundNormal(right.tangentDirection, referenceX, referenceY) ||
      left.edgeId.localeCompare(right.edgeId),
  );
  const target = TEMPLATE_TOKENS[valence];
  const candidates: Array<{ ordered: RawPort[]; handedness: 1 | -1 }> = [];

  for (const handedness of [1, -1] as const) {
    for (let start = 0; start < circular.length; start += 1) {
      const ordered = Array.from(
        { length: circular.length },
        (_, offset) => circular[(start + handedness * offset + circular.length * 2) % circular.length],
      );
      if (sequenceMatches(ordered, target)) candidates.push({ ordered, handedness });
    }
  }
  if (candidates.length === 0) {
    throw new Error(`Hub ${ports[0]?.hubId ?? "unknown"} does not match the V2 H${valence} template.`);
  }
  candidates.sort((left, right) => {
    const leftKey = left.ordered.map(({ edgeId }) => edgeId).join(":");
    const rightKey = right.ordered.map(({ edgeId }) => edgeId).join(":");
    return leftKey.localeCompare(rightKey) || right.handedness - left.handedness;
  });

  const chosen = candidates[0];
  const tangentX = chosen.ordered[0].tangentDirection;
  const positiveY = normalize(cross(normal, tangentX), "Installed hub tangent frame");
  const tangentY = chosen.handedness === 1 ? positiveY : scale(positiveY, -1);
  return { ...chosen, tangentX, tangentY };
}

function installHubs(geometry: V2Hemisphere): InstalledHub[] {
  const rawByHub = rawPortsForGeometry(geometry);
  return geometry.vertices.map((vertex) => {
    const rawPorts = rawByHub.get(vertex.id) ?? [];
    if (rawPorts.length !== vertex.valence) {
      throw new Error(`Hub ${vertex.id} has ${rawPorts.length} ports but valence ${vertex.valence}.`);
    }
    const outwardNormal = normalize(vertex.position, `Hub ${vertex.id} position`);
    const ordered = orderedTemplatePorts(rawPorts, outwardNormal, vertex.valence);
    const ports: InstalledPort[] = ordered.ordered.map((port, templatePortIndex) => {
      const azimuthRadians = angleAroundNormal(
        port.tangentDirection,
        ordered.tangentX,
        ordered.tangentY,
      );
      return {
        ...port,
        templatePortIndex,
        azimuthRadians,
        azimuthDegrees: radiansToDegrees(azimuthRadians),
      };
    });
    return {
      id: vertex.id,
      position: vertex.position,
      valence: vertex.valence,
      templateId: `H${vertex.valence}` as HubTemplateId,
      orbitId: `O${vertex.valence}` as HubOrbitId,
      handedness: ordered.handedness,
      outwardNormal,
      tangentX: ordered.tangentX,
      tangentY: ordered.tangentY,
      ports,
    };
  });
}

function angleBetween(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.acos(clampUnit(dot(a, b)));
}

function buildHubTemplates(installedHubs: readonly InstalledHub[]): HubTemplate[] {
  return ([4, 5, 6] as const).map((valence) => {
    const hubs = installedHubs.filter((hub) => hub.valence === valence);
    const representative = hubs[0];
    if (!representative) throw new Error(`No installed H${valence} hub was found.`);
    const ports: HubTemplatePort[] = representative.ports.map((port, index) => {
      const next = representative.ports[(index + 1) % representative.ports.length];
      const includedAngleToNextRadians = angleBetween(port.axis, next.axis);
      return {
        index,
        type: port.type,
        role: port.role,
        azimuthRadians: port.azimuthRadians,
        azimuthDegrees: port.azimuthDegrees,
        tangentSlopeRadians: port.tangentSlopeRadians,
        tangentSlopeDegrees: port.tangentSlopeDegrees,
        includedAngleToNextRadians,
        includedAngleToNextDegrees: radiansToDegrees(includedAngleToNextRadians),
      };
    });
    const cyclicAzimuthGapsDegrees = ports.map((port, index) => {
      const next = ports[(index + 1) % ports.length];
      const gap = positiveAngle(next.azimuthRadians - port.azimuthRadians);
      return radiansToDegrees(gap);
    });

    for (const hub of hubs.slice(1)) {
      if (hub.ports.length !== ports.length) throw new Error(`Hub ${hub.id} does not match H${valence}.`);
      hub.ports.forEach((port, index) => {
        const template = ports[index];
        if (
          port.type !== template.type ||
          port.role !== template.role ||
          Math.abs(port.azimuthDegrees - template.azimuthDegrees) > TEMPLATE_TOLERANCE_DEGREES ||
          Math.abs(port.tangentSlopeDegrees - template.tangentSlopeDegrees) >
            TEMPLATE_TOLERANCE_DEGREES
        ) {
          throw new Error(`Installed hub ${hub.id} is not congruent with H${valence}.`);
        }
      });
    }
    return { id: `H${valence}` as HubTemplateId, valence, ports, cyclicAzimuthGapsDegrees };
  });
}

function buildHubOrbits(installedHubs: readonly InstalledHub[]): HubOrbit[] {
  return ([4, 5, 6] as const).map((valence) => {
    const hubIds = installedHubs.filter((hub) => hub.valence === valence).map(({ id }) => id);
    return {
      id: `O${valence}` as HubOrbitId,
      templateId: `H${valence}` as HubTemplateId,
      valence,
      count: hubIds.length,
      hubIds,
    };
  });
}

function fabricationClassId(edge: GeodesicEdge, first: HubValence, second: HubValence): FabricationClassId {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return `${edge.type}-${low}-${high}` as FabricationClassId;
}

function buildFabricationClasses(geometry: V2Hemisphere): FabricationClass[] {
  const valenceById = new Map(geometry.vertices.map((vertex) => [vertex.id, vertex.valence]));
  const groups = new Map<FabricationClassId, GeodesicEdge[]>();
  for (const edge of geometry.edges) {
    const startValence = valenceById.get(edge.start);
    const endValence = valenceById.get(edge.end);
    if (!startValence || !endValence) throw new Error(`Edge ${edge.id} has an unknown endpoint.`);
    const id = fabricationClassId(edge, startValence, endValence);
    const members = groups.get(id) ?? [];
    members.push(edge);
    groups.set(id, members);
  }

  const actualIds = [...groups.keys()].sort();
  const expectedIds = [...FABRICATION_CLASS_ORDER].sort();
  if (actualIds.join(",") !== expectedIds.join(",")) {
    throw new Error(`Unexpected V2 fabrication classes: ${actualIds.join(", ")}.`);
  }

  return FABRICATION_CLASS_ORDER.map((id) => {
    const edges = groups.get(id);
    if (!edges?.length) throw new Error(`Missing fabrication class ${id}.`);
    const [, firstText, secondText] = id.split("-");
    const firstHubValence = Number(firstText) as HubValence;
    const secondHubValence = Number(secondText) as HubValence;
    const centerlineLength = edges[0].length;
    if (edges.some((edge) => Math.abs(edge.length - centerlineLength) > FRAME_TOLERANCE)) {
      throw new Error(`Fabrication class ${id} contains inconsistent centerline lengths.`);
    }
    return {
      id,
      type: id[0] as StrutType,
      firstHubValence,
      secondHubValence,
      count: edges.length,
      centerlineLength,
      chordFactor: edges[0].chordFactor,
      edgeIds: edges.map(({ id: edgeId }) => edgeId),
    };
  });
}

export function resolveFabricationClasses(
  classes: readonly FabricationClass[],
  setbacks: Readonly<Record<HubValence, number>>,
  tenonProjections: Readonly<Record<HubValence, number>>,
): ResolvedFabricationClass[] {
  for (const valence of [4, 5, 6] as const) {
    assertNonNegativeFinite(setbacks[valence], `${valence}-way setback`);
    assertNonNegativeFinite(tenonProjections[valence], `${valence}-way tenon projection`);
  }
  return classes.map((memberClass) => {
    const firstSetback = setbacks[memberClass.firstHubValence];
    const secondSetback = setbacks[memberClass.secondHubValence];
    const firstTenonProjection = tenonProjections[memberClass.firstHubValence];
    const secondTenonProjection = tenonProjections[memberClass.secondHubValence];
    return {
      ...memberClass,
      firstSetback,
      secondSetback,
      firstTenonProjection,
      secondTenonProjection,
      shoulderLength: centerlineToShoulderLength(
        memberClass.centerlineLength,
        firstSetback,
        secondSetback,
      ),
      blankLength: centerlineToBlankLength(
        memberClass.centerlineLength,
        firstSetback,
        secondSetback,
        firstTenonProjection,
        secondTenonProjection,
      ),
    };
  });
}

export function makeTenonObb(
  port: InstalledPort,
  apothem: number,
  tenon: TenonDimensions,
  orientation: TenonRollOrientation,
): OrientedBox {
  assertPositiveFinite(apothem, "Hub apothem");
  validateTenon(tenon);
  if (orientation !== "width-tangential" && orientation !== "width-radial") {
    throw new RangeError(`Unknown tenon roll orientation: ${String(orientation)}.`);
  }
  const rollRadians = orientation === "width-tangential" ? 0 : Math.PI / 2;
  return makeTenonObbAtRoll(port, apothem, tenon, rollRadians, orientation);
}

/**
 * Port-normal tenon or pocket. The shoulder plane is perpendicular to the
 * member axis at one common axial setback, and the wide axis is fixed to the
 * installed radial roll datum.
 */
export function makeAxialTenonObb(
  port: InstalledPort,
  shoulderSetback: number,
  dimensions: TenonDimensions,
  idSuffix = "axial-tenon",
): OrientedBox {
  return makeAxialTenonObbAtRoll(
    port,
    shoulderSetback,
    dimensions,
    Math.PI / 2,
    idSuffix,
  );
}

/** Port-normal tenon or pocket at an explicit roll used by robustness audits. */
export function makeAxialTenonObbAtRoll(
  port: InstalledPort,
  shoulderSetback: number,
  dimensions: TenonDimensions,
  rollRadians: number,
  idSuffix = "axial-tenon-roll",
): OrientedBox {
  assertPositiveFinite(shoulderSetback, "Shoulder setback");
  validateTenon(dimensions);
  if (dimensions.length >= shoulderSetback) {
    throw new RangeError("Axial tenon length must be less than the shoulder setback.");
  }
  if (!Number.isFinite(rollRadians)) throw new RangeError("Axial tenon roll must be finite.");
  const cosine = Math.cos(rollRadians);
  const sine = Math.sin(rollRadians);
  const widthAxis = normalize(add(
    scale(port.tangentialRollAxis, cosine),
    scale(port.radialRollAxis, sine),
  ), "Axial tenon width roll axis");
  const thicknessAxis = normalize(add(
    scale(port.radialRollAxis, cosine),
    scale(port.tangentialRollAxis, -sine),
  ), "Axial tenon thickness roll axis");
  return {
    id: `${port.id}:${idSuffix}`,
    center: add(
      port.hubPosition,
      scale(port.axis, shoulderSetback - dimensions.length / 2),
    ),
    axes: [port.axis, widthAxis, thicknessAxis],
    halfExtents: [dimensions.length / 2, dimensions.width / 2, dimensions.thickness / 2],
  };
}

/** Creates a tenon/pocket box at any roll angle about the member axis. */
export function makeTenonObbAtRoll(
  port: InstalledPort,
  apothem: number,
  tenon: TenonDimensions,
  rollRadians: number,
  idSuffix = "continuous-roll",
): OrientedBox {
  assertPositiveFinite(apothem, "Hub apothem");
  validateTenon(tenon);
  if (!Number.isFinite(rollRadians)) throw new RangeError("Tenon roll must be finite.");
  const setback = tangentFaceSetback(apothem, port.axis, port.outwardNormal);
  const center = add(port.hubPosition, scale(port.axis, setback - tenon.length / 2));
  const cosine = Math.cos(rollRadians);
  const sine = Math.sin(rollRadians);
  const widthAxis = normalize(add(
    scale(port.tangentialRollAxis, cosine),
    scale(port.radialRollAxis, sine),
  ), "Tenon width roll axis");
  const thicknessAxis = normalize(add(
    scale(port.radialRollAxis, cosine),
    scale(port.tangentialRollAxis, -sine),
  ), "Tenon thickness roll axis");
  return {
    id: `${port.id}:${idSuffix}`,
    center,
    axes: [port.axis, widthAxis, thicknessAxis],
    halfExtents: [tenon.length / 2, tenon.width / 2, tenon.thickness / 2],
  };
}

/** Full-section member envelope beginning at the tangent face and extending outward. */
export function makeMemberEnvelopeObb(
  port: InstalledPort,
  apothem: number,
  length: number,
  section: number,
  rollRadians = 0,
): OrientedBox {
  assertPositiveFinite(apothem, "Hub apothem");
  assertPositiveFinite(length, "Member envelope length");
  assertPositiveFinite(section, "Member envelope section");
  if (!Number.isFinite(rollRadians)) throw new RangeError("Member roll must be finite.");
  const setback = tangentFaceSetback(apothem, port.axis, port.outwardNormal);
  const cosine = Math.cos(rollRadians);
  const sine = Math.sin(rollRadians);
  const widthAxis = normalize(add(
    scale(port.tangentialRollAxis, cosine),
    scale(port.radialRollAxis, sine),
  ), "Member width roll axis");
  const thicknessAxis = normalize(add(
    scale(port.radialRollAxis, cosine),
    scale(port.tangentialRollAxis, -sine),
  ), "Member thickness roll axis");
  return {
    id: `${port.id}:member-envelope`,
    center: add(port.hubPosition, scale(port.axis, setback + length / 2)),
    axes: [port.axis, widthAxis, thicknessAxis],
    halfExtents: [length / 2, section / 2, section / 2],
  };
}

/** Full-section member envelope beginning at a port-normal shoulder. */
export function makeAxialMemberEnvelopeObb(
  port: InstalledPort,
  shoulderSetback: number,
  length: number,
  section: number,
  idSuffix = "axial-member-envelope",
): OrientedBox {
  return makeAxialMemberEnvelopeObbAtRoll(
    port,
    shoulderSetback,
    length,
    section,
    Math.PI / 2,
    idSuffix,
  );
}

/** Full-section port-normal member envelope at an explicit roll. */
export function makeAxialMemberEnvelopeObbAtRoll(
  port: InstalledPort,
  shoulderSetback: number,
  length: number,
  section: number,
  rollRadians: number,
  idSuffix = "axial-member-envelope-roll",
): OrientedBox {
  assertPositiveFinite(shoulderSetback, "Shoulder setback");
  assertPositiveFinite(length, "Member envelope length");
  assertPositiveFinite(section, "Member envelope section");
  if (!Number.isFinite(rollRadians)) throw new RangeError("Axial member roll must be finite.");
  const cosine = Math.cos(rollRadians);
  const sine = Math.sin(rollRadians);
  const widthAxis = normalize(add(
    scale(port.tangentialRollAxis, cosine),
    scale(port.radialRollAxis, sine),
  ), "Axial member width roll axis");
  const thicknessAxis = normalize(add(
    scale(port.radialRollAxis, cosine),
    scale(port.tangentialRollAxis, -sine),
  ), "Axial member thickness roll axis");
  return {
    id: `${port.id}:${idSuffix}`,
    center: add(port.hubPosition, scale(port.axis, shoulderSetback + length / 2)),
    axes: [port.axis, widthAxis, thicknessAxis],
    halfExtents: [length / 2, section / 2, section / 2],
  };
}

/** Conservative box around a captured radial key or its oversized relief. */
export function makeAxialCrossKeyObb(
  port: InstalledPort,
  shoulderSetback: number,
  axialDepth: number,
  length: number,
  section: number,
  idSuffix = "axial-cross-key",
): OrientedBox {
  assertPositiveFinite(shoulderSetback, "Shoulder setback");
  assertPositiveFinite(axialDepth, "Cross-key axial depth");
  assertPositiveFinite(length, "Cross-key length");
  assertPositiveFinite(section, "Cross-key section");
  if (axialDepth >= shoulderSetback) {
    throw new RangeError("Cross-key axial depth must be less than the shoulder setback.");
  }
  return {
    id: `${port.id}:${idSuffix}`,
    center: add(port.hubPosition, scale(port.axis, shoulderSetback - axialDepth)),
    axes: [port.radialRollAxis, port.axis, port.tangentialRollAxis],
    halfExtents: [length / 2, section / 2, section / 2],
  };
}

/** Conservative box around the proposed cylindrical radial cross-key. */
export function makeCrossKeyObb(
  port: InstalledPort,
  shoulderSetback: number,
  relief = false,
): OrientedBox {
  const length = relief
    ? REDESIGN_CAPTURE_STUDY.crossKeyReliefLength
    : REDESIGN_CAPTURE_STUDY.crossKeyLength;
  const section = relief
    ? REDESIGN_CAPTURE_STUDY.crossKeyReliefSection
    : REDESIGN_CAPTURE_STUDY.crossKeyDiameter;
  return makeAxialCrossKeyObb(
    port,
    shoulderSetback,
    REDESIGN_CAPTURE_STUDY.crossKeyDepth,
    length,
    section,
    relief ? "cross-key-relief" : "cross-key",
  );
}

/** Conservative square spindle or bore along the hub radial axis. */
export function makeAxialCentralClampObb(
  hub: InstalledHub,
  radialMinimum: number,
  radialMaximum: number,
  section: number,
  idSuffix = "axial-central-clamp",
): OrientedBox {
  if (!Number.isFinite(radialMinimum) || !Number.isFinite(radialMaximum)) {
    throw new RangeError("Clamp radial limits must be finite.");
  }
  if (radialMinimum >= radialMaximum) {
    throw new RangeError("Clamp radial minimum must be less than its maximum.");
  }
  assertPositiveFinite(section, "Clamp section");
  return {
    id: `${hub.id}:${idSuffix}`,
    center: add(hub.position, scale(hub.outwardNormal, (radialMinimum + radialMaximum) / 2)),
    axes: [hub.outwardNormal, hub.tangentX, hub.tangentY],
    halfExtents: [(radialMaximum - radialMinimum) / 2, section / 2, section / 2],
  };
}

/** Backwards-compatible configured spindle/bore constructor for the redesign study. */
export function makeClampSpindleObb(
  hub: InstalledHub,
  bore = false,
): OrientedBox {
  const section = bore
    ? REDESIGN_CAPTURE_STUDY.clampBoreSection
    : REDESIGN_CAPTURE_STUDY.clampSpindleSection;
  return makeAxialCentralClampObb(
    hub,
    -REDESIGN_HUB_ENVELOPE.radialInboard,
    REDESIGN_HUB_ENVELOPE.radialOutboard,
    section,
    bore ? "clamp-bore" : "clamp-spindle",
  );
}

/** Exact port-normal body planes, expressed relative to the hub center. */
export function buildRedesignHubHalfspaces(
  hub: InstalledHub,
  envelope: HubEnvelopeStudy = REDESIGN_HUB_ENVELOPE,
  shoulderSetback = envelope.shoulderSetback,
): RedesignHubHalfspace[] {
  assertPositiveFinite(shoulderSetback, "Shoulder setback");
  assertPositiveFinite(envelope.radialInboard, "Hub radial inboard extent");
  assertPositiveFinite(envelope.radialOutboard, "Hub radial outboard extent");
  assertPositiveFinite(envelope.h4ClosureBelowDatum, "H4 bottom offset");
  if (
    Math.abs(
      envelope.radialThickness - (envelope.radialInboard + envelope.radialOutboard),
    ) > FRAME_TOLERANCE
  ) {
    throw new RangeError("Hub radial thickness must equal its inboard plus outboard extents.");
  }

  const halfspaces: RedesignHubHalfspace[] = hub.ports.map((port, portIndex) => ({
    id: `${hub.id}:port-${portIndex + 1}`,
    kind: "port-face",
    normal: port.axis,
    offset: shoulderSetback,
    portIndex,
    portId: port.id,
  }));
  halfspaces.push(
    {
      id: `${hub.id}:radial-outboard`,
      kind: "radial-outboard",
      normal: hub.outwardNormal,
      offset: envelope.radialOutboard,
    },
    {
      id: `${hub.id}:radial-inboard`,
      kind: "radial-inboard",
      normal: scale(hub.outwardNormal, -1),
      offset: envelope.radialInboard,
    },
  );
  if (hub.valence === 4) {
    halfspaces.push({
      id: `${hub.id}:h4-bottom`,
      kind: "h4-bottom",
      normal: [0, -1, 0],
      offset: envelope.h4ClosureBelowDatum,
    });
  }
  return halfspaces;
}

function solveHalfspaceTriple(
  first: RedesignHubHalfspace,
  second: RedesignHubHalfspace,
  third: RedesignHubHalfspace,
): Vector3Tuple | undefined {
  const secondCrossThird = cross(second.normal, third.normal);
  const determinant = dot(first.normal, secondCrossThird);
  if (Math.abs(determinant) <= FRAME_TOLERANCE) return undefined;
  const numerator = add(
    add(
      scale(secondCrossThird, first.offset),
      scale(cross(third.normal, first.normal), second.offset),
    ),
    scale(cross(first.normal, second.normal), third.offset),
  );
  return scale(numerator, 1 / determinant);
}

/** Enumerates the unique vertices of a bounded convex halfspace intersection. */
export function intersectHalfspaceTriples(
  halfspaces: readonly RedesignHubHalfspace[],
  tolerance = 1e-9,
): RedesignHubVertex[] {
  if (halfspaces.length < 4) {
    throw new RangeError("At least four halfspaces are required to enclose a hub body.");
  }
  assertPositiveFinite(tolerance, "Halfspace solve tolerance");
  for (const halfspace of halfspaces) {
    assertVector(halfspace.normal, `${halfspace.id} normal`);
    if (Math.abs(magnitude(halfspace.normal) - 1) > FRAME_TOLERANCE) {
      throw new RangeError(`${halfspace.id} normal must be unit length.`);
    }
    if (!Number.isFinite(halfspace.offset)) {
      throw new RangeError(`${halfspace.id} offset must be finite.`);
    }
  }

  const positions: Vector3Tuple[] = [];
  for (let first = 0; first < halfspaces.length; first += 1) {
    for (let second = first + 1; second < halfspaces.length; second += 1) {
      for (let third = second + 1; third < halfspaces.length; third += 1) {
        const point = solveHalfspaceTriple(
          halfspaces[first],
          halfspaces[second],
          halfspaces[third],
        );
        if (!point) continue;
        if (
          halfspaces.some(
            (halfspace) => dot(halfspace.normal, point) - halfspace.offset > tolerance,
          )
        ) {
          continue;
        }
        if (
          positions.some(
            (existing) => magnitude(subtract(existing, point)) <= tolerance * 10,
          )
        ) {
          continue;
        }
        positions.push(point);
      }
    }
  }

  if (positions.length === 0) {
    throw new Error("Halfspaces do not produce a bounded hub body with enumerable vertices.");
  }
  return positions
    .sort(
      (left, right) =>
        left[0] - right[0] || left[1] - right[1] || left[2] - right[2],
    )
    .map((position) => ({
      position,
      halfspaceIds: halfspaces
        .filter(
          (halfspace) =>
            Math.abs(dot(halfspace.normal, position) - halfspace.offset) <= tolerance * 10,
        )
        .map(({ id }) => id),
    }));
}

export function buildRedesignHubVertices(
  hub: InstalledHub,
  envelope: HubEnvelopeStudy = REDESIGN_HUB_ENVELOPE,
  shoulderSetback = envelope.shoulderSetback,
): RedesignHubVertex[] {
  return intersectHalfspaceTriples(
    buildRedesignHubHalfspaces(hub, envelope, shoulderSetback),
  );
}

/** Projection interval relative to an origin, used for slab containment audits. */
export function orientedBoxProjectionInterval(
  box: OrientedBox,
  axis: Vector3Tuple,
  origin: Vector3Tuple = [0, 0, 0],
): readonly [number, number] {
  validateObb(box);
  assertVector(axis, "Projection axis");
  assertVector(origin, "Projection origin");
  const unitAxis = normalize(axis, "Projection axis");
  const centerProjection = dot(subtract(box.center, origin), unitAxis);
  const radius = projectionRadius(box, unitAxis);
  return [centerProjection - radius, centerProjection + radius];
}

function validateObb(box: OrientedBox): void {
  assertVector(box.center, `${box.id} center`);
  box.halfExtents.forEach((extent, index) => assertPositiveFinite(extent, `${box.id} extent ${index}`));
  box.axes.forEach((axis, index) => {
    const unit = normalize(axis, `${box.id} axis ${index}`);
    if (magnitude(subtract(unit, axis)) > FRAME_TOLERANCE) {
      throw new RangeError(`${box.id} axis ${index} must be unit length.`);
    }
  });
  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 3; second += 1) {
      if (Math.abs(dot(box.axes[first], box.axes[second])) > FRAME_TOLERANCE) {
        throw new RangeError(`${box.id} axes must be orthogonal.`);
      }
    }
  }
}

function projectionRadius(box: OrientedBox, axis: Vector3Tuple): number {
  return box.axes.reduce(
    (radius, boxAxis, index) => radius + box.halfExtents[index] * Math.abs(dot(boxAxis, axis)),
    0,
  );
}

/** Exact 15-axis separating-axis test for two rectangular oriented boxes. */
export function intersectOrientedBoxes(first: OrientedBox, second: OrientedBox): ObbIntersection {
  validateObb(first);
  validateObb(second);
  const candidates: Vector3Tuple[] = [...first.axes, ...second.axes];
  for (const firstAxis of first.axes) {
    for (const secondAxis of second.axes) {
      const candidate = cross(firstAxis, secondAxis);
      if (magnitude(candidate) > FRAME_TOLERANCE) {
        candidates.push(normalize(candidate, "OBB separating axis"));
      }
    }
  }

  const centerDelta = subtract(second.center, first.center);
  let minimumOverlap = Number.POSITIVE_INFINITY;
  let greatestSeparation = 0;
  let separatingAxis: Vector3Tuple | undefined;

  for (const candidate of candidates) {
    const axis = normalize(candidate, "OBB separating axis");
    const centerDistance = Math.abs(dot(centerDelta, axis));
    const overlap = projectionRadius(first, axis) + projectionRadius(second, axis) - centerDistance;
    if (overlap < -SAT_TOLERANCE && -overlap > greatestSeparation) {
      greatestSeparation = -overlap;
      separatingAxis = axis;
    }
    minimumOverlap = Math.min(minimumOverlap, overlap);
  }

  if (separatingAxis) {
    return {
      intersects: false,
      testedAxisCount: candidates.length,
      separation: greatestSeparation,
      minimumOverlap: 0,
      separatingAxis,
    };
  }
  return {
    intersects: true,
    testedAxisCount: candidates.length,
    separation: 0,
    minimumOverlap: Math.max(0, minimumOverlap),
  };
}

export function auditTenonCollisions(
  installedHubs: readonly InstalledHub[],
  apothem: number,
  tenon: TenonDimensions,
  orientation: TenonRollOrientation,
): TenonCollisionAudit {
  assertPositiveFinite(apothem, "Hub apothem");
  validateTenon(tenon);
  if (installedHubs.length === 0) throw new RangeError("At least one installed hub is required.");
  const hubs: HubCollisionResult[] = installedHubs.map((hub) => {
    const boxes = hub.ports.map((port) => makeTenonObb(port, apothem, tenon, orientation));
    const pairs: TenonPairCollision[] = [];
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        pairs.push({
          firstPortId: hub.ports[first].id,
          secondPortId: hub.ports[second].id,
          ...intersectOrientedBoxes(boxes[first], boxes[second]),
        });
      }
    }
    const collisionCount = pairs.filter(({ intersects }) => intersects).length;
    return {
      hubId: hub.id,
      valence: hub.valence,
      pairCount: pairs.length,
      collisionCount,
      allPairsCollide: collisionCount === pairs.length,
      pairs,
    };
  });

  const byValence: CollisionValenceSummary[] = ([4, 5, 6] as const)
    .filter((valence) => hubs.some((hub) => hub.valence === valence))
    .map((valence) => {
    const classHubs = hubs.filter((hub) => hub.valence === valence);
    const pairCounts = new Set(classHubs.map(({ pairCount }) => pairCount));
    const collisionCounts = new Set(classHubs.map(({ collisionCount }) => collisionCount));
    if (pairCounts.size !== 1 || collisionCounts.size !== 1) {
      throw new Error(`Installed H${valence} collision results are not orbit-congruent.`);
    }
    const pairsPerHub = classHubs[0]?.pairCount ?? 0;
    const collisionsPerHub = classHubs[0]?.collisionCount ?? 0;
    return {
      valence,
      hubCount: classHubs.length,
      pairsPerHub,
      collisionsPerHub,
      totalPairCount: classHubs.reduce((total, hub) => total + hub.pairCount, 0),
      totalCollisionCount: classHubs.reduce((total, hub) => total + hub.collisionCount, 0),
      allPairsCollide: classHubs.every(({ allPairsCollide }) => allPairsCollide),
    };
    });
  return {
    apothem,
    tenon: { ...tenon },
    orientation,
    hubs,
    byValence,
    allPairsCollide: hubs.every(({ allPairsCollide }) => allPairsCollide),
  };
}

/** Exact fixed-roll collision audit for port-normal tenon or pocket envelopes. */
export function auditAxialTenonCollisions(
  installedHubs: readonly InstalledHub[],
  shoulderSetback: number,
  envelope: TenonDimensions,
): AxialCollisionAudit {
  assertPositiveFinite(shoulderSetback, "Shoulder setback");
  validateTenon(envelope);
  if (envelope.length >= shoulderSetback) {
    throw new RangeError("Axial envelope length must be less than the shoulder setback.");
  }
  if (installedHubs.length === 0) throw new RangeError("At least one installed hub is required.");

  const hubs: HubCollisionResult[] = installedHubs.map((hub) => {
    const boxes = hub.ports.map((port) =>
      makeAxialTenonObb(port, shoulderSetback, envelope, "axial-collision-audit"));
    const pairs: TenonPairCollision[] = [];
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        pairs.push({
          firstPortId: hub.ports[first].id,
          secondPortId: hub.ports[second].id,
          ...intersectOrientedBoxes(boxes[first], boxes[second]),
        });
      }
    }
    const collisionCount = pairs.filter(({ intersects }) => intersects).length;
    return {
      hubId: hub.id,
      valence: hub.valence,
      pairCount: pairs.length,
      collisionCount,
      allPairsCollide: collisionCount === pairs.length,
      pairs,
    };
  });

  const byValence: CollisionValenceSummary[] = ([4, 5, 6] as const)
    .filter((valence) => hubs.some((hub) => hub.valence === valence))
    .map((valence) => {
      const classHubs = hubs.filter((hub) => hub.valence === valence);
      const pairCounts = new Set(classHubs.map(({ pairCount }) => pairCount));
      const collisionCounts = new Set(classHubs.map(({ collisionCount }) => collisionCount));
      if (pairCounts.size !== 1 || collisionCounts.size !== 1) {
        throw new Error(`Installed axial H${valence} results are not orbit-congruent.`);
      }
      const pairsPerHub = classHubs[0]?.pairCount ?? 0;
      const collisionsPerHub = classHubs[0]?.collisionCount ?? 0;
      return {
        valence,
        hubCount: classHubs.length,
        pairsPerHub,
        collisionsPerHub,
        totalPairCount: classHubs.reduce((total, hub) => total + hub.pairCount, 0),
        totalCollisionCount: classHubs.reduce((total, hub) => total + hub.collisionCount, 0),
        allPairsCollide: classHubs.every(({ allPairsCollide }) => allPairsCollide),
      };
    });
  const pairs = hubs.flatMap(({ pairs: hubPairs }) => hubPairs);
  const collisionCount = pairs.filter(({ intersects }) => intersects).length;
  const clearSeparations = pairs
    .filter(({ intersects }) => !intersects)
    .map(({ separation }) => separation);
  return {
    shoulderSetback,
    envelope: { ...envelope },
    hubs,
    byValence,
    pairCount: pairs.length,
    collisionCount,
    minimumSeparation:
      clearSeparations.length > 0 ? Math.min(...clearSeparations) : 0,
    allPairsClear: collisionCount === 0,
  };
}

function deriveTangentSetbacks(
  ports: readonly InstalledPort[],
  apothem: number,
  tenonLength: number,
): TangentSetbackClass[] {
  return (["S", "L"] as const).map((type) => {
    const members = ports.filter((port) => port.type === type);
    if (members.length === 0) throw new Error(`No ${type} ports were found.`);
    const setbacks = members.map((port) => tangentFaceSetback(apothem, port.axis, port.outwardNormal));
    const setback = setbacks[0];
    if (setbacks.some((value) => Math.abs(value - setback) > FRAME_TOLERANCE)) {
      throw new Error(`${type} ports do not share one tangent-face setback.`);
    }
    return { type, apothem, setback, tipDistance: setback - tenonLength };
  });
}

export function deriveV2Joinery(
  geometry: V2Hemisphere,
  configuration: JoineryConfiguration = PROPOSED_JOINERY,
): V2JoineryModel {
  if (geometry.frequency !== 2) throw new RangeError("Joinery derivation requires frequency 2 geometry.");
  assertPositiveFinite(geometry.radius, "Dome radius");
  assertPositiveFinite(configuration.apothem, "Hub apothem");
  validateTenon(configuration.tenon);
  const installedHubs = installHubs(geometry);
  const ports = installedHubs.flatMap((hub) => hub.ports);
  const hubTemplates = buildHubTemplates(installedHubs);
  const hubOrbits = buildHubOrbits(installedHubs);
  const fabricationClasses = buildFabricationClasses(geometry);
  const tangentSetbacks = deriveTangentSetbacks(
    ports,
    configuration.apothem,
    configuration.tenon.length,
  );
  const collisionAudits = (["width-tangential", "width-radial"] as const).map((orientation) =>
    auditTenonCollisions(installedHubs, configuration.apothem, configuration.tenon, orientation),
  );
  return {
    radius: geometry.radius,
    geometry,
    ports,
    installedHubs,
    hubTemplates,
    hubOrbits,
    fabricationClasses,
    tangentSetbacks,
    collisionAudits,
  };
}

export function buildV2Joinery(
  radius: number,
  configuration: JoineryConfiguration = PROPOSED_JOINERY,
): V2JoineryModel {
  assertPositiveFinite(radius, "Dome radius");
  return deriveV2Joinery(buildV2Hemisphere(radius), configuration);
}
