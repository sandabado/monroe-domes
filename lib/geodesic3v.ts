/**
 * Deterministic Class-I, frequency-3, 5/8 icosahedral dome geometry.
 *
 * Coordinate system: +Y is up. The source icosahedron has a five-fold vertex
 * at the apex. Each source face is divided into a 3 x 3 triangular grid and
 * every new vertex is projected radially to the sphere. The 5/8 cap retains
 * 105 faces and has a 15-edge, two-level (non-planar) boundary. The returned
 * model is shifted so the five lowest boundary nodes sit at Y = 0.
 */

export type Vector3Tuple3V = readonly [x: number, y: number, z: number];
export type V3StrutType = "A" | "B" | "C";
export type V3HubValence = 4 | 5 | 6;

export interface V3Vertex {
  readonly id: string;
  readonly position: Vector3Tuple3V;
  readonly valence: V3HubValence;
  readonly isBoundary: boolean;
}

export interface V3Edge {
  readonly id: string;
  readonly type: V3StrutType;
  readonly start: string;
  readonly end: string;
  readonly length: number;
  readonly chordFactor: number;
  readonly isBoundary: boolean;
}

export interface V3Face {
  readonly id: string;
  /** Counter-clockwise when viewed from outside the source sphere. */
  readonly vertices: readonly [string, string, string];
}

export interface V3EdgeClass {
  readonly type: V3StrutType;
  readonly label: string;
  readonly count: number;
  readonly length: number;
  readonly chordFactor: number;
  readonly edgeIds: readonly string[];
}

export interface V3HubClass {
  readonly valence: V3HubValence;
  readonly label: string;
  readonly count: number;
  readonly vertexIds: readonly string[];
}

export interface V3FiveEighthsAudit {
  readonly counts: {
    readonly vertices: number;
    readonly edges: number;
    readonly faces: number;
    readonly boundaryVertices: number;
    readonly struts: Readonly<Record<V3StrutType, number>>;
    readonly hubs: Readonly<Record<V3HubValence, number>>;
  };
  readonly topology: {
    readonly eulerCharacteristic: number;
    readonly boundaryEdgeCount: number;
    readonly strutEndpointCount: number;
    readonly hubPortCount: number;
    readonly faceEdgeIncidences: number;
  };
  readonly boundary: {
    readonly lowNodeCount: number;
    readonly highNodeCount: number;
    readonly rippleInches: number;
    readonly maximumNodePairSpanInches: number;
    readonly minimumCaliperSpanInches: number;
  };
  readonly envelope: {
    readonly maximumMeshPlanSpanInches: number;
  };
  readonly errors: {
    readonly maxSphereRadius: number;
    readonly maxEdgeClass: number;
  };
  readonly checks: {
    readonly isTriangulatedDisk: boolean;
    readonly hasSingleConnectedComponent: boolean;
    readonly hasManifoldEdges: boolean;
    readonly hasSingleBoundaryCycle: boolean;
    readonly hasUniqueFaces: boolean;
    readonly hasConsistentOutwardWinding: boolean;
    readonly hasFifteenEdgeBoundary: boolean;
    readonly hasExpectedTwoLevelBoundary: boolean;
    readonly hasBalancedConnections: boolean;
    readonly hasThreeEdgeClasses: boolean;
    readonly hasExpectedFiveEighthsTopology: boolean;
  };
}

export interface V3FiveEighthsDome {
  readonly sphereRadius: number;
  readonly sphereCenterHeight: number;
  readonly peakHeight: number;
  readonly frequency: 3;
  readonly fraction: "5/8";
  readonly vertices: readonly V3Vertex[];
  readonly edges: readonly V3Edge[];
  readonly faces: readonly V3Face[];
  /** Increasing atan2(z, x) azimuth, beginning at the smallest non-negative azimuth. */
  readonly boundaryVertexIds: readonly string[];
  readonly boundaryEdgeIds: readonly string[];
  readonly edgeClasses: readonly V3EdgeClass[];
  readonly hubClasses: readonly V3HubClass[];
  readonly audit: V3FiveEighthsAudit;
}

