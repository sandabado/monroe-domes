/**
 * Deterministic geometry for a class-I, frequency-2 icosahedral hemisphere.
 *
 * Coordinate system: +Y is up, and the base lies in the XZ plane. The source
 * icosahedron is oriented with a five-fold vertex at the apex. Every
 * subdivision vertex is projected back to the requested sphere radius before
 * the mesh is cut at the equator.
 */

export type Vector3Tuple = readonly [x: number, y: number, z: number];
export type StrutType = "S" | "L";
export type HubValence = 4 | 5 | 6;

export interface GeodesicVertex {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly valence: HubValence;
  readonly isBase: boolean;
}

export interface GeodesicEdge {
  readonly id: string;
  readonly type: StrutType;
  readonly start: string;
  readonly end: string;
  readonly length: number;
  readonly chordFactor: number;
}

export interface GeodesicFace {
  readonly id: string;
  /** Counter-clockwise when seen from outside the dome. */
  readonly vertices: readonly [string, string, string];
}

export interface EdgeClass {
  readonly type: StrutType;
  readonly label: "Short" | "Long";
  readonly count: number;
  readonly length: number;
  readonly chordFactor: number;
  readonly edgeIds: readonly string[];
}

export interface HubClass {
  readonly valence: HubValence;
  readonly label: "4-way" | "5-way" | "6-way";
  readonly count: number;
  readonly vertexIds: readonly string[];
}

export interface GeodesicAudit {
  readonly counts: {
    readonly vertices: number;
    readonly edges: number;
    readonly faces: number;
    readonly baseVertices: number;
    readonly struts: Readonly<Record<StrutType, number>>;
    readonly hubs: Readonly<Record<HubValence, number>>;
  };
  readonly topology: {
    readonly eulerCharacteristic: number;
    readonly boundaryEdgeCount: number;
    readonly strutEndpointCount: number;
    readonly hubPortCount: number;
  };
  readonly tolerances: {
    readonly geometric: number;
    readonly lengthClass: number;
  };
  readonly errors: {
    readonly maxRadius: number;
    readonly maxBasePlane: number;
    readonly maxEdgeClass: number;
    readonly maxBaseSide: number;
  };
  readonly checks: {
    readonly isTriangulatedDisk: boolean;
    readonly hasPlanarBase: boolean;
    readonly hasRegularDecagonBase: boolean;
    readonly hasBalancedConnections: boolean;
    readonly hasTwoEdgeClasses: boolean;
  };
}

export interface V2Hemisphere {
  readonly radius: number;
  readonly frequency: 2;
  readonly vertices: readonly GeodesicVertex[];
  readonly edges: readonly GeodesicEdge[];
  readonly faces: readonly GeodesicFace[];
  /** Counter-clockwise around +Y, starting at the smallest non-negative azimuth. */
  readonly baseVertexIds: readonly string[];
  readonly baseEdgeIds: readonly string[];
  readonly edgeClasses: readonly EdgeClass[];
  readonly hubClasses: readonly HubClass[];
  readonly audit: GeodesicAudit;
}

const ICOSAHEDRON_ADJACENT_DOT = 1 / Math.sqrt(5);

/** Chord/radius ratio for an original icosahedron vertex to an edge midpoint. */
export const V2_SHORT_CHORD_FACTOR = Math.sqrt(
  2 - 2 * Math.sqrt((1 + ICOSAHEDRON_ADJACENT_DOT) / 2),
);

/** Chord/radius ratio between adjacent projected edge midpoints in one face. */
export const V2_LONG_CHORD_FACTOR = Math.sqrt(
  2 -
    2 *
      ((1 + 3 * ICOSAHEDRON_ADJACENT_DOT) /
        (2 + 2 * ICOSAHEDRON_ADJACENT_DOT)),
);

export const V2_EXPECTED_COUNTS = Object.freeze({
  vertices: 26,
  edges: 65,
  faces: 40,
  baseVertices: 10,
  struts: Object.freeze({ S: 30, L: 35 }),
  hubs: Object.freeze({ 4: 10, 5: 6, 6: 10 }),
});

const GEOMETRIC_EPSILON = 1e-10;
const LENGTH_CLASS_TOLERANCE = 1e-9;

interface WorkingVertex {
  readonly position: Vector3Tuple;
}

type IndexFace = readonly [number, number, number];

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

function normalize(vector: Vector3Tuple): Vector3Tuple {
  const length = magnitude(vector);
  if (length <= Number.EPSILON) {
    throw new Error("Cannot normalize a zero-length vector.");
  }
  return scale(vector, 1 / length);
}

