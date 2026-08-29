"use client";

import {
  ContactShadows,
  Edges,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  buildRedesignHubHalfspaces,
  intersectHalfspaceTriples,
  makeAxialCentralClampObb,
  makeAxialCrossKeyObb,
  makeAxialMemberEnvelopeObb,
  makeAxialTenonObb,
  PORT_NORMAL_REDESIGN_STUDY,
  REDESIGN_CAPTURE_STUDY,
  REDESIGN_HUB_ENVELOPE,
  REDESIGN_POCKET_ENVELOPE,
  type InstalledHub,
  type OrientedBox,
  type RedesignHubHalfspace,
} from "@/lib/joinery";
import {
  DOME_MODEL,
  ENTRANCE_STUDY,
  JOINERY_MODEL,
  MATERIAL,
  MEMBERS,
  PLATFORM_CONCEPT,
  WOOD_PANEL_CONCEPT,
  type DomeMember,
} from "@/lib/spec";

export type ViewMode = "iso" | "plan" | "front" | "right" | "parts" | "platform" | "site" | "joinery";
export type MemberFilter = "all" | "S" | "L";
export type AuditHubValence = 4 | 5 | 6;

export type LayerState = {
  timber: boolean;
  hubs: boolean;
  panels: boolean;
  platformDeck: boolean;
  platformFrame: boolean;
  platformSupports: boolean;
  dimensions: boolean;
  labels: boolean;
  ground: boolean;
};

type SceneProps = {
  layers: LayerState;
  memberFilter: MemberFilter;
  selectedMemberId: string | null;
  isolateSelected: boolean;
  explode: number;
  autoRotate: boolean;
  viewMode: ViewMode;
  azimuthStep: number;
  zoom: number;
  resetNonce: number;
  auditHubValence: AuditHubValence;
  selectionEnabled: boolean;
  mobileLayout: boolean;
  onInteractionStart: () => void;
  onSelectMember: (pieceId: string | null) => void;
};

const INCHES_TO_FEET = 1 / 12;
const UP = new THREE.Vector3(0, 1, 0);
const BEAM_GEOMETRY = new THREE.BoxGeometry(
  MATERIAL.modeledSectionInches,
  1,
  MATERIAL.modeledSectionInches,
);
const HIT_GEOMETRY = new THREE.BoxGeometry(5.5, 1, 5.5);
const vertexById = new Map(DOME_MODEL.vertices.map((vertex) => [vertex.id, vertex]));

function requiredVertex(vertexId: string) {
  const vertex = vertexById.get(vertexId);
  if (!vertex) throw new Error(`Unable to resolve dome vertex ${vertexId}.`);
  return vertex;
}

const ORDERED_BASE_VERTICES = Object.freeze(DOME_MODEL.baseVertexIds.map(requiredVertex));
const ENTRY_BASE_START = ORDERED_BASE_VERTICES[0];
const ENTRY_BASE_END = ORDERED_BASE_VERTICES[1];
const ENTRY_BASE_MEMBER = MEMBERS.find((member) =>
  (member.start === ENTRY_BASE_START.id && member.end === ENTRY_BASE_END.id)
  || (member.start === ENTRY_BASE_END.id && member.end === ENTRY_BASE_START.id),
);
if (!ENTRY_BASE_MEMBER || !DOME_MODEL.baseEdgeIds.includes(ENTRY_BASE_MEMBER.id)) {
  throw new Error("Unable to resolve the canonical platform entrance base edge.");
}
const ENTRY_HIDDEN_FACE_IDS = new Set<string>(ENTRANCE_STUDY.hiddenFaceIds);
const ENTRY_HIDDEN_MEMBER_IDS = new Set<string>(ENTRANCE_STUDY.hiddenMemberPieceIds);
const ENTRY_HIDDEN_NODE_IDS = new Set<string>(ENTRANCE_STUDY.hiddenNodeIds);
const ENTRY_DIRECTION = new THREE.Vector3(
  ENTRY_BASE_START.position[0] + ENTRY_BASE_END.position[0],
  0,
  ENTRY_BASE_START.position[2] + ENTRY_BASE_END.position[2],
).normalize();

const WOOD_PANEL_INWARD_OFFSET_INCHES = WOOD_PANEL_CONCEPT.visualInwardOffsetInches;
const WOOD_PANEL_COLORS = ["#a36337", "#8d4f28", "#b2733f", "#98582e", "#b97a46"] as const;

function makePanelGeometry(excludedFaceIds: ReadonlySet<string> = new Set()) {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const [faceIndex, face] of DOME_MODEL.faces.entries()) {
    if (excludedFaceIds.has(face.id)) continue;
    const points = face.vertices.map((vertexId) => {
      const vertex = vertexById.get(vertexId);
      if (!vertex) throw new Error(`Unable to resolve panel vertex ${vertexId}.`);
      return new THREE.Vector3(...vertex.position);
    });
    const outward = new THREE.Vector3()
      .crossVectors(
        points[1].clone().sub(points[0]),
        points[2].clone().sub(points[0]),
      )
      .normalize();
    const centroid = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
    if (outward.dot(centroid) < 0) outward.negate();
    const inwardOffset = outward.multiplyScalar(-WOOD_PANEL_INWARD_OFFSET_INCHES);
    const panelColor = new THREE.Color(WOOD_PANEL_COLORS[faceIndex % WOOD_PANEL_COLORS.length]);

    for (const point of points) {
      positions.push(...point.add(inwardOffset).toArray());
      colors.push(panelColor.r, panelColor.g, panelColor.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const PANEL_GEOMETRY = makePanelGeometry();
const ENTRY_PANEL_GEOMETRY = makePanelGeometry(ENTRY_HIDDEN_FACE_IDS);

type OrientedBoxTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: [number, number, number];
};

function detailAlignment(hub: InstalledHub) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(...hub.outwardNormal),
    UP,
  );
}

function transformBoxToDetail(
  box: OrientedBox,
  hub: InstalledHub,
  alignment: THREE.Quaternion,
): OrientedBoxTransform {
  const position = new THREE.Vector3(...box.center)
    .sub(new THREE.Vector3(...hub.position))
    .applyQuaternion(alignment);
  const x = new THREE.Vector3(...box.axes[0]).applyQuaternion(alignment).normalize();
  const y = new THREE.Vector3(...box.axes[1]).applyQuaternion(alignment).normalize();
  // The audited roll tuple may be left-handed. A box is reflection-symmetric,
  // so derive a right-handed third axis for a representable rigid transform.
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const matrix = new THREE.Matrix4().makeBasis(x, y, z);
  return {
    position,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    size: box.halfExtents.map((extent) => extent * 2) as [number, number, number],
  };
}

