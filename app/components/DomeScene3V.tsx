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
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DOME_MODEL_3V, MEMBERS_3V, PANELS_3V, type DomeMember3V } from "@/lib/spec3v";
import type { V3StrutType } from "@/lib/geodesic3v";

export type V3ViewMode = "iso" | "plan" | "front" | "right";
export type V3MemberFilter = "all" | V3StrutType;
export type V3LayerState = {
  timber: boolean;
  hubs: boolean;
  panels: boolean;
  dimensions: boolean;
  labels: boolean;
  ground: boolean;
};

type SceneProps = {
  layers: V3LayerState;
  memberFilter: V3MemberFilter;
  selectedMemberId: string | null;
  isolateSelected: boolean;
  explode: number;
  autoRotate: boolean;
  viewMode: V3ViewMode;
  azimuthStep: number;
  zoom: number;
  resetNonce: number;
  mobileLayout: boolean;
  onInteractionStart: () => void;
  onSelectMember: (pieceId: string | null) => void;
};

const INCHES_TO_FEET = 1 / 12;
const UP = new THREE.Vector3(0, 1, 0);
const SPHERE_CENTER = new THREE.Vector3(0, DOME_MODEL_3V.sphereCenterHeight, 0);
// Arbitrary screen-space proxy thickness. This is not a selected stock section.
const VISUAL_AXIS_PRISM_INCHES = 1.2;
const BEAM_GEOMETRY = new THREE.BoxGeometry(VISUAL_AXIS_PRISM_INCHES, 1, VISUAL_AXIS_PRISM_INCHES);
const HIT_GEOMETRY = new THREE.BoxGeometry(4.8, 1, 4.8);
const vertexById = new Map(DOME_MODEL_3V.vertices.map((vertex) => [vertex.id, vertex]));
const panelByFaceId = new Map(PANELS_3V.map((panel) => [panel.faceId, panel]));
const classColors: Record<V3StrutType, string> = {
  A: "#edc789",
  B: "#cf914f",
  C: "#a76435",
};

function makePanelGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const [faceIndex, face] of DOME_MODEL_3V.faces.entries()) {
    const points = face.vertices.map((vertexId) => {
      const vertex = vertexById.get(vertexId);
      if (!vertex) throw new Error(`Unable to resolve 3V panel vertex ${vertexId}.`);
      return new THREE.Vector3(...vertex.position);
    });
    const outward = new THREE.Vector3().crossVectors(
      points[1].clone().sub(points[0]),
      points[2].clone().sub(points[0]),
    ).normalize();
    const centroid = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
    if (outward.dot(centroid.clone().sub(SPHERE_CENTER)) < 0) outward.negate();
    const panel = panelByFaceId.get(face.id);
    const familyBase = panel?.family === "PENT" ? "#c07a3f" : "#86502e";
    const color = new THREE.Color(familyBase).offsetHSL(0, 0, (faceIndex % 5 - 2) * 0.022);
    const offset = outward.multiplyScalar(-0.78);
    for (const point of points) {
      positions.push(...point.clone().add(offset).toArray());
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const PANEL_GEOMETRY = makePanelGeometry();

function memberTransform(member: DomeMember3V, explode: number) {
  const start = vertexById.get(member.start);
  const end = vertexById.get(member.end);
  if (!start || !end) throw new Error(`Unable to resolve endpoints for ${member.pieceId}.`);
  const startVector = new THREE.Vector3(...start.position);
  const endVector = new THREE.Vector3(...end.position);
  const direction = endVector.clone().sub(startVector);
  const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5);
  const radial = midpoint.clone().sub(SPHERE_CENTER).normalize().multiplyScalar(explode * 11);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
  return { position: midpoint.add(radial), quaternion, length: direction.length() };
}

const TimberMember = memo(function TimberMember({
  member,
  showBody,
  selected,
  explode,
  labels,
  onSelect,
}: {
  member: DomeMember3V;
  showBody: boolean;
  selected: boolean;
  explode: number;
  labels: boolean;
  onSelect: (pieceId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const transform = useMemo(() => memberTransform(member, explode), [explode, member]);
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
            castShadow
            receiveShadow
            onClick={select}
            onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
            onPointerOut={() => setHovered(false)}
          >
            <meshStandardMaterial
              color={selected ? "#ffe3a4" : classColors[member.type]}
              emissive={selected ? "#a76121" : "#120702"}
              emissiveIntensity={selected ? 0.45 : 0.08}
              roughness={0.72}
              metalness={0}
            />
            {selected || hovered ? <Edges color={selected ? "#fff8df" : "#eecb91"} threshold={10} /> : null}
          </mesh>
          <mesh
            geometry={HIT_GEOMETRY}
            scale={[1, transform.length, 1]}
            onClick={select}
            onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
            onPointerOut={() => setHovered(false)}
          >
            <meshBasicMaterial visible={false} />
          </mesh>
        </>
      ) : null}
      {selected || labels ? (
        <Html center position={[0, 0, 2.9]} className={selected ? "model-label selected" : "model-label"}>
          <span aria-hidden="true">{member.pieceId}</span>
        </Html>
      ) : null}
    </group>
  );
});