function distance(a: Vector3Tuple, b: Vector3Tuple): number {
  return magnitude(subtract(a, b));
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function idNumber(id: string): number {
  return Number(id.slice(1));
}

function vertexId(index: number): string {
  return `V${String(index + 1).padStart(3, "0")}`;
}

function edgeId(index: number): string {
  return `E${String(index + 1).padStart(3, "0")}`;
}

function faceId(index: number): string {
  return `F${String(index + 1).padStart(3, "0")}`;
}

function azimuth(position: Vector3Tuple): number {
  const raw = Math.atan2(position[2], position[0]);
  return raw < -GEOMETRIC_EPSILON ? raw + Math.PI * 2 : Math.max(0, raw);
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function compareIndexPairs(a: readonly [number, number], b: readonly [number, number]): number {
  return compareNumbers(a[0], b[0]) || compareNumbers(a[1], b[1]);
}

function orientOutward(face: IndexFace, positions: readonly Vector3Tuple[]): IndexFace {
  const [a, b, c] = face.map((index) => positions[index]) as [
    Vector3Tuple,
    Vector3Tuple,
    Vector3Tuple,
  ];
  const normal = cross(subtract(b, a), subtract(c, a));
  const centroid = scale(add(add(a, b), c), 1 / 3);
  return dot(normal, centroid) >= 0 ? face : [face[0], face[2], face[1]];
}

function makeOrientedIcosahedron(): {
  vertices: WorkingVertex[];
  faces: IndexFace[];
  edges: Array<readonly [number, number]>;
} {
  const vertices: WorkingVertex[] = [{ position: [0, 1, 0] }];
  const ringY = 1 / Math.sqrt(5);
  const ringRadius = 2 / Math.sqrt(5);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index * Math.PI * 2) / 5;
    vertices.push({
      position: [ringRadius * Math.cos(angle), ringY, ringRadius * Math.sin(angle)],
    });
  }
  for (let index = 0; index < 5; index += 1) {
    const angle = ((index + 0.5) * Math.PI * 2) / 5;
    vertices.push({
      position: [ringRadius * Math.cos(angle), -ringY, ringRadius * Math.sin(angle)],
    });
  }
  vertices.push({ position: [0, -1, 0] });

  const adjacentTolerance = 1e-12;
  const edges: Array<readonly [number, number]> = [];
  for (let start = 0; start < vertices.length; start += 1) {
    for (let end = start + 1; end < vertices.length; end += 1) {
      if (
        Math.abs(dot(vertices[start].position, vertices[end].position) - ICOSAHEDRON_ADJACENT_DOT) <
        adjacentTolerance
      ) {
        edges.push([start, end]);
      }
    }
  }
  edges.sort(compareIndexPairs);
  const edgeKeys = new Set(edges.map(([start, end]) => edgeKey(start, end)));

  const faces: IndexFace[] = [];
  const positions = vertices.map(({ position }) => position);
  for (let a = 0; a < vertices.length; a += 1) {
    for (let b = a + 1; b < vertices.length; b += 1) {
      if (!edgeKeys.has(edgeKey(a, b))) continue;
      for (let c = b + 1; c < vertices.length; c += 1) {
        if (edgeKeys.has(edgeKey(a, c)) && edgeKeys.has(edgeKey(b, c))) {
          faces.push(orientOutward([a, b, c], positions));
        }
      }
    }
  }

  if (vertices.length !== 12 || edges.length !== 30 || faces.length !== 20) {
    throw new Error("Internal error while constructing the regular icosahedron.");
  }

  return { vertices, edges, faces };
}

function subdivideFrequencyTwo(): {
  positions: Vector3Tuple[];
  faces: IndexFace[];
} {
  const source = makeOrientedIcosahedron();
  const positions = source.vertices.map(({ position }) => position);
  const midpointByEdge = new Map<string, number>();

  for (const [start, end] of source.edges) {
    const midpointIndex = positions.length;
    midpointByEdge.set(edgeKey(start, end), midpointIndex);
    positions.push(normalize(add(positions[start], positions[end])));
  }

  const subdividedFaces: IndexFace[] = [];
  for (const [a, b, c] of source.faces) {
    const ab = midpointByEdge.get(edgeKey(a, b));
    const bc = midpointByEdge.get(edgeKey(b, c));
    const ca = midpointByEdge.get(edgeKey(c, a));
    if (ab === undefined || bc === undefined || ca === undefined) {
      throw new Error("Internal error while resolving a subdivision midpoint.");
    }

    subdividedFaces.push(
      orientOutward([a, ab, ca], positions),
      orientOutward([b, bc, ab], positions),
      orientOutward([c, ca, bc], positions),
      orientOutward([ab, bc, ca], positions),
    );
  }

  return { positions, faces: subdividedFaces };
}