function AuditBox({
  box,
  hub,
  alignment,
  color,
  edgeColor,
  opacity,
  emissive = "#000000",
  depthTest = true,
}: {
  box: OrientedBox;
  hub: InstalledHub;
  alignment: THREE.Quaternion;
  color: string;
  edgeColor: string;
  opacity: number;
  emissive?: string;
  depthTest?: boolean;
}) {
  const transform = useMemo(
    () => transformBoxToDetail(box, hub, alignment),
    [alignment, box, hub],
  );
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} renderOrder={3}>
      <boxGeometry args={transform.size} />
      <meshPhysicalMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissive === "#000000" ? 0 : 0.72}
        roughness={0.48}
        metalness={0.02}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.8}
        depthTest={depthTest}
      />
      <Edges color={edgeColor} threshold={1} />
    </mesh>
  );
}

function WireBox({
  box,
  hub,
  alignment,
  color = "#9ce5ce",
}: {
  box: OrientedBox;
  hub: InstalledHub;
  alignment: THREE.Quaternion;
  color?: string;
}) {
  const transform = useMemo(
    () => transformBoxToDetail(box, hub, alignment),
    [alignment, box, hub],
  );
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} renderOrder={5}>
      <boxGeometry args={transform.size} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.82} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function AuditCylinder({
  box,
  hub,
  alignment,
}: {
  box: OrientedBox;
  hub: InstalledHub;
  alignment: THREE.Quaternion;
}) {
  const transform = useMemo(() => {
    const position = new THREE.Vector3(...box.center)
      .sub(new THREE.Vector3(...hub.position))
      .applyQuaternion(alignment);
    const direction = new THREE.Vector3(...box.axes[0]).applyQuaternion(alignment).normalize();
    return {
      position,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction),
      length: box.halfExtents[0] * 2,
      radius: box.halfExtents[1],
    };
  }, [alignment, box, hub]);
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} renderOrder={6}>
      <cylinderGeometry args={[transform.radius, transform.radius, transform.length, 24]} />
      <meshPhysicalMaterial
        color="#8ebed1"
        emissive="#174152"
        emissiveIntensity={0.72}
        roughness={0.38}
        metalness={0.02}
        depthTest={false}
      />
      <Edges color="#e0f7ff" threshold={16} />
    </mesh>
  );
}

function shellHalfspaces(
  hub: InstalledHub,
  radialMinimum: number,
  radialMaximum: number,
): RedesignHubHalfspace[] {
  if (radialMinimum >= radialMaximum) {
    throw new RangeError("Shell radial minimum must be below its maximum.");
  }
  return buildRedesignHubHalfspaces(hub).map((halfspace) => {
    if (halfspace.kind === "radial-outboard") {
      return { ...halfspace, offset: radialMaximum };
    }
    if (halfspace.kind === "radial-inboard") {
      return { ...halfspace, offset: -radialMinimum };
    }
    return halfspace;
  });
}

function makePortNormalShellGeometry(
  hub: InstalledHub,
  alignment: THREE.Quaternion,
  radialMinimum: number,
  radialMaximum: number,
) {
  const points = intersectHalfspaceTriples(
    shellHalfspaces(hub, radialMinimum, radialMaximum),
  ).map(({ position }) => new THREE.Vector3(...position).applyQuaternion(alignment));
  return new ConvexGeometry(points);
}

function PortNormalTwoShellBody({ hub, alignment }: { hub: InstalledHub; alignment: THREE.Quaternion }) {
  const shells = useMemo(() => [
    {
      id: "inner-shell",
      geometry: makePortNormalShellGeometry(
        hub,
        alignment,
        -REDESIGN_HUB_ENVELOPE.radialInboard,
        REDESIGN_HUB_ENVELOPE.radialSplit,
      ),
      color: "#81572f",
      edge: "#e5b877",
      opacity: 0.72,
    },
    {
      id: "outer-shell",
      geometry: makePortNormalShellGeometry(
        hub,
        alignment,
        REDESIGN_HUB_ENVELOPE.radialSplit,
        REDESIGN_HUB_ENVELOPE.radialOutboard,
      ),
      color: "#b58a50",
      edge: "#ffe0a5",
      opacity: 0.46,
    },
  ], [alignment, hub]);

  useEffect(() => () => shells.forEach(({ geometry }) => geometry.dispose()), [shells]);

  return (
    <group>
      {shells.map((shell, index) => (
        <mesh key={shell.id} geometry={shell.geometry} renderOrder={1 + index}>
          <meshPhysicalMaterial
            color={shell.color}
            roughness={0.72}
            metalness={0.01}
            transparent
            opacity={shell.opacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
          <Edges color={shell.edge} threshold={12} />
        </mesh>
      ))}
    </group>
  );
}

function memberTransform(member: DomeMember, explode: number) {
  const start = vertexById.get(member.start);
  const end = vertexById.get(member.end);
  if (!start || !end) throw new Error(`Unable to resolve endpoints for ${member.pieceId}.`);

  const startVector = new THREE.Vector3(...start.position);
  const endVector = new THREE.Vector3(...end.position);
  const direction = endVector.clone().sub(startVector);
  const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5);
  const radial = midpoint.clone().normalize().multiplyScalar(explode * 12);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
  return { position: midpoint.add(radial), quaternion, length: direction.length() };
}