const Hub = memo(function Hub({ vertexId, showBody, explode, labels, selectedEndpoint }: {
  vertexId: string;
  showBody: boolean;
  explode: number;
  labels: boolean;
  selectedEndpoint: boolean;
}) {
  const vertex = vertexById.get(vertexId);
  if (!vertex) return null;
  const position = new THREE.Vector3(...vertex.position);
  const radial = position.clone().sub(SPHERE_CENTER).normalize();
  position.add(radial.clone().multiplyScalar(explode * 11));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, radial);
  return (
    <group position={position} quaternion={quaternion}>
      {showBody ? (
        <mesh castShadow>
          <sphereGeometry args={[1.15, 14, 10]} />
          <meshStandardMaterial
            color={selectedEndpoint ? "#f4d18e" : vertex.isBoundary ? "#7d3f31" : "#9a4b3c"}
            emissive={selectedEndpoint ? "#8e5e23" : "#2c0704"}
            emissiveIntensity={selectedEndpoint ? 0.34 : 0.16}
            roughness={0.58}
            metalness={0}
          />
          {selectedEndpoint ? <Edges color="#fff3ce" threshold={28} /> : null}
        </mesh>
      ) : null}
      {labels ? (
        <Html center position={[0, 3.5, 0]} className="model-label node-label">
          <span aria-hidden="true">{vertex.id} · {vertex.valence}W</span>
        </Html>
      ) : null}
    </group>
  );
});

function DimensionLayer() {
  const height = DOME_MODEL_3V.peakHeight;
  const halfBase = DOME_MODEL_3V.audit.boundary.maximumNodePairSpanInches / 2;
  return (
    <group>
      <Line points={[[-halfBase, 0, 84], [halfBase, 0, 84]]} color="#b7c9ae" lineWidth={1} />
      <Line points={[[84, 0, 0], [84, height, 0]]} color="#b7c9ae" lineWidth={1} />
      <Html center position={[0, 1.3, 84]} className="dimension-label"><span aria-hidden="true">152.000 IN MAX BOUNDARY-NODE SPAN</span></Html>
      <Html center position={[84, height / 2, 0]} className="dimension-label vertical"><span aria-hidden="true">{height.toFixed(3)} IN LOW-TIER RISE</span></Html>
    </group>
  );
}

function CameraRig({ viewMode, azimuthStep, zoom, resetNonce }: Pick<SceneProps, "viewMode" | "azimuthStep" | "zoom" | "resetNonce">) {
  const perspective = useRef<THREE.PerspectiveCamera>(null);
  const orthographic = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  const isOrthographic = viewMode !== "iso";

  useEffect(() => {
    const target = new THREE.Vector3(0, 3.35, 0);
    if (!isOrthographic && perspective.current) {
      const angle = Math.PI / 4 + azimuthStep * Math.PI / 12;
      const aspect = size.width / Math.max(size.height, 1);
      const fit = aspect < 1 ? Math.max(23.5, 20.5 * Math.max(1, 0.9 / aspect)) : 21;
      const distance = fit / zoom;
      perspective.current.position.set(Math.sin(angle) * distance, distance * 0.54, Math.cos(angle) * distance);
      perspective.current.lookAt(target);
      perspective.current.updateProjectionMatrix();
    }
    if (isOrthographic && orthographic.current) {
      const distance = 20;
      if (viewMode === "plan") orthographic.current.position.set(0, distance, 0.001);
      if (viewMode === "front") orthographic.current.position.set(0, 3.8, distance);
      if (viewMode === "right") orthographic.current.position.set(distance, 3.8, 0);
      const horizontalFit = size.width / 17.5;
      const verticalFit = size.height / (viewMode === "plan" ? 17.5 : 11.5);
      orthographic.current.zoom = Math.min(horizontalFit, verticalFit) * zoom;
      orthographic.current.lookAt(target);
      orthographic.current.updateProjectionMatrix();
    }
  }, [azimuthStep, isOrthographic, resetNonce, size.height, size.width, viewMode, zoom]);

  return (
    <>
      <PerspectiveCamera ref={perspective} makeDefault={!isOrthographic} fov={38} near={0.1} far={120} />
      <OrthographicCamera ref={orthographic} makeDefault={isOrthographic} near={0.1} far={120} />
    </>
  );
}