export const V3_FIVE_EIGHTHS_CUT_Y = -0.1875924740850799;

/** Maximum horizontal separation of the 15 boundary nodes divided by sphere radius. */
export const V3_BASE_MAX_PAIR_FACTOR = 1.9588641709728285;

export const V3_CHORD_FACTORS = Object.freeze({
  A: 0.3486154888203379,
  B: 0.4035482123351976,
  C: 0.4124114893098498,
});

export const V3_FIVE_EIGHTHS_EXPECTED_COUNTS = Object.freeze({
  vertices: 61,
  edges: 165,
  faces: 105,
  boundaryVertices: 15,
  boundaryEdges: 15,
  struts: Object.freeze({ A: 30, B: 55, C: 80 }),
  hubs: Object.freeze({ 4: 15, 5: 6, 6: 40 }),
  faceEdgeIncidences: 315,
});

const GEOMETRIC_EPSILON = 1e-10;
const LENGTH_CLASS_TOLERANCE = 1e-9;
const ICOSAHEDRON_ADJACENT_DOT = 1 / Math.sqrt(5);

type IndexFace = readonly [number, number, number];

function add(a: Vector3Tuple3V, b: Vector3Tuple3V): Vector3Tuple3V {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple3V, b: Vector3Tuple3V): Vector3Tuple3V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: Vector3Tuple3V, scalar: number): Vector3Tuple3V {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(a: Vector3Tuple3V, b: Vector3Tuple3V): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3Tuple3V, b: Vector3Tuple3V): Vector3Tuple3V {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(vector: Vector3Tuple3V): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3Tuple3V): Vector3Tuple3V {
  const length = magnitude(vector);
  if (length <= Number.EPSILON) throw new Error("Cannot normalize a zero-length vector.");
  return scale(vector, 1 / length);
}

function distance(a: Vector3Tuple3V, b: Vector3Tuple3V): number {
  return magnitude(subtract(a, b));
}

function indexEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function idEdgeKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function azimuth(position: Vector3Tuple3V): number {
  const raw = Math.atan2(position[2], position[0]);
  return raw < -GEOMETRIC_EPSILON ? raw + Math.PI * 2 : Math.max(0, raw);
}

function orientOutward(face: IndexFace, positions: readonly Vector3Tuple3V[]): IndexFace {
  const [a, b, c] = face.map((index) => positions[index]) as [
    Vector3Tuple3V,
    Vector3Tuple3V,
    Vector3Tuple3V,
  ];
  const normal = cross(subtract(b, a), subtract(c, a));
  const centroid = scale(add(add(a, b), c), 1 / 3);
  return dot(normal, centroid) >= 0 ? face : [face[0], face[2], face[1]];
}

function makeOrientedIcosahedron(): { positions: Vector3Tuple3V[]; faces: IndexFace[] } {
  const positions: Vector3Tuple3V[] = [[0, 1, 0]];
  const ringY = 1 / Math.sqrt(5);
  const ringRadius = 2 / Math.sqrt(5);

  for (let index = 0; index < 5; index += 1) {
    const angle = index * Math.PI * 2 / 5;
    positions.push([ringRadius * Math.cos(angle), ringY, ringRadius * Math.sin(angle)]);
  }
  for (let index = 0; index < 5; index += 1) {
    const angle = (index + 0.5) * Math.PI * 2 / 5;
    positions.push([ringRadius * Math.cos(angle), -ringY, ringRadius * Math.sin(angle)]);
  }
  positions.push([0, -1, 0]);

  const edges: Array<readonly [number, number]> = [];
  for (let start = 0; start < positions.length; start += 1) {
    for (let end = start + 1; end < positions.length; end += 1) {
      if (Math.abs(dot(positions[start], positions[end]) - ICOSAHEDRON_ADJACENT_DOT) < 1e-12) {
        edges.push([start, end]);
      }
    }
  }
  const edgeKeys = new Set(edges.map(([start, end]) => indexEdgeKey(start, end)));
  const faces: IndexFace[] = [];
  for (let a = 0; a < positions.length; a += 1) {
    for (let b = a + 1; b < positions.length; b += 1) {
      if (!edgeKeys.has(indexEdgeKey(a, b))) continue;
      for (let c = b + 1; c < positions.length; c += 1) {
        if (edgeKeys.has(indexEdgeKey(a, c)) && edgeKeys.has(indexEdgeKey(b, c))) {
          faces.push(orientOutward([a, b, c], positions));
        }
      }
    }
  }
  if (positions.length !== 12 || edges.length !== 30 || faces.length !== 20) {
    throw new Error("Internal error while constructing the regular icosahedron.");
  }
  return { positions, faces };
}

