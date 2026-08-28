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
import {
  makeTenonObb,
  tangentFaceSetback,
  type InstalledHub,
  type OrientedBox,
  type TenonRollOrientation,
} from "@/lib/joinery";
import {
  DOME_MODEL,
  JOINERY_MODEL,
  MATERIAL,
  MEMBERS,
  REJECTED_HUB,
  type DomeMember,
} from "@/lib/spec";

export type ViewMode = "iso" | "plan" | "front" | "right" | "joinery";
export type MemberFilter = "all" | "S" | "L";
export type AuditHubValence = 4 | 5 | 6;

export type LayerState = {
  timber: boolean;
  hubs: boolean;
  panels: boolean;
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
}: {
  box: OrientedBox;
  hub: InstalledHub;
  alignment: THREE.Quaternion;
  color: string;
  edgeColor: string;
  opacity: number;
  emissive?: string;
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
      />
      <Edges color={edgeColor} threshold={1} />
    </mesh>
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

function JoineryAuditAssembly({
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
  return (
    <div
      className="canvas-shell"
      role="img"
      aria-label={isJoinery
        ? `Connection collision audit for a ${props.auditHubValence}-way hub. Exact proposed tenon volumes overlap; accessible results follow the viewport.`
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
        <color attach="background" args={[isJoinery ? "#090303" : "#020403"]} />
        <fog attach="fog" args={[isJoinery ? "#090303" : "#020403", isJoinery ? 18 : 20, isJoinery ? 40 : 38]} />
        <hemisphereLight args={["#dce2d3", "#010201", 1.05]} />
        <directionalLight position={[8, 14, 9]} intensity={4.15} color="#fff0d2" castShadow shadow-mapSize={[2048, 2048]} />
        <directionalLight position={[-9, 6, -7]} intensity={0.5} color="#8eb49b" />
        <pointLight position={[-5, 7, -8]} intensity={18} distance={24} decay={2} color="#c77835" />
        <Suspense fallback={null}>
          {isJoinery
            ? <JoineryAuditAssembly valence={props.auditHubValence} orientation={props.auditRoll} />
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