function rotateFaceToSmallestId(
  face: readonly [string, string, string],
): readonly [string, string, string] {
  const numbers = face.map(idNumber);
  const smallestAt = numbers.indexOf(Math.min(...numbers));
  if (smallestAt === 1) return [face[1], face[2], face[0]];
  if (smallestAt === 2) return [face[2], face[0], face[1]];
  return face;
}

function max(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/**
 * Builds the mathematically derived V2 hemisphere at any positive radius.
 * IDs, ordering, topology, and floating-point calculations are deterministic.
 */
export function buildV2Hemisphere(radius: number): V2Hemisphere {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Dome radius must be a finite number greater than zero.");
  }

  const subdivided = subdivideFrequencyTwo();
  const northernFaces = subdivided.faces.filter((face) =>
    face.every((index) => subdivided.positions[index][1] >= -GEOMETRIC_EPSILON),
  );
  const northernIndices = [...new Set(northernFaces.flat())];

  northernIndices.sort((left, right) => {
    const a = subdivided.positions[left];
    const b = subdivided.positions[right];
    const elevationOrder = b[1] - a[1];
    if (Math.abs(elevationOrder) > GEOMETRIC_EPSILON) return elevationOrder;
    return azimuth(a) - azimuth(b);
  });

  const idBySourceIndex = new Map<number, string>();
  northernIndices.forEach((sourceIndex, index) => {
    idBySourceIndex.set(sourceIndex, vertexId(index));
  });

  const scaledPositionById = new Map<string, Vector3Tuple>();
  for (const sourceIndex of northernIndices) {
    const id = idBySourceIndex.get(sourceIndex);
    if (!id) throw new Error("Internal error while assigning a vertex ID.");
    const unit = subdivided.positions[sourceIndex];
    const scaled = scale(unit, radius);
    scaledPositionById.set(id, [
      Math.abs(scaled[0]) < GEOMETRIC_EPSILON ? 0 : scaled[0],
      Math.abs(scaled[1]) < GEOMETRIC_EPSILON ? 0 : scaled[1],
      Math.abs(scaled[2]) < GEOMETRIC_EPSILON ? 0 : scaled[2],
    ]);
  }

  const faceVertexTriples = northernFaces
    .map((face) => {
      const ids = face.map((sourceIndex) => idBySourceIndex.get(sourceIndex));
      if (ids.some((id) => id === undefined)) {
        throw new Error("Internal error while mapping a face to hemisphere vertices.");
      }
      return rotateFaceToSmallestId(ids as [string, string, string]);
    })
    .sort((a, b) =>
      idNumber(a[0]) - idNumber(b[0]) ||
      idNumber(a[1]) - idNumber(b[1]) ||
      idNumber(a[2]) - idNumber(b[2]),
    );

  const faces: GeodesicFace[] = faceVertexTriples.map((vertices, index) => ({
    id: faceId(index),
    vertices,
  }));

  const edgePairs = new Map<string, readonly [string, string]>();
  for (const { vertices } of faces) {
    for (const [first, second] of [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[0]],
    ] as const) {
      const pair: readonly [string, string] =
        idNumber(first) < idNumber(second) ? [first, second] : [second, first];
      edgePairs.set(`${pair[0]}:${pair[1]}`, pair);
    }
  }
  const sortedEdgePairs = [...edgePairs.values()].sort(
    (a, b) => idNumber(a[0]) - idNumber(b[0]) || idNumber(a[1]) - idNumber(b[1]),
  );

  const edges: GeodesicEdge[] = sortedEdgePairs.map(([start, end], index) => {
    const startPosition = scaledPositionById.get(start);
    const endPosition = scaledPositionById.get(end);
    if (!startPosition || !endPosition) {
      throw new Error("Internal error while resolving an edge position.");
    }
    const length = distance(startPosition, endPosition);
    const chordFactor = length / radius;
    const type: StrutType =
      Math.abs(chordFactor - V2_SHORT_CHORD_FACTOR) <
      Math.abs(chordFactor - V2_LONG_CHORD_FACTOR)
        ? "S"
        : "L";
    return { id: edgeId(index), type, start, end, length, chordFactor };
  });

  const connectedEdgesByVertex = new Map<string, string[]>();
  for (const id of scaledPositionById.keys()) connectedEdgesByVertex.set(id, []);
  for (const edge of edges) {
    connectedEdgesByVertex.get(edge.start)?.push(edge.id);
    connectedEdgesByVertex.get(edge.end)?.push(edge.id);
  }

  const vertices: GeodesicVertex[] = [...scaledPositionById.entries()].map(([id, position]) => {
    const valence = connectedEdgesByVertex.get(id)?.length ?? 0;
    if (valence !== 4 && valence !== 5 && valence !== 6) {
      throw new Error(`Unexpected valence ${valence} at ${id}.`);
    }
    return {
      id,
      position,
      valence,
      isBase: Math.abs(position[1]) <= GEOMETRIC_EPSILON,
    };
  });

  const baseVertexIds = vertices
    .filter(({ isBase }) => isBase)
    .sort((a, b) => azimuth(a.position) - azimuth(b.position))
    .map(({ id }) => id);
  const baseVertexSet = new Set(baseVertexIds);
  const baseEdges = edges.filter(
    ({ start, end }) => baseVertexSet.has(start) && baseVertexSet.has(end),
  );
  const baseEdgeIds = baseEdges.map(({ id }) => id);

  const edgeClasses: EdgeClass[] = (["S", "L"] as const).map((type) => {
    const members = edges.filter((edge) => edge.type === type);
    const chordFactor = type === "S" ? V2_SHORT_CHORD_FACTOR : V2_LONG_CHORD_FACTOR;
    return {
      type,
      label: type === "S" ? "Short" : "Long",
      count: members.length,
      length: radius * chordFactor,
      chordFactor,
      edgeIds: members.map(({ id }) => id),
    };
  });

  const hubClasses: HubClass[] = ([4, 5, 6] as const).map((valence) => {
    const memberIds = vertices
      .filter((vertex) => vertex.valence === valence)
      .map(({ id }) => id);
    return {
      valence,
      label: `${valence}-way` as HubClass["label"],
      count: memberIds.length,
      vertexIds: memberIds,
    };
  });

  const radiusErrors = vertices.map(({ position }) => Math.abs(magnitude(position) - radius));
  const basePlaneErrors = baseVertexIds.map((id) =>
    Math.abs(scaledPositionById.get(id)?.[1] ?? Number.POSITIVE_INFINITY),
  );
  const edgeClassErrors = edges.map(({ chordFactor, type }) =>
    Math.abs(
      chordFactor - (type === "S" ? V2_SHORT_CHORD_FACTOR : V2_LONG_CHORD_FACTOR),
    ),
  );
  const theoreticalBaseSide = radius * V2_LONG_CHORD_FACTOR;
  const baseSideErrors = baseEdges.map(({ length }) => Math.abs(length - theoreticalBaseSide));
  const boundaryEdgeCount = baseEdges.length;
  const strutEndpointCount = edges.length * 2;
  const hubPortCount = vertices.reduce((total, vertex) => total + vertex.valence, 0);
  const eulerCharacteristic = vertices.length - edges.length + faces.length;
  const strutCounts: Record<StrutType, number> = {
    S: edges.filter(({ type }) => type === "S").length,
    L: edges.filter(({ type }) => type === "L").length,
  };
  const hubCounts: Record<HubValence, number> = {
    4: vertices.filter(({ valence }) => valence === 4).length,
    5: vertices.filter(({ valence }) => valence === 5).length,
    6: vertices.filter(({ valence }) => valence === 6).length,
  };
  const maxRadiusError = max(radiusErrors);
  const maxBasePlaneError = max(basePlaneErrors);
  const maxEdgeClassError = max(edgeClassErrors);
  const maxBaseSideError = max(baseSideErrors);

  const audit: GeodesicAudit = {
    counts: {
      vertices: vertices.length,
      edges: edges.length,
      faces: faces.length,
      baseVertices: baseVertexIds.length,
      struts: strutCounts,
      hubs: hubCounts,
    },
    topology: {
      eulerCharacteristic,
      boundaryEdgeCount,
      strutEndpointCount,
      hubPortCount,
    },
    tolerances: {
      geometric: GEOMETRIC_EPSILON * Math.max(1, radius),
      lengthClass: LENGTH_CLASS_TOLERANCE,
    },
    errors: {
      maxRadius: maxRadiusError,
      maxBasePlane: maxBasePlaneError,
      maxEdgeClass: maxEdgeClassError,
      maxBaseSide: maxBaseSideError,
    },
    checks: {
      isTriangulatedDisk: eulerCharacteristic === 1 && boundaryEdgeCount === 10,
      hasPlanarBase: maxBasePlaneError <= GEOMETRIC_EPSILON * Math.max(1, radius),
      hasRegularDecagonBase:
        baseVertexIds.length === 10 &&
        baseEdges.length === 10 &&
        maxBaseSideError <= GEOMETRIC_EPSILON * Math.max(1, radius),
      hasBalancedConnections: strutEndpointCount === hubPortCount,
      hasTwoEdgeClasses:
        edgeClasses.every(({ count }) => count > 0) &&
        maxEdgeClassError <= LENGTH_CLASS_TOLERANCE,
    },
  };

  return {
    radius,
    frequency: 2,
    vertices,
    edges,
    faces,
    baseVertexIds,
    baseEdgeIds,
    edgeClasses,
    hubClasses,
    audit,
  };
}