function Assembly(props: SceneProps) {
  const selected = MEMBERS_3V.find((member) => member.pieceId === props.selectedMemberId) ?? null;
  const selectedEndpoints = new Set(selected ? [selected.start, selected.end] : []);
  const visibleMembers = props.isolateSelected && selected
    ? [selected]
    : props.memberFilter === "all"
      ? MEMBERS_3V
      : MEMBERS_3V.filter(({ type }) => type === props.memberFilter);

  return (
    <>
      <group scale={INCHES_TO_FEET}>
        {props.layers.panels ? (
          <mesh geometry={PANEL_GEOMETRY} renderOrder={0} receiveShadow>
            <meshStandardMaterial
              color="#ffffff"
              vertexColors
              flatShading
              roughness={0.84}
              metalness={0}
              emissive="#241006"
              emissiveIntensity={0.13}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          </mesh>
        ) : null}
        {props.layers.timber || props.layers.labels ? visibleMembers.map((member) => (
          <TimberMember
            key={member.pieceId}
            member={member}
            showBody={props.layers.timber}
            selected={member.pieceId === props.selectedMemberId}
            explode={props.explode}
            labels={props.layers.labels}
            onSelect={props.onSelectMember}
          />
        )) : null}
        {props.layers.hubs || props.layers.labels ? DOME_MODEL_3V.vertices.map((vertex) => (
          <Hub
            key={vertex.id}
            vertexId={vertex.id}
            showBody={props.layers.hubs}
            explode={props.explode}
            labels={props.layers.labels}
            selectedEndpoint={selectedEndpoints.has(vertex.id)}
          />
        )) : null}
        {props.layers.dimensions ? <DimensionLayer /> : null}
      </group>
      {props.layers.ground ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
            <circleGeometry args={[7.3, 60]} />
            <meshStandardMaterial color="#070b08" roughness={0.99} />
          </mesh>
          <gridHelper args={[32, 32, "#263229", "#101612"]} position={[0, -0.065, 0]} />
          <axesHelper args={[1.5]} position={[0, 0.02, 0]} />
        </>
      ) : null}
    </>
  );
}

function DomeScene3V(props: SceneProps) {
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
    const frame = window.requestAnimationFrame(() => setWebglUnavailable(!context));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div
        className="canvas-shell"
        role="img"
        aria-label={props.layers.panels
          ? "Interactive 3D Class-I frequency-3 five-eighths dome with 105 gross triangular faces behind 165 unique member axes. Panels, axis prisms, and node markers are schematic display proxies with arbitrary visual thickness—not finished parts or a weather enclosure."
          : "Interactive 3D Class-I frequency-3 five-eighths dome with 165 unique member axes, 61 nodes, and 105 faces. The axis prisms and node markers use arbitrary visual thickness and are not physical part designs. Open Geometry inventory or Audit for keyboard-accessible geometry data."}
      >
        <Canvas
          aria-hidden="true"
          dpr={[1, 1.5]}
          frameloop={props.autoRotate ? "always" : "demand"}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          shadows="basic"
          onCreated={() => setWebglUnavailable(false)}
          onPointerMissed={() => props.onSelectMember(null)}
          fallback={null}
        >
          <CameraRig viewMode={props.viewMode} azimuthStep={props.azimuthStep} zoom={props.zoom} resetNonce={props.resetNonce} />
          <color attach="background" args={["#020403"]} />
          <fog attach="fog" args={["#020403", props.mobileLayout ? 38 : 22, props.mobileLayout ? 72 : 42]} />
          <hemisphereLight args={["#e1e4d8", "#010201", 1.08]} />
          <directionalLight position={[8, 14, 9]} intensity={4.2} color="#fff0d2" castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-9, 7, -7]} intensity={0.58} color="#8eb49b" />
          <pointLight position={[-5, 8, -8]} intensity={19} distance={26} decay={2} color="#c77835" />
          <Suspense fallback={null}>
            <Assembly {...props} />
            <ContactShadows position={[0, -0.04, 0]} opacity={0.46} scale={15} blur={2.5} far={10} frames={1} />
          </Suspense>
          <OrbitControls
            makeDefault
            target={[0, 3.35, 0]}
            enableRotate={props.viewMode === "iso"}
            enableZoom
            enablePan={false}
            autoRotate={props.autoRotate && props.viewMode === "iso"}
            autoRotateSpeed={0.3}
            minDistance={props.mobileLayout ? 18 : 9}
            maxDistance={props.mobileLayout ? 50 : 34}
            minPolarAngle={Math.PI * 0.2}
            maxPolarAngle={Math.PI / 2 - 0.03}
            rotateSpeed={0.62}
            zoomSpeed={0.8}
            enableDamping
            dampingFactor={0.075}
            touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
            onStart={props.onInteractionStart}
          />
        </Canvas>
      </div>
      {webglUnavailable ? <div className="webgl-fallback accessible-webgl-fallback" role="status">3D rendering is unavailable. Use Parts and Audit for the complete accessible 3V geometry reference.</div> : null}
    </>
  );
}

export default memo(DomeScene3V);
