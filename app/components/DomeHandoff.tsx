"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AuditHubValence, LayerState, MemberFilter, ViewMode } from "./DomeScene";
import {
  DOME_MODEL,
  ENTRANCE_STUDY,
  HANDOFF,
  JANTSZ_MESSAGE,
  JOINERY_MODEL,
  JOINERY_NOTES,
  MATERIAL,
  MEMBERS,
  MODEL_ASSUMPTIONS,
  PLATFORM_CONCEPT,
  PROJECT,
  REDESIGN_POCKET_AUDIT,
  REDESIGN_STUDY,
  WOOD_PANEL_CONCEPT,
  WOOD_PANELS,
  type DomeMember,
} from "@/lib/spec";

const DomeScene = dynamic(() => import("./DomeScene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status">Loading canonical geometry…</div>,
});

type LayerKey = keyof LayerState;
type ScheduleTab = "summary" | "members" | "hubs" | "joinery" | "audit";
type Toast = "message" | "csv" | "json" | "pdf" | null;
type DomeView = Exclude<ViewMode, "joinery" | "parts" | "platform" | "site">;
type WorkbenchPanel = "view" | "layers" | "details" | "geometry" | "schedule" | null;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOBILE_LAYOUT_QUERY = "(max-width: 860px)";
const vertexById = new Map(DOME_MODEL.vertices.map((vertex) => [vertex.id, vertex]));
const PDF_PATH = `/downloads/black-belt-building-dome-field-reference-rev-${PROJECT.revision.toLowerCase()}.pdf`;
const PDF_DOWNLOAD_NAME = `Black-Belt-Building-Dome-Field-Reference-Rev-${PROJECT.revision}.pdf`;

const JANTSZ_REVIEW_NOTE = JANTSZ_MESSAGE;

const DEFAULT_LAYERS: LayerState = {
  timber: true,
  hubs: true,
  panels: false,
  platformDeck: false,
  platformFrame: false,
  platformSupports: false,
  dimensions: false,
  labels: false,
  ground: true,
};

const SITE_LAYERS: LayerState = {
  timber: true,
  hubs: false,
  panels: false,
  platformDeck: false,
  platformFrame: false,
  platformSupports: false,
  dimensions: false,
  labels: false,
  ground: false,
};

const PLATFORM_LAYERS: LayerState = {
  timber: true,
  hubs: true,
  panels: true,
  platformDeck: true,
  platformFrame: true,
  platformSupports: true,
  dimensions: false,
  labels: false,
  ground: true,
};

const SCHEDULE_TABS: ReadonlyArray<ScheduleTab> = ["summary", "members", "hubs", "joinery", "audit"];

const LAYERS: ReadonlyArray<{
  key: LayerKey;
  group: "Dome structure" | "Platform concept" | "Documentation" | "Context";
  label: string;
  count: number;
  swatch: string;
}> = [
  { key: "timber", group: "Dome structure", label: "Timber members", count: MEMBERS.length, swatch: "timber" },
  { key: "hubs", group: "Dome structure", label: "Node markers", count: DOME_MODEL.vertices.length, swatch: "hubs" },
  { key: "panels", group: "Dome structure", label: "Wood infill panels", count: DOME_MODEL.faces.length, swatch: "panels" },
  { key: "platformDeck", group: "Platform concept", label: "Deck boards + approach", count: PLATFORM_CONCEPT.deckBoardCount + PLATFORM_CONCEPT.entryStepCount + 3, swatch: "platform-deck" },
  { key: "platformFrame", group: "Platform concept", label: "Rim + radial frame", count: PLATFORM_CONCEPT.rimJoistCount + PLATFORM_CONCEPT.primaryJoistCount + PLATFORM_CONCEPT.centerHubCount, swatch: "platform-frame" },
  { key: "platformSupports", group: "Platform concept", label: "Supports at base-node axes", count: PLATFORM_CONCEPT.supportCount, swatch: "platform-supports" },
  { key: "dimensions", group: "Documentation", label: "Dimensions", count: 2, swatch: "dimensions" },
  { key: "labels", group: "Documentation", label: "Member + node IDs", count: MEMBERS.length + DOME_MODEL.vertices.length, swatch: "labels" },
  { key: "ground", group: "Context", label: "Ground + axes", count: 1, swatch: "ground" },
];

const DOME_VIEWS: ReadonlyArray<{ key: DomeView; label: string; short: string }> = [
  { key: "iso", label: "Show isometric 3D dome view", short: "3D" },
  { key: "plan", label: "Show top plan", short: "TOP" },
  { key: "front", label: "Show front elevation", short: "FRONT" },
  { key: "right", label: "Show right-side elevation", short: "SIDE" },
];

const PANEL_OPTIONS: ReadonlyArray<{
  key: Exclude<WorkbenchPanel, "view" | null>;
  label: string;
  accessibleLabel: string;
}> = [
  { key: "layers", label: "Layers", accessibleLabel: "Open model layers" },
  { key: "details", label: "Parts", accessibleLabel: "Open selected part details" },
  { key: "geometry", label: "Guide", accessibleLabel: "Open the project guide" },
  { key: "schedule", label: "Audit", accessibleLabel: "Open audit data and schedules" },
];

function isDomeView(view: ViewMode): view is DomeView {
  return DOME_VIEWS.some((candidate) => candidate.key === view);
}

function subscribeToReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToMobileLayout(onStoreChange: () => void) {
  const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function downloadFile(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function memberOrientation(member: DomeMember) {
  const start = vertexById.get(member.start)?.position;
  const end = vertexById.get(member.end)?.position;
  if (!start || !end) return { bearing: 0, slope: 0 };
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const bearing = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  const slope = Math.asin(Math.abs(dy) / member.length) * 180 / Math.PI;
  return { bearing, slope };
}

function makeMemberCsv() {
  const rows = [["piece_id", "edge_id", "class", "centerline_inches", "chord_factor", "start_node", "end_node", "bearing_deg", "slope_deg", "material", "modeled_section_inches"]];
  for (const member of MEMBERS) {
    const orientation = memberOrientation(member);
    rows.push([
      member.pieceId,
      member.id,
      member.type,
      member.length.toFixed(6),
      member.chordFactor.toFixed(12),
      member.start,
      member.end,
      orientation.bearing.toFixed(3),
      orientation.slope.toFixed(3),
      MATERIAL.species,
      "1.5 x 1.5",
    ]);
  }
  return rows.map((row) => row.join(",")).join("\n");
}

function LayerControl({
  layer,
  visible,
  onToggle,
  onSolo,
}: {
  layer: (typeof LAYERS)[number];
  visible: boolean;
  onToggle: () => void;
  onSolo: () => void;
}) {
  return (
    <div className="layer-row">
      <button
        type="button"
        className="layer-switch"
        role="switch"
        aria-checked={visible}
        aria-label={`${visible ? "Hide" : "Show"} ${layer.label}`}
        onClick={onToggle}
      >
        <span className={`layer-swatch ${layer.swatch}`} aria-hidden="true" />
        <span className="layer-name">{layer.label}</span>
        <span className="layer-count">{layer.count}</span>
        <span className="visibility-icon" aria-hidden="true">{visible ? "●" : "○"}</span>
      </button>
      <button type="button" className="solo-button" onClick={onSolo} aria-label={`Isolate ${layer.label}`}>ISO</button>
    </div>
  );
}

function MessageBody() {
  return (
    <div className="message-copy" id="message-safety-summary">
      {JANTSZ_REVIEW_NOTE.split("\n\n").map((block, blockIndex) => {
        const lines = block.split("\n");
        if (blockIndex === 0) return <p key={block}>{block}</p>;
        if (blockIndex === 1) {
          return <div className="message-status-stack" key={block}>{lines.map((line) => <strong key={line}>{line}</strong>)}</div>;
        }
        const [heading, ...content] = lines;
        const bullets = content.filter((line) => line.startsWith("•"));
        return (
          <section key={block}>
            <h3>{heading}</h3>
            {bullets.length === content.length && bullets.length > 0
              ? <ul>{bullets.map((line) => <li key={line}>{line.slice(1).trim()}</li>)}</ul>
              : <p>{content.join(" ")}</p>}
          </section>
        );
      })}
    </div>
  );
}

function Inspector({
  member,
  isolated,
  onIsolate,
  onPrevious,
  onNext,
  onBrowse,
  onClear,
}: {
  member: DomeMember | null;
  isolated: boolean;
  onIsolate: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onBrowse: () => void;
  onClear: () => void;
}) {
  if (!member) {
    return (
      <aside className="inspector-panel" aria-label="Model inspector">
        <div className="panel-heading"><span>PARTS</span><button type="button" onClick={onClear} aria-label="Close parts panel">×</button></div>
        <div className="empty-inspector">
          <div className="empty-glyph" aria-hidden="true">△</div>
          <h2>Select a timber.</h2>
          <p>Choose any solid member in the viewport or use the keyboard-accessible schedule below.</p>
          <button type="button" className="browse-parts-button" onClick={onBrowse}>Browse all {MEMBERS.length} members</button>
        </div>
        <AuditSummary compact />
      </aside>
    );
  }

  const orientation = memberOrientation(member);
  const start = vertexById.get(member.start);
  const end = vertexById.get(member.end);

  return (
    <aside className="inspector-panel" aria-label={`Inspector for ${member.pieceId}`}>
      <div className="panel-heading"><span>PARTS / SELECTED MEMBER</span><button type="button" onClick={onClear} aria-label="Close parts panel">×</button></div>
      <div className="member-hero">
        <span className={`member-chip class-${member.type.toLowerCase()}`}>{member.type === "S" ? "SHORT" : "LONG"}</span>
        <h2>{member.pieceId}</h2>
        <p>Canonical edge {member.id}</p>
      </div>
      <div className="primary-measure">
        <strong>{member.length.toFixed(3)}<span> in</span></strong>
        <p>node-center chord</p>
      </div>
      <dl className="property-list">
        <div><dt>Chord factor</dt><dd>{member.chordFactor.toFixed(9)} R</dd></div>
        <div><dt>Start hub</dt><dd>{member.start} · {start?.valence}-way</dd></div>
        <div><dt>End hub</dt><dd>{member.end} · {end?.valence}-way</dd></div>
        <div><dt>Axis bearing</dt><dd>{orientation.bearing.toFixed(2)}°</dd></div>
        <div><dt>Axis slope</dt><dd>{orientation.slope.toFixed(2)}°</dd></div>
        <div><dt>Modeled section</dt><dd>{MATERIAL.modeledSection}</dd></div>
        <div><dt>Material</dt><dd>{MATERIAL.species}</dd></div>
      </dl>
      <div className="section-profile" aria-label="Modeled timber cross-section: 1.5 inches by 1.5 inches">
        <span>1.5 IN</span><i /><b>1.5 × 1.5</b>
      </div>
      <div className="inspector-actions">
        <button type="button" className={isolated ? "active" : ""} onClick={onIsolate} aria-pressed={isolated}>{isolated ? "Show assembly" : "Isolate member"}</button>
        <div><button type="button" onClick={onPrevious} aria-label="Select previous member">← PREV</button><button type="button" onClick={onNext} aria-label="Select next member">NEXT →</button></div>
        <button type="button" onClick={onBrowse}>Browse all {MEMBERS.length} members</button>
      </div>
      <div className="cut-warning"><span aria-hidden="true">!</span><p><strong>Reference only—not a cut length.</strong> The current joint study clears spatial checks but has no structural release. Finished timber dimensions remain withheld.</p></div>
    </aside>
  );
}

function AuditSummary({ compact = false }: { compact?: boolean }) {
  const audit = DOME_MODEL.audit;
  const passed = Object.values(audit.checks).every(Boolean);
  return (
    <section className={compact ? "audit-summary compact" : "audit-summary"} aria-label="Geometry audit">
      <div className="audit-title"><span className={passed ? "pass-dot" : "fail-dot"} /> <strong>{passed ? "CENTERLINE GEOMETRY VERIFIED" : "CENTERLINE CHECK FAILED"}</strong></div>
      <div className="audit-equation"><span>V {audit.counts.vertices}</span><i>−</i><span>E {audit.counts.edges}</span><i>+</i><span>F {audit.counts.faces}</span><b>= {audit.topology.eulerCharacteristic}</b></div>
      <div className="audit-equation"><span>{audit.topology.strutEndpointCount} ends</span><i>=</i><span>{audit.topology.hubPortCount} ports</span></div>
    </section>
  );
}

function JoinerySummary({ compact = false }: { compact?: boolean }) {
  const redesignClears = REDESIGN_POCKET_AUDIT.allPairsClear && REDESIGN_STUDY.sampledPocketCollisions === 0;
  return (
    <section className={`joinery-summary${compact ? " compact" : ""}`} aria-label="Mortise and tenon audit">
      <div className="joinery-title"><span className={redesignClears ? "study-dot" : "fail-dot"} /><strong>{redesignClears ? "CURRENT JOINT STUDY CLEARS SPATIALLY" : "JOINT INTERFERENCE FOUND"}</strong></div>
      <p>The digital pocket envelopes do not collide. Strength, retention, fit, moisture behavior, loads, and fabrication approval remain open.</p>
      <div className="redesign-clearance-result"><span className={redesignClears ? "pass-dot" : "fail-dot"} /><p><strong>{redesignClears ? "DIGITAL CLEARANCE VERIFIED" : "INTERFERENCE FOUND"}</strong><small>{REDESIGN_STUDY.sampledPocketCollisions} of {REDESIGN_STUDY.sampledPairTests.toLocaleString()} sampled pocket pairs overlap · physical fit and structure unverified</small></p></div>
    </section>
  );
}

function PartsLayout({
  onOpenSchedule,
  onInspectMember,
}: {
  onOpenSchedule: () => void;
  onInspectMember: (pieceId: string) => void;
}) {
  const shortMembers = MEMBERS.filter((member) => member.type === "S");
  const longMembers = MEMBERS.filter((member) => member.type === "L");
  const hubGroups = ([4, 5, 6] as const).map((valence) => ({
    valence,
    vertices: DOME_MODEL.vertices.filter((vertex) => vertex.valence === valence),
  }));

  return (
    <section className="parts-layout" aria-labelledby="parts-layout-title">
      <header className="parts-layout-header">
        <div>
          <p>ALL MODELED COMPONENTS · BEFORE ASSEMBLY</p>
          <h2 id="parts-layout-title">65 timbers + 26 nodes + 40 panel faces</h2>
        </div>
        <button type="button" onClick={onOpenSchedule}>Open member schedule</button>
      </header>
      <p className="parts-layout-boundary"><strong>Geometry reference only.</strong> Timbers remain node-center axes, node blocks remain schematic, and the panel dimensions below are gross mathematical face templates—not finished cuts.</p>
      <div className="parts-inventory-columns">
        {[{ id: "short", label: "SHORT", length: 39.35, members: shortMembers }, { id: "long", label: "LONG", length: 44.498, members: longMembers }].map((group) => (
          <section className={`parts-inventory-group ${group.id}`} key={group.id} aria-label={`${group.members.length} ${group.label.toLowerCase()} members at ${group.length.toFixed(3)} inches node center`}>
            <div className="parts-group-heading"><span>{group.label}</span><strong>{group.members.length} × {group.length.toFixed(3)} IN</strong></div>
            <div className="parts-piece-grid">
              {group.members.map((member) => (
                <button
                  type="button"
                  className="parts-piece"
                  key={member.pieceId}
                  aria-label={`${member.pieceId}, ${member.type === "S" ? "short" : "long"} timber, ${member.length.toFixed(3)} inch node-center chord. Open details.`}
                  onClick={() => onInspectMember(member.pieceId)}
                >
                  <i aria-hidden="true" /><b>{member.pieceId}</b>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="panel-inventory" aria-labelledby="panel-inventory-heading">
        <div className="parts-group-heading"><span id="panel-inventory-heading">WOOD INFILL FACE TEMPLATES</span><strong>{WOOD_PANEL_CONCEPT.panelCount} TOTAL · {WOOD_PANEL_CONCEPT.grossTotalAreaSquareFeet.toFixed(3)} FT² GROSS</strong></div>
        <p className="panel-inventory-warning"><strong>Do not cut from these numbers.</strong> Exact finished panels still require thickness, timber underlap or reveal, hub corner relief, gaskets, drainage, moisture allowance, attachment, and an engineered entrance.</p>
        <p className="entry-panel-note"><strong>Entrance study:</strong> {ENTRANCE_STUDY.hiddenFaceIds.length} highlighted canonical faces are omitted only in the optional entrance view, together with {ENTRANCE_STUDY.hiddenMemberPieceIds.length} members and node {ENTRANCE_STUDY.hiddenNodeIds.join(", ")}. The 40-face reference remains intact.</p>
        <div className="panel-family-grid">
          {WOOD_PANEL_CONCEPT.types.map((panelType) => {
            const panels = WOOD_PANELS.filter((panel) => panel.type === panelType.type);
            return (
              <section className={`panel-family type-${panelType.type.toLowerCase()}`} key={panelType.type} aria-label={`${panelType.count} ${panelType.label} gross face templates`}>
                <header>
                  <div><span>{panelType.type}</span><strong>{panelType.label}</strong></div>
                  <b>{panelType.count} PIECES</b>
                </header>
                <dl>
                  <div><dt>Gross sides</dt><dd>{panelType.sideLengthsInches.map((side) => side.toFixed(3)).join(" / ")} in</dd></div>
                  <div><dt>Base × altitude</dt><dd>{panelType.baseLengthInches.toFixed(3)} × {panelType.grossHeightInches.toFixed(3)} in</dd></div>
                  <div><dt>Gross area</dt><dd>{panelType.areaSquareInches.toFixed(3)} in² each</dd></div>
                  <div><dt>Angles</dt><dd>{panelType.anglesDegrees.map((angle) => angle.toFixed(3)).join("° / ")}°</dd></div>
                </dl>
                <ol className="panel-piece-grid">
                  {panels.map((panel) => {
                    const entranceAffected = ENTRANCE_STUDY.hiddenFaceIds.includes(panel.faceId as (typeof ENTRANCE_STUDY.hiddenFaceIds)[number]);
                    return (
                    <li
                      className={`panel-piece${entranceAffected ? " entry-affected" : ""}`}
                      aria-label={`${panel.pieceId}, canonical face ${panel.faceId}, ${panelType.label}, gross sides ${panel.sideLengthsInches.map((side) => side.toFixed(3)).join(", ")} inches.${entranceAffected ? " Omitted in the optional entrance study." : ""} Not a finished panel cut.`}
                      key={panel.pieceId}
                    >
                      <i aria-hidden="true" /><b>{panel.pieceId}</b><small>{panel.faceId}{entranceAffected ? " · ENTRY" : ""}</small>
                    </li>
                  )})}
                </ol>
              </section>
            );
          })}
        </div>
      </section>
      <section className="node-inventory" aria-label="26 node locations grouped by valence">
        <div className="parts-group-heading"><span>NODE LOCATIONS</span><strong>26 TOTAL · SCHEMATIC</strong></div>
        <div className="node-groups">
          {hubGroups.map((group) => (
            <div key={group.valence} aria-label={`${group.vertices.length} ${group.valence}-way nodes`}>
              <strong>H{group.valence} · {group.vertices.length}</strong>
              <div>{group.vertices.map((vertex) => <span role="img" aria-label={`${vertex.id}, schematic ${group.valence}-way node location`} className={`node-piece h${group.valence}`} key={vertex.id}>{vertex.id.slice(1)}</span>)}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export default function DomeHandoff() {
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [platformLayers, setPlatformLayers] = useState<LayerState>(PLATFORM_LAYERS);
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>(null);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("iso");
  const [azimuthStep, setAzimuthStep] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [resetNonce, setResetNonce] = useState(0);
  const [auditHubValence, setAuditHubValence] = useState<AuditHubValence>(6);
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("summary");
  const [query, setQuery] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [announcement, setAnnouncement] = useState("Canonical 2V geometry loaded.");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogCloseRef = useRef<HTMLButtonElement>(null);
  const reviewNoteButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleRef = useRef<HTMLElement>(null);
  const panelFocusPendingRef = useRef(false);
  const lastPanelTriggerRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastDomeViewRef = useRef<DomeView>("iso");
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false);
  const mobileLayout = useSyncExternalStore(subscribeToMobileLayout, getMobileLayoutSnapshot, () => false);

  const selectedMember = MEMBERS.find((member) => member.pieceId === selectedMemberId) ?? null;
  const automaticOrbitAvailable = viewMode === "iso" || viewMode === "platform";
  const automaticOrbitEnabled = autoRotate && !prefersReducedMotion && automaticOrbitAvailable;
  const stopAutomaticOrbit = useCallback(() => setAutoRotate(false), []);
  const displayedLayers = viewMode === "platform" ? platformLayers : layers;
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    return MEMBERS.filter((member) => {
      const inClass = memberFilter === "all" || member.type === memberFilter;
      const matches = !normalized || `${member.pieceId} ${member.id} ${member.start} ${member.end}`.includes(normalized);
      return inClass && matches;
    });
  }, [memberFilter, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (messageOpen && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => dialogCloseRef.current?.focus());
    }
    if (!messageOpen && dialog.open) dialog.close();
  }, [messageOpen]);

  useEffect(() => {
    if (activePanel && panelFocusPendingRef.current) {
      panelFocusPendingRef.current = false;
      const drawer = document.getElementById(`${activePanel}-drawer`);
      window.requestAnimationFrame(() => drawer?.focus());
    }
  }, [activePanel]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !messageOpen) {
        if (activePanel) {
          const panel = activePanel;
          const prior = lastPanelTriggerRef.current;
          setActivePanel(null);
          setAnnouncement("Workbench panel closed.");
          window.setTimeout(() => {
            if (prior?.isConnected && prior.getClientRects().length) prior.focus();
            else document.getElementById(panel === "view" ? "view-panel-button" : `${panel}-panel-button`)?.focus();
          }, 0);
        } else if (viewMode === "joinery") {
          setViewMode(lastDomeViewRef.current);
          setResetNonce((value) => value + 1);
          setAnnouncement("Returned to the dome model.");
        } else if (selectedMemberId) {
          setSelectedMemberId(null);
          setIsolateSelected(false);
          setAnnouncement("Member selection cleared.");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, messageOpen, selectedMemberId, viewMode]);

  const notify = (value: Toast) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(value);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  };

  const chooseMember = useCallback((pieceId: string | null) => {
    const selectedFromSchedule = Boolean(document.activeElement?.closest("#schedule-drawer"));
    setSelectedMemberId(pieceId);
    if (!pieceId) {
      setIsolateSelected(false);
      setActivePanel((current) => current === "details" ? null : current);
    } else if (!mobileLayout || selectedFromSchedule) {
      setActivePanel("details");
    } else {
      setActivePanel(null);
    }
    const member = MEMBERS.find((candidate) => candidate.pieceId === pieceId);
    setAnnouncement(member
      ? `${member.pieceId} selected, ${member.length.toFixed(3)} inch centerline chord.${mobileLayout && !selectedFromSchedule ? " Use the selected member button for details." : ""}`
      : "Member selection cleared.");
    if (pieceId && selectedFromSchedule) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>("#details-drawer .panel-heading button")?.focus(), 0);
    }
  }, [mobileLayout]);

  const togglePanel = (panel: Exclude<WorkbenchPanel, null>) => {
    const opening = activePanel !== panel;
    if (opening) {
      lastPanelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panelFocusPendingRef.current = true;
    }
    setActivePanel(opening ? panel : null);
    const panelName = panel === "details" ? "Parts" : panel === "schedule" ? "Audit" : panel === "geometry" ? "Guide" : panel;
    setAnnouncement(`${panelName} panel ${opening ? "opened" : "closed"}.`);
  };

  const openPanel = (panel: Exclude<WorkbenchPanel, null>) => {
    lastPanelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelFocusPendingRef.current = true;
    setActivePanel(panel);
  };

  const inspectMember = (pieceId: string) => {
    chooseMember(pieceId);
    openPanel("details");
  };

  const closePanel = (panel: Exclude<WorkbenchPanel, null>) => {
    setActivePanel(null);
    window.setTimeout(() => {
      const prior = lastPanelTriggerRef.current;
      if (prior?.isConnected && prior.getClientRects().length) prior.focus();
      else document.getElementById(panel === "view" ? "view-panel-button" : `${panel}-panel-button`)?.focus();
    }, 0);
  };

  const openScheduleFromSkipLink = () => {
    setScheduleTab("members");
    setAnnouncement("Member schedule opened and focused.");
    if (activePanel === "schedule") {
      scheduleRef.current?.focus();
      return;
    }
    lastPanelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelFocusPendingRef.current = true;
    setActivePanel("schedule");
  };

  const selectRelative = (direction: -1 | 1) => {
    const current = Math.max(0, MEMBERS.findIndex((member) => member.pieceId === selectedMemberId));
    const next = (current + direction + MEMBERS.length) % MEMBERS.length;
    chooseMember(MEMBERS[next].pieceId);
  };

  const toggleLayer = (key: LayerKey) => {
    const setter = viewMode === "platform" ? setPlatformLayers : setLayers;
    setter((current) => ({ ...current, [key]: !current[key] }));
    setAnnouncement(`${LAYERS.find((layer) => layer.key === key)?.label} ${displayedLayers[key] ? "hidden" : "shown"}.`);
  };

  const soloLayer = (key: LayerKey) => {
    const setter = viewMode === "platform" ? setPlatformLayers : setLayers;
    setter({ timber: false, hubs: false, panels: false, platformDeck: false, platformFrame: false, platformSupports: false, dimensions: false, labels: false, ground: false, [key]: true });
    setAnnouncement(`${LAYERS.find((layer) => layer.key === key)?.label} isolated.`);
  };

  const showAllLayers = () => {
    if (viewMode === "platform") {
      setPlatformLayers(PLATFORM_LAYERS);
      setAnnouncement("Platform overview layers restored.");
      return;
    }
    setLayers({ timber: true, hubs: true, panels: true, platformDeck: false, platformFrame: false, platformSupports: false, dimensions: true, labels: true, ground: true });
    setAnnouncement("All canonical dome layers shown. Open Platform for its separate concept layers.");
  };

  const exportCsv = () => {
    downloadFile(`${PROJECT.id.toLowerCase()}-centerline-members.csv`, makeMemberCsv(), "text/csv");
    notify("csv");
  };

  const exportJson = () => {
    const artifact = {
      project: PROJECT,
      units: "inches",
      status: "Geometry verified; connection engineering and finished cuts not issued",
      material: MATERIAL,
      assumptions: MODEL_ASSUMPTIONS,
      model: DOME_MODEL,
      joineryAudit: JOINERY_MODEL,
      redesignClearanceStudy: REDESIGN_STUDY,
      platformConcept: PLATFORM_CONCEPT,
      entranceStudy: ENTRANCE_STUDY,
      woodPanelConcept: WOOD_PANEL_CONCEPT,
      woodPanels: WOOD_PANELS,
      members: MEMBERS,
    };
    downloadFile(`${PROJECT.id.toLowerCase()}-canonical-geometry.json`, JSON.stringify(artifact, null, 2), "application/json");
    notify("json");
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(JANTSZ_REVIEW_NOTE);
      notify("message");
      setAnnouncement("Jantz review note copied to the clipboard.");
    } catch {
      setAnnouncement("The review note could not be copied. Select the message text and copy it manually.");
    }
  };

  const resetCamera = () => {
    setAzimuthStep(0);
    setZoom(1);
    setResetNonce((value) => value + 1);
    setAnnouncement("Camera reset.");
  };

  const resetExperience = () => {
    lastDomeViewRef.current = "iso";
    setViewMode("iso");
    setLayers(DEFAULT_LAYERS);
    setActivePanel(null);
    setSelectedMemberId(null);
    setIsolateSelected(false);
    setAzimuthStep(0);
    setZoom(1);
    setResetNonce((value) => value + 1);
    setAnnouncement("Returned to the complete isometric dome.");
  };

  const handleScheduleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: ScheduleTab) => {
    const currentIndex = SCHEDULE_TABS.indexOf(currentTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % SCHEDULE_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + SCHEDULE_TABS.length) % SCHEDULE_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SCHEDULE_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = SCHEDULE_TABS[nextIndex];
    setScheduleTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`schedule-tab-${nextTab}`)?.focus());
  };

  const selectView = (nextView: ViewMode) => {
    if (isDomeView(nextView)) lastDomeViewRef.current = nextView;
    setViewMode(nextView);
    if (nextView === "joinery") {
      setActivePanel((current) => current === "details" ? null : current);
      setSelectedMemberId(null);
      setIsolateSelected(false);
    }
    setResetNonce((value) => value + 1);
    const label = nextView === "joinery"
      ? `Current joint clearance study opened at the ${auditHubValence}-way node. Physical fit and structural review remain open.`
      : nextView === "parts"
        ? "All 65 timber members and 26 node locations laid out before assembly."
        : nextView === "platform"
          ? `Unengineered entrance and ${PLATFORM_CONCEPT.diameterInches / 12} foot platform study opened. Six face panels, seven canonical members, and one node are hidden only in this view to show a 36 by 58 inch crouch entrance. The replacement load path, platform structure, weather enclosure, and acoustics are not approved.`
        : nextView === "site"
          ? "Jantz site perspective opened. Dome geometry is exact; placement remains approximate until the yard is measured."
          : `${DOME_VIEWS.find((view) => view.key === nextView)?.short ?? "Dome"} dome view selected.`;
    setAnnouncement(label);
  };

  const selectJointStudy = () => {
    setViewMode("joinery");
    setActivePanel((current) => current === "details" ? null : current);
    setSelectedMemberId(null);
    setIsolateSelected(false);
    setResetNonce((value) => value + 1);
    setAnnouncement(`Current joint clearance study opened at the ${auditHubValence}-way node. Zero tested pocket pairs overlap; physical fit and structural review remain open.`);
  };

  const returnToDome = () => selectView(lastDomeViewRef.current);
  const selectViewFromDrawer = (nextView: ViewMode) => {
    selectView(nextView);
    setActivePanel(null);
    window.setTimeout(() => document.getElementById("view-panel-button")?.focus(), 0);
  };
  const selectDomeFinish = (woodShell: boolean) => {
    setLayers((current) => ({ ...current, timber: true, hubs: true, panels: woodShell, ground: true }));
    selectView("iso");
    setActivePanel(null);
    setAnnouncement(woodShell
      ? "Wood shell concept shown: 40 opaque triangular infill surfaces behind the timber grid. Weather, structure, panel fabrication, and acoustic performance remain unverified."
      : "Exposed timber frame shown with the wood infill concept hidden.");
    window.setTimeout(() => document.getElementById("view-panel-button")?.focus(), 0);
  };
  const selectJointFromDrawer = () => {
    selectJointStudy();
    setActivePanel(null);
    window.setTimeout(() => document.getElementById("view-panel-button")?.focus(), 0);
  };
  const openPanelFromExplore = (panel: "layers" | "details" | "geometry" | "schedule") => {
    lastPanelTriggerRef.current = document.getElementById("view-panel-button");
    panelFocusPendingRef.current = true;
    setActivePanel(panel);
  };

  const auditPassed = Object.values(DOME_MODEL.audit.checks).every(Boolean);
  const redesignClearanceVerified = REDESIGN_POCKET_AUDIT.allPairsClear && REDESIGN_STUDY.sampledPocketCollisions === 0;
  const redesignCollisionSummary = REDESIGN_POCKET_AUDIT.byValence.find((summary) => summary.valence === auditHubValence)!;
  const selectedCollisionSummary = redesignCollisionSummary;
  const displayedCollisionCount = redesignCollisionSummary.collisionsPerHub;
  const domeModeActive = isDomeView(viewMode);
  const woodShellActive = domeModeActive && layers.panels;
  const currentDomeViewLabel = DOME_VIEWS.find((view) => view.key === viewMode)?.short ?? "3D";
  const modeLabel = viewMode === "joinery" ? "Joint clearance" : viewMode === "parts" ? "Parts layout" : viewMode === "platform" ? "Entrance + deck" : viewMode === "site" ? "Site context" : woodShellActive ? `Wood shell · ${currentDomeViewLabel}` : `Exposed frame · ${currentDomeViewLabel}`;
  const viewportKicker = viewMode === "joinery" ? "JOINT / CLEARANCE" : viewMode === "parts" ? "PARTS / LAYOUT" : viewMode === "platform" ? "ENTRY / PLATFORM" : viewMode === "site" ? "SITE / PHOTO STUDY" : woodShellActive ? "DOME / WOOD SHELL" : `DOME / ${viewMode === "iso" ? "3D" : viewMode.toUpperCase()}`;
  const viewportMeasure = viewMode === "joinery" ? `H${auditHubValence} DIGITAL STUDY` : viewMode === "parts" ? "65 TIMBERS · 26 NODES · 40 FACES" : viewMode === "platform" ? `${ENTRANCE_STUDY.clearWidthInches} × ${ENTRANCE_STUDY.clearRiseInches} IN CLEAR STUDY` : viewMode === "site" ? "DOME EXACT · SITE APPROX" : woodShellActive ? `${DOME_MODEL.faces.length} WOOD PANELS · VISUAL` : `${PROJECT.diameterInches} IN NODE-CENTER Ø`;
  const visibleStatus = viewMode === "joinery"
    ? { primary: "SPATIAL CLEARANCE", secondary: "DIGITAL MODEL ONLY" }
    : viewMode === "site"
      ? { primary: "DOME GEOMETRY EXACT", secondary: "PLACEMENT APPROXIMATE" }
      : viewMode === "platform"
        ? { primary: "ENTRY STUDY", secondary: "36 × 58 IN CROUCH" }
        : woodShellActive
          ? { primary: "WOOD SHELL STUDY", secondary: "PERFORMANCE OPEN" }
        : { primary: auditPassed ? "AXES VERIFIED" : "MODEL FAILED", secondary: "STRUCTURE OPEN" };
  const activeSceneLayers = viewMode === "site" ? SITE_LAYERS : displayedLayers;

  return (
    <main className="cad-app" id="top">
      <a
        className="skip-link"
        href="#schedule-drawer"
        aria-hidden={messageOpen ? true : undefined}
        inert={messageOpen}
        tabIndex={messageOpen ? -1 : undefined}
        onClick={(event) => {
          event.preventDefault();
          openScheduleFromSkipLink();
        }}
      >
        Skip to member schedule
      </a>
      <header className="cad-topbar" aria-hidden={messageOpen ? true : undefined} inert={messageOpen}>
        <a className="cad-brand" href="#top" aria-label="Return to the complete Black Belt Building isometric dome" onClick={(event) => { event.preventDefault(); resetExperience(); }}><span className="cad-mark" aria-hidden="true">△</span><span><h1>{HANDOFF.company.toUpperCase()}</h1><small>{HANDOFF.preparedFor.toUpperCase()} · {PROJECT.id} · REV {PROJECT.revision}</small></span></a>
        <div className="model-status" role="status" aria-label={`${auditPassed ? "Dome centerline geometry verified" : "Dome geometry failed"}; ${redesignClearanceVerified ? "joint spatial clearance verified in the digital model only, structure and fabrication not approved" : "joint interference found"}`}><span className={auditPassed ? "pass-dot" : "fail-dot"} /><strong>{auditPassed ? "CENTERLINE VERIFIED" : "MODEL FAILED"}</strong><span className="study-state"><i className={redesignClearanceVerified ? "study-dot" : "fail-dot"} />{redesignClearanceVerified ? "JOINT CLEARANCE · DIGITAL ONLY" : "JOINT CHECK FAILED"}</span></div>
        <div className="top-actions">
          <button ref={reviewNoteButtonRef} type="button" className="jantsz-note-trigger" aria-label="Read Jantz review note" onClick={() => setMessageOpen(true)}><span className="review-note-full">Review note</span><span className="review-note-short" aria-hidden="true">NOTE</span></button>
          <a
            className="pdf-download"
            href={PDF_PATH}
            download={PDF_DOWNLOAD_NAME}
            type="application/pdf"
            aria-label={`Download the Black Belt Building dome field reference PDF, revision ${PROJECT.revision}. Not for fabrication.`}
            onClick={() => notify("pdf")}
          >
            <span aria-hidden="true">↓</span><span>Field PDF<small>Rev {PROJECT.revision} · parts + panels</small></span>
          </a>
        </div>
      </header>

      <div className="cad-grid" data-panel-open={activePanel ?? undefined} aria-hidden={messageOpen ? true : undefined} inert={messageOpen}>
        <section className="viewport-panel" aria-label="Model viewport" aria-hidden={activePanel ? true : undefined} inert={Boolean(activePanel)}>
          <div className={`viewport-toolbar${selectedMember && domeModeActive ? " has-mobile-selection" : ""}`}>
            <div className="viewport-title"><span>{viewportKicker}</span><strong>{viewportMeasure}</strong></div>
            <div className="mobile-safety-status" role="status" aria-label={`${visibleStatus.primary}; ${visibleStatus.secondary}`}><strong>{visibleStatus.primary}</strong><span>{visibleStatus.secondary}</span></div>
            <div className={`cad-navigation${selectedMember && domeModeActive ? " has-mobile-selection" : ""}`} aria-label="Dome model controls">
              <div className="navigation-group mode-navigation">
                <span className="navigation-label">Explore</span>
                <div className="navigation-buttons" role="group" aria-label="Experience view">
                  <button type="button" className={domeModeActive ? "active" : ""} aria-pressed={domeModeActive} onClick={returnToDome}>Dome</button>
                  <button type="button" className={viewMode === "parts" ? "active" : ""} aria-pressed={viewMode === "parts"} onClick={() => selectView("parts")}>Parts</button>
                  <button type="button" className={viewMode === "platform" ? "active" : ""} aria-pressed={viewMode === "platform"} onClick={() => selectView("platform")}>Entry</button>
                  <button type="button" className={viewMode === "site" ? "active" : ""} aria-pressed={viewMode === "site"} onClick={() => selectView("site")}>Site</button>
                  <button type="button" className={viewMode === "joinery" ? "active study" : "study"} aria-pressed={viewMode === "joinery"} onClick={selectJointStudy}>Joint</button>
                </div>
              </div>
              <div className="navigation-group view-navigation">
                <span className="navigation-label">View</span>
                <div className="navigation-buttons" role="group" aria-label="Dome camera view">
                  {DOME_VIEWS.map((view) => (
                    <button key={view.key} type="button" className={viewMode === view.key ? "active" : ""} aria-pressed={viewMode === view.key} aria-label={view.label} onClick={() => selectView(view.key)}>{view.short}</button>
                  ))}
                </div>
              </div>
              <button
                id="view-panel-button"
                type="button"
                className={`mobile-view-trigger${activePanel === "view" ? " active" : ""}`}
                aria-expanded={activePanel === "view"}
                aria-controls="view-drawer"
                onClick={() => togglePanel("view")}
              >
                <span>Explore</span><strong>{modeLabel}</strong><i aria-hidden="true">⌄</i>
              </button>
              {selectedMember && domeModeActive ? (
                <>
                  <button
                    type="button"
                    className="mobile-member-selection"
                    aria-label={`Open details for ${selectedMember.pieceId}, ${selectedMember.length.toFixed(3)} inch centerline chord`}
                    onClick={() => openPanel("details")}
                  >
                    <span>{selectedMember.pieceId}</span><strong>{selectedMember.length.toFixed(3)} IN</strong><i aria-hidden="true">DETAILS ›</i>
                  </button>
                  <button type="button" className="mobile-clear-selection" aria-label={`Clear ${selectedMember.pieceId} selection`} onClick={() => chooseMember(null)}>×</button>
                </>
              ) : null}
              <nav className="navigation-group panel-navigation" aria-label="Information panels">
                <span className="navigation-label">Panels</span>
                <div className="navigation-buttons">
                  {PANEL_OPTIONS.filter((panel) => viewMode !== "joinery" || panel.key !== "details").map((panel) => (
                    <button
                      key={panel.key}
                      id={`${panel.key}-panel-button`}
                      type="button"
                      className={activePanel === panel.key ? "active" : ""}
                      aria-label={panel.key === "details" && selectedMember ? `Open parts panel for ${selectedMember.pieceId}` : panel.accessibleLabel}
                      aria-expanded={activePanel === panel.key}
                      aria-controls={`${panel.key}-drawer`}
                      onClick={() => togglePanel(panel.key)}
                    >
                      {panel.label}{panel.key === "details" && selectedMember ? <span className="selection-badge" aria-hidden="true">1</span> : null}
                    </button>
                  ))}
                </div>
              </nav>
            </div>
          </div>
          <div className={`model-viewport mode-${viewMode}${woodShellActive ? " wood-shell-active" : ""}`}>
            {viewMode === "parts" ? <PartsLayout onOpenSchedule={openScheduleFromSkipLink} onInspectMember={inspectMember} /> : (
              <div className={viewMode === "site" ? "site-mockup-stage" : "scene-stage"}>
                {viewMode === "site" ? <Image className="site-plate" src="/images/jantsz-cleared-yard-site-plate-v1.png" alt="Jantz's backyard after the shed and temporary items are removed" fill loading="eager" sizes="(max-width: 860px) 100vw, 60vh" /> : null}
                <DomeScene
                  layers={activeSceneLayers}
                  memberFilter={viewMode === "site" || viewMode === "platform" ? "all" : memberFilter}
                  selectedMemberId={viewMode === "site" || viewMode === "platform" ? null : selectedMemberId}
                  isolateSelected={viewMode === "site" || viewMode === "platform" ? false : isolateSelected}
                  explode={viewMode === "site" || viewMode === "platform" ? 0 : explode}
                  autoRotate={automaticOrbitEnabled}
                  viewMode={viewMode}
                  azimuthStep={azimuthStep}
                  zoom={zoom}
                  resetNonce={resetNonce}
                  auditHubValence={auditHubValence}
                  selectionEnabled={domeModeActive}
                  mobileLayout={mobileLayout}
                  onInteractionStart={stopAutomaticOrbit}
                  onSelectMember={chooseMember}
                />
              </div>
            )}
            {viewMode === "joinery" ? (
              <>
                <section className="audit-viewport-card redesign-viewport-card" aria-labelledby="audit-viewport-title">
                  <p>CURRENT · PORT-NORMAL CLEARANCE STUDY</p>
                  <div><strong id="audit-viewport-title">H{auditHubValence}</strong><span><b>{displayedCollisionCount}/{selectedCollisionSummary.pairsPerHub}</b> pocket pairs overlap</span></div>
                  <dl><div><dt>Shoulder datum</dt><dd>Axis-normal · S 4.000 in</dd></div><div><dt>Radial slab</dt><dd>q −2.500 to +0.500 in</dd></div><div><dt>Tenon study</dt><dd>1.250 × 0.750 × 0.500 in</dd></div></dl>
                  <div className="audit-material-legend redesign-legend" aria-label="Current joint study visual legend"><span><i className="wood" />Opaque timber member</span><span><i className="redesign-tenon" />Green tenon study</span><span><i className="pocket" />Oversized pocket envelope</span></div>
                  <small>The pockets clear spatially in the digital study. H4 extends 1.500 in below the base-node datum, requiring a recess or raised datum. Strength, retention, fit, and fabrication remain open.</small>
                </section>
                <div className="audit-hub-controls">
                  <div role="group" aria-label="Choose representative hub">
                    {([4, 5, 6] as const).map((valence) => { const summary = REDESIGN_POCKET_AUDIT.byValence.find((item) => item.valence === valence)!; return <button key={valence} type="button" className={auditHubValence === valence ? "active" : ""} aria-pressed={auditHubValence === valence} aria-label={`${valence}-way hub: ${summary.collisionsPerHub} of ${summary.pairsPerHub} pocket pairs overlap`} onClick={() => { setAuditHubValence(valence); setResetNonce((value) => value + 1); setAnnouncement(`${valence}-way joint clearance study selected.`); }}>H{valence}<span>{summary.collisionsPerHub}/{summary.pairsPerHub}</span></button>; })}
                  </div>
                  <div className="audit-roll-readout" aria-label="Member roll fixed width radial"><span>ROLL FIXED</span><strong>WIDTH-RADIAL</strong></div>
                  <button type="button" className="return-dome-button" onClick={returnToDome}>Back to whole dome</button>
                </div>
                <div className="audit-watermark redesign-watermark" aria-hidden="true">FIT ONLY</div>
              </>
            ) : domeModeActive ? (
              <>
                <div className="viewport-stamp"><span>NODE RADIUS</span><b>72.000 IN</b><span>BASE NODES</span><b>Ø 144.000 IN</b></div>
                <section className="viewport-overview-card" aria-labelledby="viewport-overview-title">
                  <p>{woodShellActive ? "WOOD SHELL CONCEPT · 40 PANELS" : "12 FT · 2V HEMISPHERE"}</p>
                  <h2 id="viewport-overview-title">{woodShellActive ? "Warm wood infill · exposed timber grid" : "65 timbers · 26 nodes · 40 faces"}</h2>
                  <span>{woodShellActive ? "Opaque triangular infill is shown 0.860 in inside the audited member planes. Panel build-up, seams, structure, weather enclosure, and acoustic performance are not designed." : "Shape and node-to-node axes verified. Finished cuts, structure, foundations, and fabrication approval are not issued."}</span>
                  <div>{woodShellActive ? <><button type="button" onClick={() => selectDomeFinish(false)}>Exposed frame</button><button type="button" onClick={() => selectView("platform")}>Entrance study</button><button type="button" onClick={() => openPanel("geometry")}>Design status</button></> : <><button type="button" onClick={() => selectDomeFinish(true)}>Wood shell</button><button type="button" onClick={() => selectView("platform")}>Entrance study</button><button type="button" onClick={() => selectView("parts")}>Parts laid out</button></>}</div>
                </section>
                <div className="viewport-legend"><span><i className="short" />SHORT · 39.350</span><span><i className="long" />LONG · 44.498</span><span><i className="hub" />SCHEMATIC NODE</span></div>
                <div className="viewport-mode">{selectedMember ? `${selectedMember.pieceId} SELECTED · OPEN PARTS` : "DRAG TO ROTATE · PINCH TO ZOOM · TAP A TIMBER"}</div>
              </>
            ) : viewMode === "site" ? <section className="site-context-card"><p>SITE / PHOTO STUDY</p><strong>Verified dome geometry · unmeasured placement</strong><span>This perspective is illustrative. Yard dimensions, grade, clearances, setbacks, access, foundations, and anchors require field verification.</span></section>
              : viewMode === "platform" ? <section className="concept-viewport-card"><p>ENTRANCE + PLATFORM / VISUAL STUDY</p><strong>{ENTRANCE_STUDY.clearWidthInches} × {ENTRANCE_STUDY.clearRiseInches} in clear crouch entry · {PLATFORM_CONCEPT.diameterInches / 12} ft deck</strong><span>The stairs now align with an open wood cassette. This optional view hides {ENTRANCE_STUDY.hiddenFaceIds.length} canonical faces, {ENTRANCE_STUDY.hiddenMemberPieceIds.length} members, and node {ENTRANCE_STUDY.hiddenNodeIds.join(", ")}; the audited 65-member reference is unchanged. Replacement reinforcement, all-wood connection sizes, door and weather seals, structure, foundations, guards, code, and acoustics are not approved.</span></section>
                : null}
          </div>
        </section>

        {activePanel === "view" ? (
          <aside className="layers-panel workbench-drawer view-drawer" id="view-drawer" tabIndex={-1} aria-label="Explore the dome project">
            <div className="panel-heading"><span>EXPLORE</span><button type="button" onClick={() => closePanel("view")} aria-label="Close Explore menu">×</button></div>
            <section className="control-section" aria-labelledby="mode-drawer-heading">
              <div className="section-heading"><h2 id="mode-drawer-heading">What do you want to see?</h2></div>
              <div className="drawer-choice-grid experience-choice-grid" role="group" aria-label="Experience view">
                <button type="button" className={domeModeActive && !layers.panels ? "active" : ""} aria-pressed={domeModeActive && !layers.panels} onClick={() => selectDomeFinish(false)}><strong>Exposed frame</strong><span>Complete timber assembly</span></button>
                <button type="button" className={`finish${woodShellActive ? " active" : ""}`} aria-pressed={woodShellActive} onClick={() => selectDomeFinish(true)}><strong>Wood shell</strong><span>40 opaque infill panels · visual concept</span></button>
                <button type="button" className={viewMode === "parts" ? "active" : ""} aria-pressed={viewMode === "parts"} onClick={() => selectViewFromDrawer("parts")}><strong>Parts laid out</strong><span>All pieces before assembly</span></button>
                <button type="button" className={viewMode === "platform" ? "active" : ""} aria-pressed={viewMode === "platform"} onClick={() => selectViewFromDrawer("platform")}><strong>Entrance + platform</strong><span>36 × 58 in crouch opening · all-wood goal · unengineered</span></button>
                <button type="button" className={viewMode === "site" ? "active" : ""} aria-pressed={viewMode === "site"} onClick={() => selectViewFromDrawer("site")}><strong>Site context</strong><span>Exact dome · approximate placement</span></button>
                <button type="button" className={viewMode === "joinery" ? "active study" : "study"} aria-pressed={viewMode === "joinery"} onClick={selectJointFromDrawer}><strong>Joint clearance</strong><span>Digital geometry only</span></button>
              </div>
            </section>
            <section className="control-section explore-information" aria-labelledby="information-heading">
              <div className="section-heading"><h2 id="information-heading">Understand the project</h2></div>
              <div className="drawer-choice-grid">
                <button type="button" onClick={() => openPanelFromExplore("geometry")}>Start here</button>
                <button type="button" onClick={() => openPanelFromExplore("layers")}>Model layers</button>
                <button type="button" onClick={() => openPanelFromExplore("schedule")}>Audit & data</button>
                <button type="button" onClick={() => { setActivePanel(null); setMessageOpen(true); }}>Review note</button>
                {selectedMember ? <button type="button" onClick={() => openPanelFromExplore("details")}>Selected · {selectedMember.pieceId}</button> : null}
              </div>
            </section>
            <details className="camera-details">
              <summary>Camera views and controls</summary>
              <div className="camera-details-body">
                <div className="section-heading"><h2>Dome camera</h2><button type="button" onClick={resetCamera}>Reset</button></div>
                <div className="drawer-choice-grid">{DOME_VIEWS.map((view) => <button key={view.key} type="button" className={viewMode === view.key ? "active" : ""} aria-pressed={viewMode === view.key} aria-label={view.label} onClick={() => selectViewFromDrawer(view.key)}>{view.short}</button>)}</div>
                <div className="camera-tools" aria-label="Camera controls"><button type="button" onClick={() => setAzimuthStep((value) => value - 1)} aria-label="Rotate view left 15 degrees">↶ 15°</button><button type="button" onClick={() => setZoom((value) => Math.max(.65, value - .1))} aria-label="Zoom out">−</button><button type="button" onClick={() => setZoom((value) => Math.min(1.6, value + .1))} aria-label="Zoom in">+</button><button type="button" onClick={() => setAzimuthStep((value) => value + 1)} aria-label="Rotate view right 15 degrees">15° ↷</button></div>
              </div>
            </details>
          </aside>
        ) : null}

        {activePanel === "layers" ? (
          <aside className="layers-panel workbench-drawer" id="layers-drawer" tabIndex={-1} aria-label="Model layers">
            <div className="panel-heading"><span>LAYERS</span><button type="button" onClick={() => closePanel("layers")} aria-label="Close layers">×</button></div>
            {viewMode === "joinery" ? <section className="panel-mode-note"><strong>Current joint clearance study is active.</strong><p>The opaque timber stubs, hub study envelope, tenons, pocket wires, axes, and labels are separated in this dedicated joint view. Physical fit is not established. Dome-wide layers return with the assembly.</p><div><button type="button" onClick={returnToDome}>Back to whole dome</button></div></section> : viewMode === "parts" || viewMode === "site" ? <section className="panel-mode-note"><strong>{viewMode === "parts" ? "Parts layout uses a fixed accessible inventory." : "Site context uses a fixed presentation overlay."}</strong><p>{viewMode === "parts" ? "Layer and camera controls do not apply to the laid-out inventory. Open Whole dome or Platform to isolate model layers." : "The site photo and exact dome overlay stay locked together so the placement caveat remains clear. Open Whole dome or Platform for layer controls."}</p><div><button type="button" onClick={returnToDome}>Open whole dome</button><button type="button" onClick={() => selectView("platform")}>Open platform</button></div></section> : (
              <>
                <section className="control-section layer-section" aria-labelledby="layers-heading">
                  <div className="section-heading"><h2 id="layers-heading">Visibility stack</h2><button type="button" onClick={showAllLayers}>{viewMode === "platform" ? "Platform default" : "Show all"}</button></div>
                  {(viewMode === "platform" ? ["Dome structure", "Platform concept", "Documentation", "Context"] as const : ["Dome structure", "Documentation", "Context"] as const).map((group) => <div className="layer-group" key={group}><h3>{group}</h3>{LAYERS.filter((layer) => layer.group === group).map((layer) => <LayerControl key={layer.key} layer={layer} visible={displayedLayers[layer.key]} onToggle={() => toggleLayer(layer.key)} onSolo={() => soloLayer(layer.key)} />)}{group === "Dome structure" && displayedLayers.panels ? <p className="layer-group-note">{viewMode === "platform" ? `${DOME_MODEL.faces.length - ENTRANCE_STUDY.hiddenFaceIds.length} wood faces are visible; six canonical faces are hidden only for the entrance study.` : "The 40 opaque wood faces are a finish visualization only—not a panel schedule, structural diaphragm, weather enclosure, or acoustic result."}</p> : null}{group === "Platform concept" ? <p className="layer-group-note">Unengineered all-wood connection goal. Joint sizes, opening reinforcement, loads, weathering, and acoustics remain unresolved.</p> : null}</div>)}
                </section>
                {viewMode !== "platform" ? <section className="control-section" aria-labelledby="member-filter-heading">
                  <div className="section-heading"><h2 id="member-filter-heading">Member filter</h2></div>
                  <div className="member-filters" aria-label="Timber class filter">
                    {(["all", "S", "L"] as const).map((filter) => <button key={filter} type="button" className={memberFilter === filter ? "active" : ""} aria-pressed={memberFilter === filter} onClick={() => setMemberFilter(filter)}>{filter === "all" ? "ALL 65" : filter === "S" ? "SHORT 30" : "LONG 35"}</button>)}
                  </div>
                </section> : null}
                <section className="control-section display-section" aria-labelledby="display-heading">
                  <div className="section-heading"><h2 id="display-heading">Presentation</h2></div>
                  {viewMode !== "platform" ? <label className="range-control"><span><b>Exploded view</b><output>{Math.round(explode * 100)}%</output></span><input type="range" min="0" max="1" step="0.02" value={explode} onChange={(event) => setExplode(Number(event.target.value))} /></label> : null}
                  <button type="button" className={`wide-toggle ${automaticOrbitEnabled ? "active" : ""}`} onClick={() => setAutoRotate((value) => !value)} aria-pressed={automaticOrbitEnabled} disabled={prefersReducedMotion || !automaticOrbitAvailable} title={prefersReducedMotion ? "Disabled because reduced motion is enabled in your system settings." : !automaticOrbitAvailable ? "Automatic orbit is available in the 3D dome and Platform views." : undefined}>
                    {prefersReducedMotion ? "Automatic orbit disabled" : !automaticOrbitAvailable ? "Orbit available in 3D + Platform" : automaticOrbitEnabled ? "Stop automatic orbit" : "Start automatic orbit"}
                  </button>
                </section>
              </>
            )}
          </aside>
        ) : null}

        {activePanel === "geometry" ? (
          <aside className="layers-panel workbench-drawer" id="geometry-drawer" tabIndex={-1} aria-label="Start here project guide">
            <div className="panel-heading"><span>START HERE</span><button type="button" onClick={() => closePanel("geometry")} aria-label="Close project guide">×</button></div>
            <section className="guide-intro">
              <p>12 FT · 2V HEMISPHERE</p>
              <h2>What Jantz is looking at</h2>
              <span>This is the complete centerline geometry reference: the dome&rsquo;s shape, topology, and node-to-node timber axes.</span>
            </section>
            <section className="project-card">
              <p>{PROJECT.geometryMethod}</p>
              <div><span><b>{DOME_MODEL.edges.length}</b> member axes</span><span><b>{DOME_MODEL.vertices.length}</b> nodes</span><span><b>{DOME_MODEL.faces.length}</b> faces</span></div>
            </section>
            <section className="guide-measure-note">
              <strong>What “144 in node-center diameter” means</strong>
              <p>The centers of opposite base nodes are exactly 144 inches apart: a 12 ft nominal diameter. The finished outside footprint can change once physical hub bodies, timber thickness, and connection details are finalized.</p>
              <strong className="guide-headroom-heading">Can an adult stand inside?</strong>
              <p><b>72.000 in is the apex node-center height, not usable headroom.</b> The current joint envelope reaches {REDESIGN_STUDY.hubEnvelope.radialInboard.toFixed(3)} in inward at the apex, suggesting no more than about {(PROJECT.radiusInches - REDESIGN_STUDY.hubEnvelope.radialInboard).toFixed(3)} in of conceptual center clearance before final joinery and enclosure. A 6 ft adult would not stand comfortably upright; normal walk-in use needs a larger radius or an engineered raised base wall.</p>
            </section>
            <section className="guide-goals" aria-labelledby="guide-goals-heading">
              <p>DESIGN OBJECTIVE</p>
              <h2 id="guide-goals-heading">Stable · weather-resistant · acoustically intentional</h2>
              <div>
                <article><strong>Stable structure</strong><span>Load path, timber capacity, joint strength, opening reinforcement, wind uplift, seismic response, anchorage, and foundations require engineering.</span></article>
                <article><strong>Weather enclosure</strong><span>Cladding, drainage plane, ventilation, flashing, penetrations, wood durability, and moisture movement have not been detailed.</span></article>
                <article><strong>Resonant interior</strong><span>The enclosed volume, openings, intended use, target response, absorption, and diffusion must be modeled, prototyped, and measured before acoustic claims are issued.</span></article>
              </div>
            </section>
            <section className="guide-status" aria-label="Project release status">
              <div><span className="pass-dot" /><p><strong>Centerline geometry</strong><small>Verified</small></p></div>
              <div><span className="study-dot" /><p><strong>Digital joint geometry</strong><small>Spatial clearance verified in model only</small></p></div>
              <div><span className="open-dot" /><p><strong>Entrance + platform</strong><small>36 × 58 in crouch study · all-wood goal · shell topology changes</small></p></div>
              <div><span className="open-dot" /><p><strong>Weather enclosure</strong><small>Not designed · no drainage or durability details</small></p></div>
              <div><span className="open-dot" /><p><strong>Acoustic performance</strong><small>Not modeled or measured · no frequencies issued</small></p></div>
              <div><span className="open-dot" /><p><strong>Structure + fabrication</strong><small>Not approved · do not mass-cut</small></p></div>
            </section>
            <section className="guide-path" aria-labelledby="guide-path-heading">
              <h2 id="guide-path-heading">Explore in this order</h2>
              <button type="button" onClick={() => selectViewFromDrawer("iso")}><b>1</b><span><strong>Whole dome</strong><small>Rotate the complete assembly</small></span></button>
              <button type="button" onClick={() => selectViewFromDrawer("parts")}><b>2</b><span><strong>Parts laid out</strong><small>See every member before assembly</small></span></button>
              <button type="button" onClick={() => selectViewFromDrawer("platform")}><b>3</b><span><strong>Entrance + platform</strong><small>Approach aligned · all-wood goal · replacement load path open</small></span></button>
              <button type="button" onClick={() => selectViewFromDrawer("site")}><b>4</b><span><strong>Site context</strong><small>Exact dome geometry · approximate placement</small></span></button>
              <button type="button" onClick={() => { selectJointStudy(); setActivePanel(null); }}><b>5</b><span><strong>Joint clearance study</strong><small>Spatial check · not engineering</small></span></button>
            </section>
          </aside>
        ) : null}

        {activePanel === "details" ? (
          <div className="details-drawer" id="details-drawer" tabIndex={-1} aria-label="Parts and selected member">
            <Inspector member={selectedMember} isolated={isolateSelected} onIsolate={() => setIsolateSelected((value) => !value)} onPrevious={() => selectRelative(-1)} onNext={() => selectRelative(1)} onBrowse={openScheduleFromSkipLink} onClear={() => closePanel("details")} />
          </div>
        ) : null}

        {activePanel === "schedule" ? (
          <section ref={scheduleRef} className="schedule-panel workbench-drawer" id="schedule-drawer" tabIndex={-1} aria-label="Audit data and schedules">
            <div className="panel-heading"><span>AUDIT REFERENCE · NOT FOR FABRICATION</span><button type="button" onClick={() => closePanel("schedule")} aria-label="Close geometry audit reference">×</button></div>
            <div className="schedule-toolbar">
              <div className="schedule-tabs" role="tablist" aria-label="Choose geometry schedule">
                {SCHEDULE_TABS.map((tab) => <button key={tab} id={`schedule-tab-${tab}`} type="button" role="tab" tabIndex={scheduleTab === tab ? 0 : -1} aria-selected={scheduleTab === tab} aria-controls="schedule-tab-panel" className={scheduleTab === tab ? "active" : ""} onClick={() => setScheduleTab(tab)} onKeyDown={(event) => handleScheduleTabKeyDown(event, tab)}>{tab === "summary" ? "Summary" : tab === "members" ? `Members / ${MEMBERS.length}` : tab === "hubs" ? `Nodes / ${DOME_MODEL.vertices.length}` : tab === "joinery" ? "Joint study" : "Geometry checks"}</button>)}
              </div>
              {scheduleTab === "members" ? <label className="member-search"><span>Search pieces or nodes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="S-01, V012…" /></label> : null}
              <div className="schedule-exports"><button type="button" onClick={exportCsv}>Export CSV</button><button type="button" onClick={exportJson}>Audit JSON</button></div>
            </div>
            <div className="schedule-scroll" id="schedule-tab-panel" role="tabpanel" aria-labelledby={`schedule-tab-${scheduleTab}`}>
              {scheduleTab === "summary" ? (
                <div className="audit-overview">
                  <section><p>PROJECT STATUS</p><h2>Reference model · not a fabrication release</h2><span>The dome shape and member axes are verified. Finished cuts, joint strength, the platform, entrance reinforcement, foundation, anchorage, loads, enclosure, acoustics, permits, and construction approval are not issued.</span></section>
                  <section><h2>Model at a glance</h2><dl><div><dt>Dome</dt><dd>144.000 in node-center · verified</dd></div><div><dt>Topology</dt><dd>65 timbers · 26 nodes · 40 faces</dd></div><div><dt>Wood infill templates</dt><dd>30 × P1 · 10 × P2 · gross only</dd></div><div><dt>Gross face area</dt><dd>{WOOD_PANEL_CONCEPT.grossTotalAreaSquareFeet.toFixed(3)} ft² · no waste allowance</dd></div><div><dt>Peak</dt><dd>72.000 in node-center · not clear height</dd></div><div><dt>Conceptual center clearance</dt><dd>≤ {(PROJECT.radiusInches - REDESIGN_STUDY.hubEnvelope.radialInboard).toFixed(3)} in · not issued</dd></div><div><dt>Platform</dt><dd>{PLATFORM_CONCEPT.diameterInches}.000 in nominal · all-wood goal · unengineered</dd></div><div><dt>Entrance study</dt><dd>{ENTRANCE_STUDY.clearWidthInches} × {ENTRANCE_STUDY.clearRiseInches} in crouch opening · hides 6 faces / 7 members / 1 node</dd></div><div><dt>Weather enclosure</dt><dd>Not designed</dd></div><div><dt>Acoustics</dt><dd>Not modeled or measured</dd></div><div><dt>Structure + foundation</dt><dd>Not engineered</dd></div></dl></section>
                  <AuditSummary /><JoinerySummary />
                </div>
              ) : null}
              {scheduleTab === "members" ? <table className="data-table member-table"><caption>All individual modeled members. Lengths are verified node-center chords, not finished cuts.</caption><thead><tr><th>Member ID</th><th>Class</th><th>Centerline</th><th>Start</th><th>End</th><th>Slope</th><th>Status</th></tr></thead><tbody>{filteredMembers.map((member) => { const orientation = memberOrientation(member); return <tr key={member.pieceId} className={selectedMemberId === member.pieceId ? "selected" : ""}><td><button type="button" aria-pressed={selectedMemberId === member.pieceId} onClick={() => chooseMember(member.pieceId)}>{member.pieceId}</button></td><td>{member.type === "S" ? "Short" : "Long"}</td><td>{member.length.toFixed(3)} in</td><td>{member.start}</td><td>{member.end}</td><td>{orientation.slope.toFixed(2)}°</td><td><span className="derived-status">Centerline verified</span></td></tr>; })}</tbody></table> : null}
              {scheduleTab === "hubs" ? <table className="data-table"><caption>All nodes and their topologically derived valence.</caption><thead><tr><th>Node</th><th>Node class</th><th>Location</th><th>X</th><th>Y / height</th><th>Z</th></tr></thead><tbody>{DOME_MODEL.vertices.map((vertex) => <tr key={vertex.id}><td>{vertex.id}</td><td>{vertex.valence}-way</td><td>{vertex.isBase ? "Base" : vertex.position[1] === PROJECT.radiusInches ? "Apex" : "Interior"}</td><td>{vertex.position[0].toFixed(3)} in</td><td>{vertex.position[1].toFixed(3)} in</td><td>{vertex.position[2].toFixed(3)} in</td></tr>)}</tbody></table> : null}
              {scheduleTab === "joinery" ? (
                <div className="joinery-audit-grid">
                  <JoinerySummary />
                  <section>
                    <h2>Current clearance geometry</h2>
                    <dl>
                      <div><dt>Shoulder faces</dt><dd>Normal to each member axis at S = {REDESIGN_STUDY.joinery.shoulderSetback.toFixed(3)} in</dd></div>
                      <div><dt>Radial slab</dt><dd>q = −{REDESIGN_STUDY.hubEnvelope.radialInboard.toFixed(3)} to +{REDESIGN_STUDY.hubEnvelope.radialOutboard.toFixed(3)} in</dd></div>
                      <div><dt>Two-shell split</dt><dd>q = {REDESIGN_STUDY.hubEnvelope.radialSplit.toFixed(3)} in · {REDESIGN_STUDY.hubEnvelope.innerShellThickness.toFixed(3)} + {REDESIGN_STUDY.hubEnvelope.outerShellThickness.toFixed(3)} in</dd></div>
                      <div><dt>Exact hub footprints</dt><dd>{REDESIGN_STUDY.bodyFamilies.map((family) => `${family.id} ${family.maximumPlanarDiameter.toFixed(3)}`).join(" · ")} in max planar diameter</dd></div>
                      <div><dt>Tenon study</dt><dd>{REDESIGN_STUDY.joinery.tenon.length.toFixed(3)} × {REDESIGN_STUDY.joinery.tenon.width.toFixed(3)} × {REDESIGN_STUDY.joinery.tenon.thickness.toFixed(3)} in</dd></div>
                      <div><dt>Oversized pocket test</dt><dd>{REDESIGN_STUDY.pocketEnvelope.length.toFixed(3)} × {REDESIGN_STUDY.pocketEnvelope.width.toFixed(3)} × {REDESIGN_STUDY.pocketEnvelope.thickness.toFixed(3)} in</dd></div>
                      <div><dt>Member roll</dt><dd>{REDESIGN_STUDY.selectedRoll} · fixed study condition</dd></div>
                      <div><dt>H4 base condition</dt><dd>{REDESIGN_STUDY.hubEnvelope.h4ClosureBelowDatum.toFixed(3)} in below node datum · recess or raised datum required</dd></div>
                    </dl>
                  </section>
                  <section>
                    <h2>Exact clearance record</h2>
                    <p><strong>{REDESIGN_STUDY.sampledPocketCollisions} of {REDESIGN_STUDY.sampledPairTests.toLocaleString()}</strong> sampled pocket pairs overlap. Minimum sampled separating-axis margin: <strong>{REDESIGN_STUDY.minimumSampledPocketSeparation.toFixed(3)} in</strong>. Full 1.5 × 1.5 in member envelopes also record {REDESIGN_STUDY.externalMemberCollisions} collisions across {REDESIGN_STUDY.externalMemberPairTests.toLocaleString()} sampled pair checks.</p>
                    <dl>
                      <div><dt>Continuous-roll pocket bound</dt><dd>{REDESIGN_STUDY.continuousRollPocketCollisions}/{REDESIGN_STUDY.continuousRollPocketPairTests} collisions · {REDESIGN_STUDY.minimumContinuousRollPocketSeparation.toFixed(3)} in minimum gap</dd></div>
                      <div><dt>Split through every pocket</dt><dd>{REDESIGN_STUDY.minimumPocketSplitPenetration.toFixed(3)} in minimum penetration on both sides</dd></div>
                      <div><dt>Full shoulder to other port faces</dt><dd>{REDESIGN_STUDY.minimumShoulderToOtherFaceClearance.toFixed(3)} in minimum clearance</dd></div>
                      <div><dt>H4 timber-to-bottom rim</dt><dd>{REDESIGN_STUDY.minimumH4ShoulderBottomRim.toFixed(3)} in</dd></div>
                      <div><dt>Key relief to non-own pocket</dt><dd>{REDESIGN_STUDY.minimumCrossKeyReliefToOtherPocketSeparation.toFixed(3)} in minimum · spatial only</dd></div>
                      <div><dt>Center bore to pocket</dt><dd>{REDESIGN_STUDY.minimumClampBoreToPocketSeparation.toFixed(3)} in minimum · spatial only</dd></div>
                    </dl>
                  </section>
                  <section>
                    <h2>Member-length mathematics · study only</h2>
                    <p>For this CAD candidate, L<sub>shoulder</sub> = L<sub>centerline</sub> − 2S and L<sub>tip-to-tip</sub> = L<sub>shoulder</sub> + 2t, with S = 4.000 in and t = 1.250 in. These explain the solids; they are not released cut lengths.</p>
                    <dl>
                      {REDESIGN_STUDY.memberLengthStudy.map((memberClass) => <div key={memberClass.type}><dt>{memberClass.type === "S" ? "Short" : "Long"} · {memberClass.count}</dt><dd>{memberClass.shoulderLength.toFixed(6)} in shoulder · {memberClass.tipToTipExtent.toFixed(6)} in modeled tip-to-tip</dd></div>)}
                    </dl>
                  </section>
                  <section>
                    <h2>Why this is not yet a joint detail</h2>
                    <p>A standard pegged mortise-and-tenon detail is unavailable in 1.500 × 1.500 in dressed stock. Capture, cross-key, and clamp geometry are spatial studies only. Retention, hub layup, grain, adhesive, mortise fit, assembly sequence, moisture behavior, loads, anchorage, prototype evidence, and engineering approval remain unset.</p>
                  </section>
                  <section>
                    <h2>Release boundary</h2>
                    <p>The Rev {PROJECT.revision} PDF records the canonical geometry, every timber and node ID, gross panel families and placement, the optional entrance patch, the platform concept, and the current clearance audit. It is not a cut list, shop drawing, blueprint, structural design, permit set, or fabrication release. Finished timber and panel cuts, machining datums, mortise fit, lamination, weather enclosure, acoustics, CNC paths, and structural capacity remain withheld.</p>
                  </section>
                </div>
              ) : null}
              {scheduleTab === "audit" ? <div className="audit-grid"><AuditSummary /><section><h2>Topology invariants</h2>{Object.entries(DOME_MODEL.audit.checks).map(([check, passed]) => <div className="audit-check" key={check}><span className={passed ? "pass-dot" : "fail-dot"} /><span>{check.replace(/([A-Z])/g, " $1")}</span><strong>{passed ? "PASS" : "FAIL"}</strong></div>)}</section><section><h2>Model limits</h2><ul>{MODEL_ASSUMPTIONS.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section><section><h2>Connection record</h2>{JOINERY_NOTES.map(([label, value]) => <div className="audit-check" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section></div> : null}
            </div>
          </section>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <dialog ref={dialogRef} className="message-dialog" onCancel={() => setMessageOpen(false)} onClose={() => { setMessageOpen(false); window.requestAnimationFrame(() => reviewNoteButtonRef.current?.focus()); }} aria-labelledby="message-title" aria-describedby="message-dialog-summary">
        <form method="dialog"><button ref={dialogCloseRef} type="submit" className="dialog-close" aria-label="Close Jantz review note">×</button></form>
        <p id="message-dialog-summary" className="sr-only">The dome centerline is verified, while joint strength, structure, and fabrication approval remain open. This note is an audit handoff, not construction authorization.</p>
        <p className="dialog-kicker">CENTERLINE VERIFIED / DIGITAL CLEARANCE ONLY / NOT ENGINEERED</p>
        <h2 id="message-title">BLACK BELT BUILDING / JANTZ REVIEW NOTE</h2>
        <MessageBody />
        <div className="dialog-actions">
          <a className="dialog-pdf-link" href={PDF_PATH} download={PDF_DOWNLOAD_NAME} type="application/pdf" aria-label={`Download Black Belt Building dome field reference, revision ${PROJECT.revision}. Not for fabrication.`} onClick={() => notify("pdf")}>↓ Download Rev {PROJECT.revision} field reference PDF</a>
          <button type="button" className="copy-button" onClick={copyMessage}>{toast === "message" ? "Copied to clipboard ✓" : "Copy complete note"}</button>
        </div>
      </dialog>

      {toast && toast !== "message" ? <div className="toast" role="status">{toast === "csv" ? "Centerline CSV downloaded · not cut lengths" : toast === "json" ? "Geometry audit data downloaded · reference only" : `Rev ${PROJECT.revision} field reference downloaded · not for fabrication`}<span>✓</span></div> : null}
    </main>
  );
}
