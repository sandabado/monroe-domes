"use client";

import {
  Edges,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  buildRedesignHubHalfspaces,
  intersectHalfspaceTriples,
  makeAxialCentralClampObb,
  makeAxialCrossKeyObb,
  makeAxialMemberEnvelopeObb,
  makeAxialTenonObb,
  makeTenonObb,
  PORT_NORMAL_REDESIGN_STUDY,
  REDESIGN_CAPTURE_STUDY,
  REDESIGN_HUB_ENVELOPE,
  REDESIGN_POCKET_ENVELOPE,
  tangentFaceSetback,
  type InstalledHub,
  type OrientedBox,
  type RedesignHubHalfspace,
  type TenonRollOrientation,
} from "@/lib/joinery";
import {
  DOME_MODEL,
  JOINERY_MODEL,
  MATERIAL,
  MEMBERS,
  PLATFORM_CONCEPT,
  REJECTED_HUB,
  type DomeMember,
} from "@/lib/spec";

export type ViewMode = "iso" | "plan" | "front" | "right" | "joinery";
export type MemberFilter = "all" | "S" | "L";
export type AuditHubValence = 4 | 5 | 6;
export type JointStudyMode = "original" | "redesign";

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
  auditRoll: TenonRollOrientation;
  jointStudyMode: JointStudyMode;
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