function TimberMember({
  member,
  showBody,
  selected,
  muted,
  explode,
  labels,
  selectionEnabled,
  onSelect,
}: {
  member: DomeMember;
  showBody: boolean;
  selected: boolean;
  muted: boolean;
  explode: number;
  labels: boolean;
  selectionEnabled: boolean;
  onSelect: (pieceId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const transform = useMemo(() => memberTransform(member, explode), [member, explode]);
  const opacity = selected ? 1 : muted ? 0.075 : hovered ? 1 : 0.94;
  const color = selected ? "#ffd37f" : member.type === "S" ? "#d9a965" : "#b98246";
  const interactive = selectionEnabled && (!muted || selected);

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(member.pieceId);
  };

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      {showBody ? (
        <>
          <mesh
            geometry={BEAM_GEOMETRY}
            scale={[1, transform.length, 1]}
            castShadow={!muted}
            receiveShadow
            onClick={interactive ? select : undefined}
            onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); } : undefined}
            onPointerOut={interactive ? () => setHovered(false) : undefined}
          >
            <meshStandardMaterial
              color={color}
              emissive={selected ? "#9a6025" : "#000000"}
              emissiveIntensity={selected ? 0.42 : 0}
              roughness={0.7}
              metalness={0.02}
              transparent={muted}
              opacity={opacity}
              depthWrite={!muted}
            />
            {(selected || hovered) ? <Edges color={selected ? "#fff4d3" : "#e8d2ae"} threshold={10} /> : null}
          </mesh>
          {interactive ? (
            <mesh
              geometry={HIT_GEOMETRY}
              scale={[1, transform.length, 1]}
              onClick={select}
              onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
              onPointerOut={() => setHovered(false)}
            >
              <meshBasicMaterial visible={false} />
            </mesh>
          ) : null}
        </>
      ) : null}
      {(selected || labels) ? (
        <Html center position={[0, 0, MATERIAL.modeledSectionInches * 1.8]} className={selected ? "model-label selected" : "model-label"}>
          <span aria-hidden="true">{member.pieceId}</span>
        </Html>
      ) : null}
    </group>
  );
}

function Hub({
  vertexId,
  showBody,
  explode,
  labels,
  selectedEndpoint,
}: {
  vertexId: string;
  showBody: boolean;
  explode: number;
  labels: boolean;
  selectedEndpoint: boolean;
}) {
  const vertex = vertexById.get(vertexId);
  if (!vertex) return null;
  const basePosition = new THREE.Vector3(...vertex.position);
  const radial = basePosition.clone().normalize();
  const position = basePosition.clone().add(radial.clone().multiplyScalar(explode * 12));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, radial);

  return (
    <group position={position} quaternion={quaternion}>
      {showBody ? (
        <mesh castShadow>
          <cylinderGeometry args={[1.65, 1.65, 2, vertex.valence]} />
          <meshStandardMaterial
            color={selectedEndpoint ? "#f4d08b" : "#a14d40"}
            emissive={selectedEndpoint ? "#8f652e" : "#3f0906"}
            emissiveIntensity={selectedEndpoint ? 0.35 : 0.18}
            roughness={0.56}
            metalness={0.02}
            transparent
            opacity={selectedEndpoint ? 0.72 : 0.2}
            depthWrite={selectedEndpoint}
          />
          <Edges color={selectedEndpoint ? "#fff1ce" : "#db7461"} threshold={12} />
        </mesh>
      ) : null}
      {labels ? (
        <Html center position={[0, 3.8, 0]} className="model-label node-label">
          <span aria-hidden="true">{vertex.id} · {vertex.valence}W</span>
        </Html>
      ) : null}
    </group>
  );
}

function DimensionLayer() {
  return (
    <group>
      <Line points={[[-6, 0.04, 7], [6, 0.04, 7]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[6.65, 0, 0], [6.65, 6, 0]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[6.48, 0, 0], [6.82, 0, 0]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[6.48, 6, 0], [6.82, 6, 0]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[ -6, -0.12, 6.82], [ -6, 0.2, 7.18]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[ 6, -0.12, 6.82], [ 6, 0.2, 7.18]]} color="#b7c9ae" lineWidth={1} />
      <Html center position={[0, 0.08, 7]} className="dimension-label"><span aria-hidden="true">144.000 IN</span></Html>
      <Html center position={[6.65, 3, 0]} className="dimension-label vertical"><span aria-hidden="true">72.000 IN</span></Html>
    </group>
  );
}

const PLATFORM_FORWARD = new THREE.Vector3(0, 0, 1);
const PLATFORM_FRAME_CENTER_Y = PLATFORM_CONCEPT.clearBelowFrameInches + PLATFORM_CONCEPT.frameDepthInches / 2;
const PLATFORM_DECK_CENTER_Y = PLATFORM_CONCEPT.deckTopInches - PLATFORM_CONCEPT.deckThicknessInches / 2;
const PLATFORM_RIM_VERTICES = Object.freeze(ORDERED_BASE_VERTICES.map((vertex) => {
  const direction = new THREE.Vector3(vertex.position[0], 0, vertex.position[2]).normalize();
  return [
    direction.x * PLATFORM_CONCEPT.radiusInches,
    PLATFORM_FRAME_CENTER_Y,
    direction.z * PLATFORM_CONCEPT.radiusInches,
  ] as [number, number, number];
}));
const PLATFORM_SUPPORT_VERTICES = Object.freeze(ORDERED_BASE_VERTICES.map((vertex) => [
  vertex.position[0],
  PLATFORM_CONCEPT.clearBelowFrameInches / 2,
  vertex.position[2],
] as [number, number, number]));
const PLATFORM_ENTRY_QUATERNION = new THREE.Quaternion().setFromUnitVectors(PLATFORM_FORWARD, ENTRY_DIRECTION);
const ENTRY_TANGENT = new THREE.Vector3(ENTRY_DIRECTION.z, 0, -ENTRY_DIRECTION.x);
const ENTRY_DOME_EDGE_APOTHEM = new THREE.Vector3(
  (ENTRY_BASE_START.position[0] + ENTRY_BASE_END.position[0]) / 2,
  0,
  (ENTRY_BASE_START.position[2] + ENTRY_BASE_END.position[2]) / 2,
).length();
const ENTRY_PATCH_TOP_START = requiredVertex("V002");
const ENTRY_PATCH_TOP_END = requiredVertex("V003");
const ENTRY_PATCH_TOP_APOTHEM = new THREE.Vector3(
  (ENTRY_PATCH_TOP_START.position[0] + ENTRY_PATCH_TOP_END.position[0]) / 2,
  0,
  (ENTRY_PATCH_TOP_START.position[2] + ENTRY_PATCH_TOP_END.position[2]) / 2,
).length();
const ENTRY_PLATFORM_EDGE_APOTHEM = PLATFORM_CONCEPT.radiusInches * Math.cos(Math.PI / 10);
const ENTRY_WALKWAY_LENGTH = ENTRY_PLATFORM_EDGE_APOTHEM - ENTRY_DOME_EDGE_APOTHEM;
const PLATFORM_CAMERA_TARGET = Object.freeze([
  ENTRY_DIRECTION.x * 1.25,
  4.5,
  ENTRY_DIRECTION.z * 1.25,
] as [number, number, number]);