function subdivideFrequencyThree(): { positions: Vector3Tuple3V[]; faces: IndexFace[] } {
  const source = makeOrientedIcosahedron();
  const positions: Vector3Tuple3V[] = [];
  const indexByPosition = new Map<string, number>();
  const faces: IndexFace[] = [];

  const addProjectedPosition = (position: Vector3Tuple3V): number => {
    const projected = normalize(position);
    const key = projected.map((coordinate) => coordinate.toFixed(12)).join(":");
    const existing = indexByPosition.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length;
    positions.push(projected);
    indexByPosition.set(key, index);
    return index;
  };

  for (const [a, b, c] of source.faces) {
    const localIndex = new Map<string, number>();
    const at = (u: number, v: number): number => {
      const index = localIndex.get(`${u}:${v}`);
      if (index === undefined) throw new Error("Internal error resolving a 3V face subdivision point.");
      return index;
    };

    for (let u = 0; u <= 3; u += 1) {
      for (let v = 0; v <= 3 - u; v += 1) {
        const aWeight = 3 - u - v;
        const point = add(
          add(scale(source.positions[a], aWeight), scale(source.positions[b], u)),
          scale(source.positions[c], v),
        );
        localIndex.set(`${u}:${v}`, addProjectedPosition(point));
      }
    }

    for (let u = 0; u < 3; u += 1) {
      for (let v = 0; v < 3 - u; v += 1) {
        faces.push(orientOutward([at(u, v), at(u + 1, v), at(u, v + 1)], positions));
        if (u + v <= 1) {
          faces.push(orientOutward([at(u + 1, v), at(u + 1, v + 1), at(u, v + 1)], positions));
        }
      }
    }
  }

  if (positions.length !== 92 || faces.length !== 180) {
    throw new Error("Internal error while constructing the full frequency-3 sphere.");
  }
  return { positions, faces };
}

function idNumber(id: string): number {
  return Number(id.slice(1));
}

function rotateFaceToSmallestId(face: readonly [string, string, string]): readonly [string, string, string] {
  const values = face.map(idNumber);
  const smallestAt = values.indexOf(Math.min(...values));
  if (smallestAt === 1) return [face[1], face[2], face[0]];
  if (smallestAt === 2) return [face[2], face[0], face[1]];
  return face;
}

function max(values: readonly number[]): number {
  return values.length ? Math.max(...values) : 0;
}