function makePanelGeometry() {
  const positions: number[] = [];
  for (const face of DOME_MODEL.faces) {
    for (const vertexId of face.vertices) {
      const vertex = vertexById.get(vertexId);
      if (vertex) positions.push(...vertex.position);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const PANEL_GEOMETRY = makePanelGeometry();

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

function makeMemberStub(port: InstalledHub["ports"][number], tangentApothem: number): OrientedBox {
  const setback = tangentFaceSetback(
    tangentApothem,
    port.axis,
    port.outwardNormal,
  );
  const length = 2.35;
  const centerDistance = setback + length / 2;
  return {
    id: `${port.id}:member-stub`,
    center: [
      port.hubPosition[0] + port.axis[0] * centerDistance,
      port.hubPosition[1] + port.axis[1] * centerDistance,
      port.hubPosition[2] + port.axis[2] * centerDistance,
    ],
    axes: [port.axis, port.tangentialRollAxis, port.radialRollAxis],
    halfExtents: [length / 2, MATERIAL.modeledSectionInches / 2, MATERIAL.modeledSectionInches / 2],
  };
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
  onSelect,
}: {
  member: DomeMember;
  showBody: boolean;
  selected: boolean;
  muted: boolean;
  explode: number;
  labels: boolean;
  onSelect: (pieceId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const transform = useMemo(() => memberTransform(member, explode), [member, explode]);
  const opacity = selected ? 1 : muted ? 0.075 : hovered ? 1 : 0.94;
  const color = selected ? "#ffd37f" : member.type === "S" ? "#d9a965" : "#b98246";
  const interactive = !muted || selected;

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
            dispose={null}
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
              dispose={null}
              onClick={select}
              onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
              onPointerOut={() => setHovered(false)}
            >
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
        <meshStandardMaterial color={color} roughness={0.78} metalness={0.01} />
        <Edges color="#e8cda4" threshold={14} />
      </mesh>
      {labels ? <Html center position={[0, depth * 0.8, 0]} className="model-label platform-label"><span aria-hidden="true">{id}</span></Html> : null}
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
  const radius = PLATFORM_CONCEPT.radiusInches;
  const angleOffset = Math.PI / 10;
  const rimVertices = Array.from({ length: 10 }, (_, index) => {
    const angle = angleOffset + index * Math.PI / 5;
    return [radius * Math.cos(angle), 14.75, radius * Math.sin(angle)] as [number, number, number];
  });
  const deckBoards = Array.from({ length: PLATFORM_CONCEPT.deckBoardCount }, (_, index) => {
    const z = (index - (PLATFORM_CONCEPT.deckBoardCount - 1) / 2) * 5.5;
    const halfLength = Math.sqrt(Math.max(0, radius * radius - z * z));
    return { id: `P-D${String(index + 1).padStart(2, "0")}`, z, length: halfLength * 2 };
  });

  return (
    <group>
      {deck ? deckBoards.map((board) => (
        <group key={board.id} position={[0, 18.25, board.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[board.length, PLATFORM_CONCEPT.deckThicknessInches, 5.35]} />
            <meshStandardMaterial color="#bd8750" roughness={0.76} metalness={0.01} />
            <Edges color="#e8bd85" threshold={16} />
          </mesh>
          {labels ? <Html center position={[0, 1.4, 0]} className="model-label platform-label"><span aria-hidden="true">{board.id}</span></Html> : null}
        </group>
      )) : null}

      {frame ? (
        <>
          {rimVertices.map((vertex, index) => (
            <PlatformBeam
              key={`P-R${index + 1}`}
              id={`P-R${String(index + 1).padStart(2, "0")}`}
              start={vertex}
              end={rimVertices[(index + 1) % rimVertices.length]}
              width={1.5}
              depth={PLATFORM_CONCEPT.frameDepthInches}
              color="#83562f"
              labels={labels}
            />
          ))}
          {rimVertices.map((vertex, index) => {
            const angle = angleOffset + index * Math.PI / 5;
            const startRadius = 4.75;
            const endRadius = radius - 1.25;
            return (
              <PlatformBeam
                key={`P-J${index + 1}`}
                id={`P-J${String(index + 1).padStart(2, "0")}`}
                start={[startRadius * Math.cos(angle), 14.75, startRadius * Math.sin(angle)]}
                end={[endRadius * Math.cos(angle), 14.75, endRadius * Math.sin(angle)]}
                width={1.5}
                depth={PLATFORM_CONCEPT.frameDepthInches}
                color="#97663a"
                labels={labels}
              />
            );
          })}
          <mesh position={[0, 14.75, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[4.5, 4.5, PLATFORM_CONCEPT.frameDepthInches, 10]} />
            <meshStandardMaterial color="#674327" roughness={0.74} />
            <Edges color="#d9b27c" threshold={12} />
          </mesh>
          {labels ? <Html center position={[0, 19, 0]} className="model-label platform-label"><span aria-hidden="true">P-H01</span></Html> : null}
        </>
      ) : null}

      {supports ? rimVertices.map((vertex, index) => (
        <group key={`P-S${index + 1}`} position={[vertex[0], PLATFORM_CONCEPT.clearBelowFrameInches / 2, vertex[2]]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[3.5, PLATFORM_CONCEPT.clearBelowFrameInches, 3.5]} />
            <meshStandardMaterial color="#76502f" roughness={0.82} />
            <Edges color="#d7b388" threshold={12} />
          </mesh>
          {labels ? <Html center position={[0, 7.2, 0]} className="model-label platform-label"><span aria-hidden="true">P-S{String(index + 1).padStart(2, "0")}</span></Html> : null}
        </group>
      )) : null}

      {(deck || frame || supports) ? (
        <Html center position={[0, 23.5, 0]} className="platform-concept-label">
          <span aria-hidden="true">PLATFORM CONCEPT · UNENGINEERED · NO ACOUSTIC CLAIM</span>
        </Html>
      ) : null}
    </group>
  );
}

function OriginalJoineryAssembly({
  valence,
  orientation,
}: {
  valence: AuditHubValence;
  orientation: TenonRollOrientation;
}) {
  const hub = useMemo(
    () => JOINERY_MODEL.installedHubs.find((candidate) => candidate.valence === valence),
    [valence],
  );
  const audit = useMemo(
    () => JOINERY_MODEL.collisionAudits.find((candidate) => candidate.orientation === orientation),
    [orientation],
  );
  if (!hub || !audit) return null;

  const alignment = detailAlignment(hub);
  const tenons = hub.ports.map((port) => makeTenonObb(
    port,
    audit.apothem,
    audit.tenon,
    orientation,
  ));
  const memberStubs = hub.ports.map((port) => makeMemberStub(port, audit.apothem));

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={0}>
        <planeGeometry args={[11, 11, 11, 11]} />
        <meshBasicMaterial color="#789382" transparent opacity={0.07} wireframe depthWrite={false} />
      </mesh>
      <Line points={[[0, 0, 0], [0, 3.15, 0]]} color="#bfe4c3" lineWidth={1.5} />
      <Html center position={[0, 3.42, 0]} className="audit-datum-label">
        <span aria-hidden="true">OUTWARD RADIAL NORMAL</span>
      </Html>

      <mesh position={[0, 0, 0]} renderOrder={2}>
        <cylinderGeometry args={[
          audit.apothem,
          audit.apothem,
          REJECTED_HUB.radialThicknessInches,
          24,
        ]} />
        <meshBasicMaterial color="#ff806c" transparent opacity={0.48} wireframe depthWrite={false} />
      </mesh>
      <Html center position={[0, 1.4, 0]} className="audit-reference-label">
        <span aria-hidden="true">TANGENT REFERENCE · APOTHEM {audit.apothem.toFixed(3)} IN</span>
      </Html>

      {hub.ports.map((port, index) => {
        const axis = new THREE.Vector3(...port.axis).applyQuaternion(alignment).normalize();
        const labelPosition = axis.clone().multiplyScalar(4.35);
        return (
          <group key={port.id}>
            <Line
              points={[[0, 0, 0], axis.clone().multiplyScalar(4.05)]}
              color={port.type === "S" ? "#f4d190" : "#c88b4a"}
              lineWidth={1.25}
              transparent
              opacity={0.7}
            />
            <Html center position={labelPosition} className={`audit-port-label type-${port.type.toLowerCase()}`}>
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

      {tenons.map((box) => (
        <AuditBox
          key={box.id}
          box={box}
          hub={hub}
          alignment={alignment}
          color="#ff4937"
          edgeColor="#ffd0c8"
          opacity={0.52}
          emissive="#8f0800"
        />
      ))}

      <mesh renderOrder={5}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshBasicMaterial color="#fff4e4" />
      </mesh>
      <Html center position={[0, -1.55, 0]} className="audit-core-label">
        <span aria-hidden="true">NODE CENTER · TENON VOLUMES OVERLAP</span>
      </Html>
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
  if (!hub) return null;

  const alignment = detailAlignment(hub);
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
  const isOrthographic = viewMode === "plan" || viewMode === "front" || viewMode === "right";

  useEffect(() => {
    const target = new THREE.Vector3(0, viewMode === "plan" || isJoinery ? 0 : 3, 0);
    if (!isOrthographic && perspective.current) {
      const angle = Math.PI / 4 + azimuthStep * (Math.PI / 12);
      const aspect = size.width / Math.max(size.height, 1);
      const narrowViewportFit = size.width < 360 ? 1.12 : 1;
      const framedDistance = isJoinery
        ? aspect < 1 ? 14.5 * Math.max(1, 1.02 / aspect) : 14.5
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
  }, [azimuthStep, isJoinery, isOrthographic, resetNonce, size.height, size.width, viewMode, zoom]);

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

  return (
    <>
      <group scale={INCHES_TO_FEET}>
        {props.layers.panels ? (
          <mesh geometry={PANEL_GEOMETRY} dispose={null} renderOrder={0}>
            <meshPhysicalMaterial
              color="#a9c4bb"
              transparent
              opacity={0.16}
              roughness={0.18}
              metalness={0.05}
              transmission={0.12}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ) : null}

        {(props.layers.timber || props.layers.labels) ? MEMBERS.map((member) => {
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
              onSelect={props.onSelectMember}
            />
          );
        }) : null}

        {(props.layers.hubs || props.layers.labels) ? DOME_MODEL.vertices.map((vertex) => (
          <Hub
            key={vertex.id}
            vertexId={vertex.id}
            showBody={props.layers.hubs}
            explode={props.explode}
            labels={props.layers.labels}
            selectedEndpoint={selectedEndpoints.has(vertex.id)}
          />
        )) : null}

        {(props.layers.platformDeck || props.layers.platformFrame || props.layers.platformSupports) ? (
          <PlatformConcept
            deck={props.layers.platformDeck}
            frame={props.layers.platformFrame}
            supports={props.layers.platformSupports}
            labels={props.layers.labels}
          />
        ) : null}
      </group>

      {props.layers.dimensions ? <DimensionLayer /> : null}
      {props.layers.ground ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
            <circleGeometry args={[7.15, 10]} />
            <meshStandardMaterial color="#070b08" roughness={0.99} />
          </mesh>
          <gridHelper args={[32, 32, "#243029", "#101612"]} position={[0, -0.065, 0]} />
          <axesHelper args={[1.5]} position={[0, 0.02, 0]} />
        </>
      ) : null}
    </>
  );
}

export default function DomeScene(props: SceneProps) {
  const isJoinery = props.viewMode === "joinery";
  const jointBackground = props.jointStudyMode === "original" ? "#090303" : "#020704";
  return (
    <div
      className="canvas-shell"
      role="img"
      aria-label={isJoinery
        ? props.jointStudyMode === "original"
          ? `Original tenon clearance audit for a ${props.auditHubValence}-way hub. The proposed tenon volumes overlap; accessible results follow the viewport.`
          : `Port-normal two-shell clearance study for a ${props.auditHubValence}-way hub. Fixed width-radial pockets, cross-keys, and a center spindle are shown. Structure remains unverified; accessible results follow the viewport.`
        : "Interactive 3D model. A complete keyboard-accessible member schedule follows the viewport."}
    >
      <Canvas
        aria-hidden="true"
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        shadows="percentage"
        onPointerMissed={() => { if (!isJoinery) props.onSelectMember(null); }}
        fallback={<div className="webgl-fallback">3D rendering is unavailable. Use the member schedule and geometry audit below.</div>}
      >
        <CameraRig viewMode={props.viewMode} azimuthStep={props.azimuthStep} zoom={props.zoom} resetNonce={props.resetNonce} />
        <color attach="background" args={[isJoinery ? jointBackground : "#020403"]} />
        <fog attach="fog" args={[isJoinery ? jointBackground : "#020403", isJoinery ? 18 : 20, isJoinery ? 40 : 38]} />
        <hemisphereLight args={["#dce2d3", "#010201", 1.05]} />
        <directionalLight position={[8, 14, 9]} intensity={4.15} color="#fff0d2" castShadow shadow-mapSize={[2048, 2048]} />
        <directionalLight position={[-9, 6, -7]} intensity={0.5} color="#8eb49b" />
        <pointLight position={[-5, 7, -8]} intensity={18} distance={24} decay={2} color="#c77835" />
        <Suspense fallback={null}>
          {isJoinery
            ? props.jointStudyMode === "original"
              ? <OriginalJoineryAssembly valence={props.auditHubValence} orientation={props.auditRoll} />
              : <RedesignJoineryAssembly valence={props.auditHubValence} />
            : <GeodesicAssembly {...props} />}
        </Suspense>
        <OrbitControls
          makeDefault
          target={isJoinery ? [0, 0, 0] : [0, 3, 0]}
          enableRotate={props.viewMode === "iso" || isJoinery}
          enablePan={false}
          autoRotate={props.autoRotate && props.viewMode === "iso"}
          autoRotateSpeed={0.32}
          minDistance={isJoinery ? 4.5 : 8}
          maxDistance={isJoinery ? 32 : 32}
          enableDamping
          dampingFactor={0.07}
        />
      </Canvas>
    </div>
  );
}