function entrySurfaceDepth(y: number): number {
  const ratio = y / ENTRANCE_STUDY.sourcePatchRiseInches;
  return ENTRY_DOME_EDGE_APOTHEM + (ENTRY_PATCH_TOP_APOTHEM - ENTRY_DOME_EDGE_APOTHEM) * ratio;
}

function entryLocalVertex(vertexId: string): THREE.Vector3 {
  const vertex = requiredVertex(vertexId);
  const point = new THREE.Vector3(...vertex.position);
  return new THREE.Vector3(point.dot(ENTRY_TANGENT), point.y, point.dot(ENTRY_DIRECTION));
}

function makeEntranceCassetteGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const halfOuterWidth = ENTRANCE_STUDY.outerWidthInches / 2;
  const inset = 0.72;
  const addTriangle = (first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3) => {
    for (const point of [first, second, third]) positions.push(point.x, point.y, point.z - inset);
  };
  const addCheek = (bottomId: string, middleId: string, topId: string, side: -1 | 1) => {
    const bottom = entryLocalVertex(bottomId);
    const middle = entryLocalVertex(middleId);
    const top = entryLocalVertex(topId);
    const frameBottom = new THREE.Vector3(side * halfOuterWidth, 0, entrySurfaceDepth(0));
    const frameMiddle = new THREE.Vector3(side * halfOuterWidth, middle.y, entrySurfaceDepth(middle.y));
    const frameTop = new THREE.Vector3(side * halfOuterWidth, ENTRANCE_STUDY.outerHeightInches, entrySurfaceDepth(ENTRANCE_STUDY.outerHeightInches));
    addTriangle(bottom, middle, frameBottom);
    addTriangle(middle, frameMiddle, frameBottom);
    addTriangle(middle, top, frameMiddle);
    addTriangle(top, frameTop, frameMiddle);
  };

  addCheek("V018", "V013", "V003", -1);
  addCheek("V017", "V012", "V002", 1);
  const topLeft = entryLocalVertex("V003");
  const topRight = entryLocalVertex("V002");
  const frameTopLeft = new THREE.Vector3(-halfOuterWidth, ENTRANCE_STUDY.outerHeightInches, entrySurfaceDepth(ENTRANCE_STUDY.outerHeightInches));
  const frameTopRight = new THREE.Vector3(halfOuterWidth, ENTRANCE_STUDY.outerHeightInches, entrySurfaceDepth(ENTRANCE_STUDY.outerHeightInches));
  addTriangle(topLeft, topRight, frameTopLeft);
  addTriangle(topRight, frameTopRight, frameTopLeft);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const ENTRY_CASSETTE_GEOMETRY = makeEntranceCassetteGeometry();

function horizontalDecagonSpan(z: number): readonly [minimumX: number, maximumX: number] {
  const intersections: number[] = [];
  for (let index = 0; index < PLATFORM_RIM_VERTICES.length; index += 1) {
    const start = PLATFORM_RIM_VERTICES[index];
    const end = PLATFORM_RIM_VERTICES[(index + 1) % PLATFORM_RIM_VERTICES.length];
    const minimumZ = Math.min(start[2], end[2]);
    const maximumZ = Math.max(start[2], end[2]);
    const deltaZ = end[2] - start[2];
    if (z < minimumZ - 1e-9 || z > maximumZ + 1e-9 || Math.abs(deltaZ) < 1e-9) continue;
    const ratio = (z - start[2]) / deltaZ;
    if (ratio >= -1e-9 && ratio <= 1 + 1e-9) {
      intersections.push(start[0] + (end[0] - start[0]) * ratio);
    }
  }
  if (intersections.length < 2) return [0, 0];
  return [Math.min(...intersections), Math.max(...intersections)];
}

const PLATFORM_DECK_BOARDS = Object.freeze(Array.from({ length: PLATFORM_CONCEPT.deckBoardCount }, (_, index) => {
  const z = (index - (PLATFORM_CONCEPT.deckBoardCount - 1) / 2) * PLATFORM_CONCEPT.deckBoardPitchInches;
  const [minimumX, maximumX] = horizontalDecagonSpan(z);
  return Object.freeze({
    id: `P-D${String(index + 1).padStart(2, "0")}`,
    z,
    x: (minimumX + maximumX) / 2,
    length: maximumX - minimumX,
  });
}));

function PlatformBeam({
  id,
  start,
  end,
  width,
  depth,
  color,
  labels,
}: {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  width: number;
  depth: number;
  color: string;
  labels: boolean;
}) {
  const transform = useMemo(() => {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = endVector.clone().sub(startVector);
    return {
      position: startVector.add(endVector).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(PLATFORM_FORWARD, direction.clone().normalize()),
      length: direction.length(),
    };
  }, [end, start]);
  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, depth, transform.length]} />
        <meshStandardMaterial color={color} roughness={0.78} metalness={0} />
        <Edges color="#e8cda4" threshold={14} />
      </mesh>
      {labels ? <Html center position={[0, depth * 0.8, 0]} className="model-label platform-label"><span aria-hidden="true">{id}</span></Html> : null}
    </group>
  );
}

function EntrancePortal({ labels }: { labels: boolean }) {
  const halfClearWidth = ENTRANCE_STUDY.clearWidthInches / 2;
  const jambCenterX = halfClearWidth + ENTRANCE_STUDY.jambWidthInches / 2;
  const jambBottomY = ENTRANCE_STUDY.jambWidthInches / 2;
  const lintelCenterY = ENTRANCE_STUDY.clearRiseInches + ENTRANCE_STUDY.lintelDepthInches / 2;
  const halfOuterWidth = ENTRANCE_STUDY.outerWidthInches / 2;

  return (
    <group quaternion={PLATFORM_ENTRY_QUATERNION}>
      <mesh geometry={ENTRY_CASSETTE_GEOMETRY} receiveShadow renderOrder={0}>
        <meshStandardMaterial color="#71401f" roughness={0.84} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((side) => (
        <PlatformBeam
          key={`ENTRY-JAMB-${side}`}
          id={`ENTRY-JAMB-${side < 0 ? "L" : "R"}`}
          start={[side * jambCenterX, jambBottomY, entrySurfaceDepth(jambBottomY)]}
          end={[side * jambCenterX, lintelCenterY, entrySurfaceDepth(lintelCenterY)]}
          width={ENTRANCE_STUDY.jambWidthInches}
          depth={ENTRANCE_STUDY.jambWidthInches}
          color="#d29a58"
          labels={false}
        />
      ))}
      <PlatformBeam
        id="ENTRY-LINTEL"
        start={[-halfOuterWidth, lintelCenterY, entrySurfaceDepth(lintelCenterY)]}
        end={[halfOuterWidth, lintelCenterY, entrySurfaceDepth(lintelCenterY)]}
        width={ENTRANCE_STUDY.jambWidthInches}
        depth={ENTRANCE_STUDY.lintelDepthInches}
        color="#d9a561"
        labels={false}
      />
      {labels ? (
        <Html center position={[0, 31, entrySurfaceDepth(31) + 4.5]} className="platform-concept-label entry-concept-label">
          <span aria-hidden="true">ENTRANCE STUDY · 36 IN CLEAR × 58 IN RISE · REINFORCEMENT OPEN</span>
        </Html>
      ) : null}
    </group>
  );
}