export function buildV3FiveEighthsDome(sphereRadius: number): V3FiveEighthsDome {
  if (!Number.isFinite(sphereRadius) || sphereRadius <= 0) {
    throw new RangeError("Dome sphere radius must be a finite number greater than zero.");
  }

  const subdivided = subdivideFrequencyThree();
  const capFaces = subdivided.faces.filter((face) =>
    face.every((index) => subdivided.positions[index][1] >= V3_FIVE_EIGHTHS_CUT_Y - GEOMETRIC_EPSILON),
  );
  const sourceVertexIndices = [...new Set(capFaces.flat())];

  sourceVertexIndices.sort((left, right) => {
    const first = subdivided.positions[left];
    const second = subdivided.positions[right];
    const elevationOrder = second[1] - first[1];
    return Math.abs(elevationOrder) > GEOMETRIC_EPSILON ? elevationOrder : azimuth(first) - azimuth(second);
  });

  const vertexIdBySourceIndex = new Map<number, string>();
  sourceVertexIndices.forEach((sourceIndex, index) => {
    vertexIdBySourceIndex.set(sourceIndex, `V${String(index + 1).padStart(3, "0")}`);
  });

  const faceVertexIds = capFaces.map((face) => rotateFaceToSmallestId(face.map((sourceIndex) => {
    const id = vertexIdBySourceIndex.get(sourceIndex);
    if (!id) throw new Error("Internal error assigning a 3V vertex ID.");
    return id;
  }) as [string, string, string]));
  faceVertexIds.sort((first, second) => first.map(idNumber).join("-").localeCompare(second.map(idNumber).join("-"), undefined, { numeric: true }));

  const edgeIncidenceByKey = new Map<string, number>();
  for (const face of faceVertexIds) {
    for (let index = 0; index < 3; index += 1) {
      const key = idEdgeKey(face[index], face[(index + 1) % 3]);
      edgeIncidenceByKey.set(key, (edgeIncidenceByKey.get(key) ?? 0) + 1);
    }
  }
  const boundaryKeys = new Set([...edgeIncidenceByKey].filter(([, count]) => count === 1).map(([key]) => key));
  const boundaryVertexIdSet = new Set([...boundaryKeys].flatMap((key) => key.split(":")));

  const sourceIndexByVertexId = new Map([...vertexIdBySourceIndex].map(([sourceIndex, id]) => [id, sourceIndex]));
  const shiftedPositionById = new Map<string, Vector3Tuple3V>();
  for (const [id, sourceIndex] of sourceIndexByVertexId) {
    const unit = subdivided.positions[sourceIndex];
    const position = [
      unit[0] * sphereRadius,
      (unit[1] - V3_FIVE_EIGHTHS_CUT_Y) * sphereRadius,
      unit[2] * sphereRadius,
    ] as const;
    shiftedPositionById.set(id, [
      Math.abs(position[0]) < GEOMETRIC_EPSILON ? 0 : position[0],
      Math.abs(position[1]) < GEOMETRIC_EPSILON ? 0 : position[1],
      Math.abs(position[2]) < GEOMETRIC_EPSILON ? 0 : position[2],
    ]);
  }

  const edgeKeys = [...edgeIncidenceByKey.keys()].sort((first, second) => {
    const [firstStart, firstEnd] = first.split(":").map(idNumber);
    const [secondStart, secondEnd] = second.split(":").map(idNumber);
    return firstStart - secondStart || firstEnd - secondEnd;
  });

  const typeByFactor = (factor: number): V3StrutType => {
    const entries = Object.entries(V3_CHORD_FACTORS) as Array<[V3StrutType, number]>;
    const sorted = entries.toSorted((first, second) => Math.abs(factor - first[1]) - Math.abs(factor - second[1]));
    if (Math.abs(factor - sorted[0][1]) > LENGTH_CLASS_TOLERANCE) {
      throw new Error(`Unexpected frequency-3 chord factor ${factor}.`);
    }
    return sorted[0][0];
  };

  const edges: V3Edge[] = edgeKeys.map((key, index) => {
    const [start, end] = key.split(":");
    const startPosition = shiftedPositionById.get(start);
    const endPosition = shiftedPositionById.get(end);
    if (!startPosition || !endPosition) throw new Error("Internal error resolving a 3V edge endpoint.");
    const length = distance(startPosition, endPosition);
    const chordFactor = length / sphereRadius;
    return Object.freeze({
      id: `E${String(index + 1).padStart(3, "0")}`,
      type: typeByFactor(chordFactor),
      start,
      end,
      length,
      chordFactor,
      isBoundary: boundaryKeys.has(key),
    });
  });

  const valenceByVertexId = new Map(sourceVertexIndices.map((sourceIndex) => [vertexIdBySourceIndex.get(sourceIndex)!, 0]));
  for (const edge of edges) {
    valenceByVertexId.set(edge.start, (valenceByVertexId.get(edge.start) ?? 0) + 1);
    valenceByVertexId.set(edge.end, (valenceByVertexId.get(edge.end) ?? 0) + 1);
  }

  const vertices: V3Vertex[] = sourceVertexIndices.map((sourceIndex) => {
    const id = vertexIdBySourceIndex.get(sourceIndex)!;
    const valence = valenceByVertexId.get(id);
    if (valence !== 4 && valence !== 5 && valence !== 6) {
      throw new Error(`Unexpected frequency-3 node valence ${valence} at ${id}.`);
    }
    return Object.freeze({ id, position: shiftedPositionById.get(id)!, valence, isBoundary: boundaryVertexIdSet.has(id) });
  });

  const faces: V3Face[] = faceVertexIds.map((face, index) => Object.freeze({
    id: `F${String(index + 1).padStart(3, "0")}`,
    vertices: face,
  }));

  const boundaryVertexIds = vertices
    .filter(({ isBoundary }) => isBoundary)
    .toSorted((first, second) => azimuth(first.position) - azimuth(second.position))
    .map(({ id }) => id);
  const boundaryEdgeIds = edges.filter(({ isBoundary }) => isBoundary).map(({ id }) => id);

  const edgeClasses = (["A", "B", "C"] as const).map((type) => {
    const classEdges = edges.filter((edge) => edge.type === type);
    const factor = V3_CHORD_FACTORS[type];
    return Object.freeze({
      type,
      label: `Chord ${type}`,
      count: classEdges.length,
      length: factor * sphereRadius,
      chordFactor: factor,
      edgeIds: Object.freeze(classEdges.map(({ id }) => id)),
    });
  });
  const hubClasses = ([4, 5, 6] as const).map((valence) => {
    const classVertices = vertices.filter((vertex) => vertex.valence === valence);
    return Object.freeze({
      valence,
      label: `${valence}-way`,
      count: classVertices.length,
      vertexIds: Object.freeze(classVertices.map(({ id }) => id)),
    });
  });

  const sphereCenterHeight = -V3_FIVE_EIGHTHS_CUT_Y * sphereRadius;
  const boundaryVertices = vertices.filter(({ isBoundary }) => isBoundary);
  const orderedBoundaryVertices = boundaryVertexIds.map((id) => {
    const vertex = vertices.find((candidate) => candidate.id === id);
    if (!vertex) throw new Error(`Unable to resolve boundary vertex ${id}.`);
    return vertex;
  });
  const boundaryHeights = boundaryVertices.map(({ position }) => position[1]);
  const minimumBoundaryHeight = Math.min(...boundaryHeights);
  const maximumBoundaryHeight = Math.max(...boundaryHeights);
  const lowNodeCount = boundaryHeights.filter((height) => Math.abs(height - minimumBoundaryHeight) <= GEOMETRIC_EPSILON * sphereRadius).length;
  const highNodeCount = boundaryHeights.filter((height) => Math.abs(height - maximumBoundaryHeight) <= GEOMETRIC_EPSILON * sphereRadius).length;
  const boundaryPairSpans: number[] = [];
  for (let first = 0; first < boundaryVertices.length; first += 1) {
    for (let second = first + 1; second < boundaryVertices.length; second += 1) {
      boundaryPairSpans.push(Math.hypot(
        boundaryVertices[first].position[0] - boundaryVertices[second].position[0],
        boundaryVertices[first].position[2] - boundaryVertices[second].position[2],
      ));
    }
  }
  const caliperWidths = orderedBoundaryVertices.map((vertex, index) => {
    const next = orderedBoundaryVertices[(index + 1) % orderedBoundaryVertices.length];
    const edgeX = next.position[0] - vertex.position[0];
    const edgeZ = next.position[2] - vertex.position[2];
    const edgeLength = Math.hypot(edgeX, edgeZ);
    const normalX = edgeZ / edgeLength;
    const normalZ = -edgeX / edgeLength;
    const projections = orderedBoundaryVertices.map((candidate) =>
      candidate.position[0] * normalX + candidate.position[2] * normalZ,
    );
    return Math.max(...projections) - Math.min(...projections);
  });
  const meshPlanSpans: number[] = [];
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      meshPlanSpans.push(Math.hypot(
        vertices[first].position[0] - vertices[second].position[0],
        vertices[first].position[2] - vertices[second].position[2],
      ));
    }
  }
  const radiusErrors = vertices.map(({ position }) => Math.abs(distance(position, [0, sphereCenterHeight, 0]) - sphereRadius));
  const edgeClassErrors = edges.map((edge) => Math.abs(edge.chordFactor - V3_CHORD_FACTORS[edge.type]));

  const adjacencyByVertexId = new Map(vertices.map(({ id }) => [id, new Set<string>()]));
  for (const edge of edges) {
    adjacencyByVertexId.get(edge.start)?.add(edge.end);
    adjacencyByVertexId.get(edge.end)?.add(edge.start);
  }
  const connectedVertexIds = new Set<string>();
  const vertexQueue = vertices.length ? [vertices[0].id] : [];
  while (vertexQueue.length) {
    const vertexId = vertexQueue.shift()!;
    if (connectedVertexIds.has(vertexId)) continue;
    connectedVertexIds.add(vertexId);
    for (const neighborId of adjacencyByVertexId.get(vertexId) ?? []) {
      if (!connectedVertexIds.has(neighborId)) vertexQueue.push(neighborId);
    }
  }
  const hasSingleConnectedComponent = connectedVertexIds.size === vertices.length;

  const hasManifoldEdges = [...edgeIncidenceByKey.values()].every((incidence) => incidence === 1 || incidence === 2);
  const boundaryAdjacency = new Map<string, Set<string>>();
  for (const key of boundaryKeys) {
    const [start, end] = key.split(":");
    if (!boundaryAdjacency.has(start)) boundaryAdjacency.set(start, new Set());
    if (!boundaryAdjacency.has(end)) boundaryAdjacency.set(end, new Set());
    boundaryAdjacency.get(start)!.add(end);
    boundaryAdjacency.get(end)!.add(start);
  }
  const connectedBoundaryIds = new Set<string>();
  const boundaryQueue = boundaryAdjacency.size ? [boundaryAdjacency.keys().next().value as string] : [];
  while (boundaryQueue.length) {
    const vertexId = boundaryQueue.shift()!;
    if (connectedBoundaryIds.has(vertexId)) continue;
    connectedBoundaryIds.add(vertexId);
    for (const neighborId of boundaryAdjacency.get(vertexId) ?? []) {
      if (!connectedBoundaryIds.has(neighborId)) boundaryQueue.push(neighborId);
    }
  }
  const hasSingleBoundaryCycle = boundaryAdjacency.size > 0
    && boundaryKeys.size === boundaryAdjacency.size
    && connectedBoundaryIds.size === boundaryAdjacency.size
    && [...boundaryAdjacency.values()].every((neighbors) => neighbors.size === 2);

  const faceKeys = faces.map(({ vertices: face }) => [...face].sort().join(":"));
  const hasUniqueFaces = new Set(faceKeys).size === faces.length;
  const sphereCenter: Vector3Tuple3V = [0, sphereCenterHeight, 0];
  const hasConsistentOutwardWinding = faces.every(({ vertices: face }) => {
    const [a, b, c] = face.map((vertexId) => shiftedPositionById.get(vertexId)) as [
      Vector3Tuple3V | undefined,
      Vector3Tuple3V | undefined,
      Vector3Tuple3V | undefined,
    ];
    if (!a || !b || !c) return false;
    const faceNormal = cross(subtract(b, a), subtract(c, a));
    const centroid = scale(add(add(a, b), c), 1 / 3);
    return dot(faceNormal, subtract(centroid, sphereCenter)) > GEOMETRIC_EPSILON;
  });

  const counts = {
    vertices: vertices.length,
    edges: edges.length,
    faces: faces.length,
    boundaryVertices: boundaryVertexIds.length,
    struts: {
      A: edges.filter(({ type }) => type === "A").length,
      B: edges.filter(({ type }) => type === "B").length,
      C: edges.filter(({ type }) => type === "C").length,
    },
    hubs: {
      4: vertices.filter(({ valence }) => valence === 4).length,
      5: vertices.filter(({ valence }) => valence === 5).length,
      6: vertices.filter(({ valence }) => valence === 6).length,
    },
  } as const;
  const topology = {
    eulerCharacteristic: vertices.length - edges.length + faces.length,
    boundaryEdgeCount: boundaryEdgeIds.length,
    strutEndpointCount: edges.length * 2,
    hubPortCount: vertices.reduce((sum, vertex) => sum + vertex.valence, 0),
    faceEdgeIncidences: faces.length * 3,
  } as const;
  const expected = V3_FIVE_EIGHTHS_EXPECTED_COUNTS;
  const isTriangulatedDisk = topology.eulerCharacteristic === 1
    && hasSingleConnectedComponent
    && hasManifoldEdges
    && hasSingleBoundaryCycle
    && hasUniqueFaces
    && hasConsistentOutwardWinding;
  const audit: V3FiveEighthsAudit = Object.freeze({
    counts,
    topology,
    boundary: Object.freeze({
      lowNodeCount,
      highNodeCount,
      rippleInches: maximumBoundaryHeight - minimumBoundaryHeight,
      maximumNodePairSpanInches: max(boundaryPairSpans),
      minimumCaliperSpanInches: Math.min(...caliperWidths),
    }),
    envelope: Object.freeze({ maximumMeshPlanSpanInches: max(meshPlanSpans) }),
    errors: Object.freeze({
      maxSphereRadius: max(radiusErrors),
      maxEdgeClass: max(edgeClassErrors),
    }),
    checks: Object.freeze({
      isTriangulatedDisk,
      hasSingleConnectedComponent,
      hasManifoldEdges,
      hasSingleBoundaryCycle,
      hasUniqueFaces,
      hasConsistentOutwardWinding,
      hasFifteenEdgeBoundary: boundaryVertexIds.length === 15 && boundaryEdgeIds.length === 15,
      hasExpectedTwoLevelBoundary: lowNodeCount === 5 && highNodeCount === 10 && maximumBoundaryHeight > minimumBoundaryHeight,
      hasBalancedConnections: topology.strutEndpointCount === topology.hubPortCount,
      hasThreeEdgeClasses: edgeClasses.length === 3 && edgeClasses.every(({ count }) => count > 0),
      hasExpectedFiveEighthsTopology:
        counts.vertices === expected.vertices
        && counts.edges === expected.edges
        && counts.faces === expected.faces
        && counts.struts.A === expected.struts.A
        && counts.struts.B === expected.struts.B
        && counts.struts.C === expected.struts.C
        && counts.hubs[4] === expected.hubs[4]
        && counts.hubs[5] === expected.hubs[5]
        && counts.hubs[6] === expected.hubs[6]
        && topology.faceEdgeIncidences === expected.faceEdgeIncidences,
    }),
  });

  if (!Object.values(audit.checks).every(Boolean)) {
    throw new Error("Generated frequency-3 5/8 dome failed its invariant checks.");
  }

  return Object.freeze({
    sphereRadius,
    sphereCenterHeight,
    peakHeight: (1 - V3_FIVE_EIGHTHS_CUT_Y) * sphereRadius,
    frequency: 3,
    fraction: "5/8",
    vertices: Object.freeze(vertices),
    edges: Object.freeze(edges),
    faces: Object.freeze(faces),
    boundaryVertexIds: Object.freeze(boundaryVertexIds),
    boundaryEdgeIds: Object.freeze(boundaryEdgeIds),
    edgeClasses: Object.freeze(edgeClasses),
    hubClasses: Object.freeze(hubClasses),
    audit,
  });
}