function PlatformConcept({
  deck,
  frame,
  supports,
  labels,
}: {
  deck: boolean;
  frame: boolean;
  supports: boolean;
  labels: boolean;
}) {
  const entryRise = PLATFORM_CONCEPT.deckTopInches / PLATFORM_CONCEPT.entryStepCount;
  const entryRun = PLATFORM_CONCEPT.entryStepCount * PLATFORM_CONCEPT.entryTreadDepthInches;

  return (
    <group>
      {deck ? PLATFORM_DECK_BOARDS.map((board) => (
        <group key={board.id} position={[board.x, PLATFORM_DECK_CENTER_Y, board.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[board.length, PLATFORM_CONCEPT.deckThicknessInches, PLATFORM_CONCEPT.deckBoardFaceWidthInches]} />
            <meshStandardMaterial color="#bd8750" roughness={0.76} metalness={0} />
            <Edges color="#e8bd85" threshold={16} />
          </mesh>
          {labels ? <Html center position={[0, 1.4, 0]} className="model-label platform-label"><span aria-hidden="true">{board.id}</span></Html> : null}
        </group>
      )) : null}

      {frame ? (
        <>
          {PLATFORM_RIM_VERTICES.map((vertex, index) => (
            <PlatformBeam
              key={`P-R${index + 1}`}
              id={`P-R${String(index + 1).padStart(2, "0")}`}
              start={vertex}
              end={PLATFORM_RIM_VERTICES[(index + 1) % PLATFORM_RIM_VERTICES.length]}
              width={1.5}
              depth={PLATFORM_CONCEPT.frameDepthInches}
              color="#83562f"
              labels={labels}
            />
          ))}
          {PLATFORM_RIM_VERTICES.map((vertex, index) => {
            const direction = new THREE.Vector3(vertex[0], 0, vertex[2]).normalize();
            const startRadius = 4.75;
            const endRadius = PLATFORM_CONCEPT.radiusInches - 1.25;
            return (
              <PlatformBeam
                key={`P-J${index + 1}`}
                id={`P-J${String(index + 1).padStart(2, "0")}`}
                start={[startRadius * direction.x, PLATFORM_FRAME_CENTER_Y, startRadius * direction.z]}
                end={[endRadius * direction.x, PLATFORM_FRAME_CENTER_Y, endRadius * direction.z]}
                width={1.5}
                depth={PLATFORM_CONCEPT.frameDepthInches}
                color="#97663a"
                labels={labels}
              />
            );
          })}
          <mesh position={[0, PLATFORM_FRAME_CENTER_Y, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[4.5, 4.5, PLATFORM_CONCEPT.frameDepthInches, 10]} />
            <meshStandardMaterial color="#674327" roughness={0.74} metalness={0} />
            <Edges color="#d9b27c" threshold={12} />
          </mesh>
          {labels ? <Html center position={[0, 19, 0]} className="model-label platform-label"><span aria-hidden="true">P-H01</span></Html> : null}
        </>
      ) : null}

      {supports ? PLATFORM_SUPPORT_VERTICES.map((vertex, index) => (
        <group key={`P-S${index + 1}`} position={vertex}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[3.5, PLATFORM_CONCEPT.clearBelowFrameInches, 3.5]} />
            <meshStandardMaterial color="#76502f" roughness={0.82} />
            <Edges color="#d7b388" threshold={12} />
          </mesh>
          {labels ? <Html center position={[0, 7.2, 0]} className="model-label platform-label"><span aria-hidden="true">P-S{String(index + 1).padStart(2, "0")}</span></Html> : null}
        </group>
      )) : null}

      {deck ? (
        <group quaternion={PLATFORM_ENTRY_QUATERNION}>
          <mesh
            position={[0, PLATFORM_CONCEPT.deckTopInches + 0.125, (ENTRY_DOME_EDGE_APOTHEM + ENTRY_PLATFORM_EDGE_APOTHEM) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[PLATFORM_CONCEPT.entryWidthInches, 0.25, ENTRY_WALKWAY_LENGTH]} />
            <meshStandardMaterial color="#d39a58" roughness={0.74} metalness={0} />
            <Edges color="#ffe0ac" threshold={14} />
          </mesh>
          {Array.from({ length: PLATFORM_CONCEPT.entryStepCount }, (_, index) => {
            const treadTop = entryRise * (index + 1);
            const z = ENTRY_PLATFORM_EDGE_APOTHEM + (PLATFORM_CONCEPT.entryStepCount - index - 0.5) * PLATFORM_CONCEPT.entryTreadDepthInches;
            return (
              <mesh key={`P-E${index + 1}`} position={[0, treadTop - PLATFORM_CONCEPT.deckThicknessInches / 2, z]} castShadow receiveShadow>
                <boxGeometry args={[PLATFORM_CONCEPT.entryWidthInches, PLATFORM_CONCEPT.deckThicknessInches, PLATFORM_CONCEPT.entryTreadDepthInches]} />
                <meshStandardMaterial color="#c58e52" roughness={0.78} metalness={0} />
                <Edges color="#f3d19c" threshold={14} />
              </mesh>
            );
          })}
          {[-1, 1].map((side) => (
            <PlatformBeam
              key={`P-ES${side}`}
              id={`P-ES${side < 0 ? "L" : "R"}`}
              start={[side * (PLATFORM_CONCEPT.entryWidthInches / 2 - 3), entryRise / 2, ENTRY_PLATFORM_EDGE_APOTHEM + entryRun - PLATFORM_CONCEPT.entryTreadDepthInches / 2]}
              end={[side * (PLATFORM_CONCEPT.entryWidthInches / 2 - 3), PLATFORM_CONCEPT.deckTopInches - 2.25, ENTRY_PLATFORM_EDGE_APOTHEM + PLATFORM_CONCEPT.entryTreadDepthInches / 2]}
              width={1.5}
              depth={3.5}
              color="#7f512d"
              labels={false}
            />
          ))}
          {labels ? <Html center position={[0, PLATFORM_CONCEPT.deckTopInches + 4.5, ENTRY_PLATFORM_EDGE_APOTHEM + entryRun / 2]} className="platform-concept-label entry-concept-label"><span aria-hidden="true">36 IN APPROACH · 36 × 58 IN CROUCH ENTRY · LOAD PATH REDESIGN REQUIRED</span></Html> : null}
        </group>
      ) : null}

      {(deck || frame || supports) && labels ? (
        <Html center position={[0, 23.5, 0]} className="platform-concept-label">
          <span aria-hidden="true">PLATFORM SPATIAL CONCEPT · STRUCTURE + ACOUSTICS UNEVALUATED</span>
        </Html>
      ) : null}
    </group>
  );
}

function RedesignJoineryAssembly({
  valence,
}: {
  valence: AuditHubValence;
}) {
  const hub = useMemo(
    () => JOINERY_MODEL.installedHubs.find((candidate) => candidate.valence === valence),
    [valence],
  );
  const alignment = useMemo(() => hub ? detailAlignment(hub) : new THREE.Quaternion(), [hub]);
  if (!hub) return null;

  const tenons = hub.ports.map((port) => makeAxialTenonObb(
    port,
    PORT_NORMAL_REDESIGN_STUDY.shoulderSetback,
    PORT_NORMAL_REDESIGN_STUDY.tenon,
    "fixed-width-radial-tenon",
  ));
  const pockets = hub.ports.map((port) => makeAxialTenonObb(
    port,
    PORT_NORMAL_REDESIGN_STUDY.shoulderSetback,
    REDESIGN_POCKET_ENVELOPE,
    "fixed-width-radial-pocket",
  ));
  const memberStubs = hub.ports.map((port) => makeAxialMemberEnvelopeObb(
    port,
    PORT_NORMAL_REDESIGN_STUDY.shoulderSetback,
    2.75,
    MATERIAL.modeledSectionInches,
    "fixed-width-radial-member",
  ));
  const crossKeys = hub.ports.map((port) => makeAxialCrossKeyObb(
    port,
    PORT_NORMAL_REDESIGN_STUDY.shoulderSetback,
    REDESIGN_CAPTURE_STUDY.crossKeyDepth,
    REDESIGN_CAPTURE_STUDY.crossKeyLength,
    REDESIGN_CAPTURE_STUDY.crossKeyDiameter,
    "cross-key",
  ));
  const crossKeyReliefs = hub.ports.map((port) => makeAxialCrossKeyObb(
    port,
    PORT_NORMAL_REDESIGN_STUDY.shoulderSetback,
    REDESIGN_CAPTURE_STUDY.crossKeyDepth,
    REDESIGN_CAPTURE_STUDY.crossKeyReliefLength,
    REDESIGN_CAPTURE_STUDY.crossKeyReliefSection,
    "cross-key-relief",
  ));
  const clampSpindle = makeAxialCentralClampObb(
    hub,
    -REDESIGN_HUB_ENVELOPE.radialInboard,
    REDESIGN_HUB_ENVELOPE.radialOutboard,
    REDESIGN_CAPTURE_STUDY.clampSpindleSection,
    "center-spindle",
  );
  const clampBore = makeAxialCentralClampObb(
    hub,
    -REDESIGN_HUB_ENVELOPE.radialInboard,
    REDESIGN_HUB_ENVELOPE.radialOutboard,
    REDESIGN_CAPTURE_STUDY.clampBoreSection,
    "center-bore",
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={0}>
        <planeGeometry args={[14, 14, 14, 14]} />
        <meshBasicMaterial color="#789382" transparent opacity={0.055} wireframe depthWrite={false} />
      </mesh>
      <Line points={[[0, -2.4, 0], [0, 2.4, 0]]} color="#bfe4c3" lineWidth={1.25} transparent opacity={0.7} />
      <Html center position={[0, 2.7, 0]} className="audit-datum-label">
        <span aria-hidden="true">PORT-NORMAL TWO-SHELL CLEARANCE STUDY</span>
      </Html>

      <PortNormalTwoShellBody hub={hub} alignment={alignment} />
      <Line
        points={[[ -4.5, REDESIGN_HUB_ENVELOPE.radialSplit, 0], [4.5, REDESIGN_HUB_ENVELOPE.radialSplit, 0]]}
        color="#b8ddcf"
        lineWidth={1}
        transparent
        opacity={0.42}
      />
      <Html center position={[0, REDESIGN_HUB_ENVELOPE.radialSplit, -4.85]} className="audit-reference-label">
        <span aria-hidden="true">TWO SHELLS · SPLIT q = {REDESIGN_HUB_ENVELOPE.radialSplit.toFixed(3)} IN</span>
      </Html>

      {hub.ports.map((port, index) => {
        const axis = new THREE.Vector3(...port.axis).applyQuaternion(alignment).normalize();
        return (
          <group key={port.id}>
            <Line points={[[0, 0, 0], axis.clone().multiplyScalar(5.8)]} color={port.type === "S" ? "#f4d190" : "#c88b4a"} lineWidth={1} transparent opacity={0.38} />
            <Html center position={axis.clone().multiplyScalar(6.05)} className={`audit-port-label type-${port.type.toLowerCase()}`}>
              <span aria-hidden="true">P{index + 1} · {port.type}</span>
            </Html>
          </group>
        );
      })}

      {memberStubs.map((box, index) => (
        <AuditBox
          key={box.id}
          box={box}
          hub={hub}
          alignment={alignment}
          color={hub.ports[index].type === "S" ? "#d9a965" : "#b98246"}
          edgeColor="#f5d9a6"
          opacity={1}
        />
      ))}
      {pockets.map((box) => <WireBox key={box.id} box={box} hub={hub} alignment={alignment} />)}
      {tenons.map((box) => (
        <AuditBox
          key={box.id}
          box={box}
          hub={hub}
          alignment={alignment}
          color="#75c99f"
          edgeColor="#dcffec"
          opacity={0.92}
          emissive="#174f37"
          depthTest={false}
        />
      ))}
      {crossKeyReliefs.map((box) => <WireBox key={box.id} box={box} hub={hub} alignment={alignment} color="#b9e8f3" />)}
      {crossKeys.map((box) => <AuditCylinder key={box.id} box={box} hub={hub} alignment={alignment} />)}
      <WireBox box={clampBore} hub={hub} alignment={alignment} color="#fff0c2" />
      <AuditBox
        box={clampSpindle}
        hub={hub}
        alignment={alignment}
        color="#d6c29c"
        edgeColor="#fff4d8"
        opacity={0.96}
        emissive="#55411e"
        depthTest={false}
      />

      <mesh renderOrder={6}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshBasicMaterial color="#fff4e4" depthTest={false} />
      </mesh>
      <Html center position={[0, -2.75, 0]} className="audit-core-label redesign-core-label">
        <span aria-hidden="true">FIXED WIDTH-RADIAL POCKETS · STRUCTURE UNVERIFIED</span>
      </Html>
      {hub.valence === 4 ? (
        <Html center position={[0, -2.3, 4.5]} className="audit-reference-label">
          <span aria-hidden="true">H4 GLOBAL-UP BOTTOM LIMIT · −{REDESIGN_HUB_ENVELOPE.h4ClosureBelowDatum.toFixed(3)} IN</span>
        </Html>
      ) : null}
    </group>
  );
}

function CameraRig({
  viewMode,
  azimuthStep,
  zoom,
  resetNonce,
}: Pick<SceneProps, "viewMode" | "azimuthStep" | "zoom" | "resetNonce">) {
  const perspective = useRef<THREE.PerspectiveCamera>(null);
  const orthographic = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  const isJoinery = viewMode === "joinery";
  const isPlatform = viewMode === "platform";
  const isSite = viewMode === "site";
  const isOrthographic = viewMode === "plan" || viewMode === "front" || viewMode === "right";

  useEffect(() => {
    const target = isPlatform
      ? new THREE.Vector3(...PLATFORM_CAMERA_TARGET)
      : new THREE.Vector3(0, isSite ? 3.5 : viewMode === "plan" || isJoinery ? 0 : 3, 0);
    if (!isOrthographic && perspective.current) {
      if (isSite) {
        perspective.current.position.set(0, 6.5, 30);
        perspective.current.lookAt(target);
        perspective.current.updateProjectionMatrix();
        return;
      }
      const angle = Math.PI / 4 + azimuthStep * (Math.PI / 12);
      const aspect = size.width / Math.max(size.height, 1);
      const narrowViewportFit = size.width < 360 ? 1.12 : 1;
      const framedDistance = isJoinery
        ? aspect < 1 ? 14.5 * Math.max(1, 1.02 / aspect) : 14.5
        : isPlatform
          ? aspect < 1 ? Math.max(34, 26 * Math.max(1, 0.9 / aspect)) : size.height < 500 ? 30 : 26
        : aspect < 1
          ? Math.max(23.5, 20 * Math.max(1, 0.9 / aspect))
          : 19;
      const distance = (framedDistance * narrowViewportFit) / zoom;
      perspective.current.position.set(
        Math.sin(angle) * distance,
        distance * (isJoinery ? 0.48 : 0.55),
        Math.cos(angle) * distance,
      );
      perspective.current.lookAt(target);
      perspective.current.updateProjectionMatrix();
    }
    if (isOrthographic && orthographic.current) {
      const distance = 18;
      if (viewMode === "plan") orthographic.current.position.set(0, distance, 0.001);
      if (viewMode === "front") orthographic.current.position.set(0, 3.2, distance);
      if (viewMode === "right") orthographic.current.position.set(distance, 3.2, 0);
      const horizontalFit = size.width / 17;
      const verticalFit = size.height / (viewMode === "plan" ? 17 : 10);
      orthographic.current.zoom = Math.min(horizontalFit, verticalFit) * zoom;
      orthographic.current.lookAt(target);
      orthographic.current.updateProjectionMatrix();
    }
  }, [azimuthStep, isJoinery, isOrthographic, isPlatform, isSite, resetNonce, size.height, size.width, viewMode, zoom]);

  return (
    <>
      <PerspectiveCamera ref={perspective} makeDefault={!isOrthographic} fov={38} near={0.1} far={100} />
      <OrthographicCamera ref={orthographic} makeDefault={isOrthographic} near={0.1} far={100} />
    </>
  );
}

function GeodesicAssembly(props: SceneProps) {
  const selectedMember = MEMBERS.find((member) => member.pieceId === props.selectedMemberId) ?? null;
  const selectedEndpoints = new Set(selectedMember ? [selectedMember.start, selectedMember.end] : []);
  const platformContext = props.viewMode === "platform";
  const entranceStudy = platformContext;
  const platformShown = platformContext && (props.layers.platformDeck || props.layers.platformFrame || props.layers.platformSupports);
  const domeDatumInches = platformContext ? PLATFORM_CONCEPT.deckTopInches : 0;

  return (
    <>
      <group scale={INCHES_TO_FEET}>
        <group position={[0, domeDatumInches, 0]}>
          {props.layers.panels ? (
            <mesh geometry={entranceStudy ? ENTRY_PANEL_GEOMETRY : PANEL_GEOMETRY} renderOrder={0} receiveShadow>
              <meshStandardMaterial
                color="#ffffff"
                vertexColors
                flatShading
                roughness={0.8}
                metalness={0}
                emissive="#2b1207"
                emissiveIntensity={0.14}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
              />
            </mesh>
          ) : null}

          {(props.layers.timber || props.layers.labels) ? MEMBERS.map((member) => {
            if (entranceStudy && ENTRY_HIDDEN_MEMBER_IDS.has(member.pieceId)) return null;
            const filtered = props.memberFilter !== "all" && member.type !== props.memberFilter;
            const isolated = props.isolateSelected && props.selectedMemberId !== member.pieceId;
            return (
              <TimberMember
                key={member.pieceId}
                member={member}
                showBody={props.layers.timber}
                selected={props.selectedMemberId === member.pieceId}
                muted={filtered || isolated}
                explode={props.explode}
                labels={props.layers.labels}
                selectionEnabled={props.selectionEnabled}
                onSelect={props.onSelectMember}
              />
            );
          }) : null}

          {(props.layers.hubs || props.layers.labels) ? DOME_MODEL.vertices.map((vertex) => (
            entranceStudy && ENTRY_HIDDEN_NODE_IDS.has(vertex.id) ? null :
            <Hub
              key={vertex.id}
              vertexId={vertex.id}
              showBody={props.layers.hubs}
              explode={props.explode}
              labels={props.layers.labels}
              selectedEndpoint={selectedEndpoints.has(vertex.id)}
            />
          )) : null}
          {entranceStudy && props.layers.timber ? <EntrancePortal labels={props.layers.labels} /> : null}
        </group>

        {platformShown ? (
          <PlatformConcept
            deck={props.layers.platformDeck}
            frame={props.layers.platformFrame}
            supports={props.layers.platformSupports}
            labels={props.layers.labels}
          />
        ) : null}
      </group>

      {props.layers.dimensions ? <group position={[0, domeDatumInches * INCHES_TO_FEET, 0]}><DimensionLayer /></group> : null}
      {props.layers.ground ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
            <circleGeometry args={[platformContext ? 10.5 : 7.15, 10]} />
            <meshStandardMaterial color="#070b08" roughness={0.99} />
          </mesh>
          <gridHelper args={[32, 32, "#243029", "#101612"]} position={[0, -0.065, 0]} />
          <axesHelper args={[1.5]} position={[0, 0.02, 0]} />
        </>
      ) : null}
    </>
  );
}

function DomeScene(props: SceneProps) {
  const isJoinery = props.viewMode === "joinery";
  const isPlatform = props.viewMode === "platform";
  const isSite = props.viewMode === "site";
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const jointBackground = "#020704";

  useEffect(() => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
    const frame = window.requestAnimationFrame(() => {
      setWebglUnavailable(!context);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div
        className="canvas-shell"
        role="img"
        aria-label={isJoinery
          ? `Port-normal two-shell spatial clearance study for a ${props.auditHubValence}-way hub. Fixed width-radial pockets, cross-keys, and a center spindle are shown. Physical fit and structure remain unverified; accessible results follow the viewport.`
          : isSite
            ? "Perspective site study using the exact audited 65-member dome model over Jantz's cleared backyard. Placement and fit are approximate until the site is measured."
            : isPlatform
              ? `Unengineered entrance and 16 foot decagonal platform study. Three approach steps align with a ${ENTRANCE_STUDY.clearWidthInches} inch clear by ${ENTRANCE_STUDY.clearRiseInches} inch rise crouch opening. Six canonical face panels, seven canonical members, and node V007 are hidden only in this optional view; the verified 65-member reference remains unchanged. The schematic replacement cassette, all-wood joints, load path, door, weather seals, foundations, guards, fabrication, and acoustics are not approved.`
              : props.layers.panels
                ? "Interactive 3D wood-shell concept showing 40 opaque triangular infill surfaces behind the complete timber grid. This is a visual finish study, not a panel fabrication schedule, weather enclosure, structural diaphragm, or verified acoustic design. Open Parts or Audit for keyboard-accessible geometry details."
                : "Interactive 3D exposed timber model. Open Parts or Audit for keyboard-accessible member details."}
      >
        <Canvas
          aria-hidden="true"
          dpr={[1, 1.5]}
          frameloop={props.autoRotate ? "always" : "demand"}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          shadows="basic"
          onCreated={() => setWebglUnavailable(false)}
          onPointerMissed={() => { if (!isJoinery && props.selectionEnabled) props.onSelectMember(null); }}
          fallback={null}
        >
          <CameraRig viewMode={props.viewMode} azimuthStep={props.azimuthStep} zoom={props.zoom} resetNonce={props.resetNonce} />
          {!isSite ? <color attach="background" args={[isJoinery ? jointBackground : "#020403"]} /> : null}
          {!isSite && !isPlatform ? <fog attach="fog" args={[
            isJoinery ? jointBackground : "#020403",
            isJoinery ? 18 : props.mobileLayout ? 36 : 20,
            isJoinery ? 40 : props.mobileLayout ? 68 : 38,
          ]} /> : null}
          <hemisphereLight args={["#dce2d3", "#010201", 1.05]} />
          <directionalLight position={[8, 14, 9]} intensity={4.15} color="#fff0d2" castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-9, 6, -7]} intensity={0.5} color="#8eb49b" />
          <pointLight position={[-5, 7, -8]} intensity={18} distance={24} decay={2} color="#c77835" />
          <Suspense fallback={null}>
            {isJoinery
              ? <RedesignJoineryAssembly valence={props.auditHubValence} />
              : <GeodesicAssembly {...props} />}
            {isSite ? <ContactShadows position={[0, -0.04, 0]} opacity={0.5} scale={15} blur={2.5} far={10} frames={1} /> : null}
          </Suspense>
          <OrbitControls
            makeDefault
            target={isJoinery ? [0, 0, 0] : isPlatform ? PLATFORM_CAMERA_TARGET : [0, 3, 0]}
            enableRotate={props.viewMode === "iso" || props.viewMode === "platform" || isJoinery}
            enableZoom={!isSite}
            enablePan={false}
            autoRotate={props.autoRotate && (props.viewMode === "iso" || props.viewMode === "platform")}
            autoRotateSpeed={0.32}
            minDistance={isJoinery ? 4.5 : props.mobileLayout ? isPlatform ? 24 : 18 : 8}
            maxDistance={isJoinery ? 32 : isPlatform ? 80 : props.mobileLayout ? 48 : 32}
            minPolarAngle={isJoinery ? Math.PI * 0.12 : Math.PI * 0.2}
            maxPolarAngle={isJoinery ? Math.PI * 0.88 : Math.PI / 2 - 0.03}
            rotateSpeed={0.62}
            zoomSpeed={0.8}
            enableDamping
            dampingFactor={0.075}
            touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
            onStart={props.onInteractionStart}
          />
        </Canvas>
      </div>
      {webglUnavailable ? <div className="webgl-fallback accessible-webgl-fallback" role="status">3D rendering is unavailable. Use Parts and Audit for the complete accessible geometry reference.</div> : null}
    </>
  );
}

export default memo(DomeScene);
