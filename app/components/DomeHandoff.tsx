"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AuditHubValence, JointStudyMode, LayerState, MemberFilter, ViewMode } from "./DomeScene";
import type { TenonRollOrientation } from "@/lib/joinery";
import {
  DOME_MODEL,
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
  type DomeMember,
} from "@/lib/spec";

const DomeScene = dynamic(() => import("./DomeScene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status">Loading canonical geometry…</div>,
});

type LayerKey = keyof LayerState;
type ScheduleTab = "members" | "hubs" | "joinery" | "audit";
type Toast = "message" | "csv" | "json" | "pdf" | null;
type DomeView = Exclude<ViewMode, "joinery">;
type WorkbenchPanel = "view" | "layers" | "details" | "geometry" | "schedule" | null;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const vertexById = new Map(DOME_MODEL.vertices.map((vertex) => [vertex.id, vertex]));
const firstBaseVertex = vertexById.get(DOME_MODEL.baseVertexIds[0]);
const baseDatumDegrees = firstBaseVertex
  ? (Math.atan2(firstBaseVertex.position[2], firstBaseVertex.position[0]) * 180 / Math.PI + 360) % 360
  : 0;

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

const LAYERS: ReadonlyArray<{
  key: LayerKey;
  group: "Dome structure" | "Platform concept" | "Documentation" | "Context";
  label: string;
  count: number;
  swatch: string;
}> = [
  { key: "timber", group: "Dome structure", label: "Timber members", count: MEMBERS.length, swatch: "timber" },
  { key: "hubs", group: "Dome structure", label: "Node markers", count: DOME_MODEL.vertices.length, swatch: "hubs" },
  { key: "panels", group: "Dome structure", label: "Triangle faces", count: DOME_MODEL.faces.length, swatch: "panels" },
  { key: "platformDeck", group: "Platform concept", label: "Individual deck boards", count: PLATFORM_CONCEPT.deckBoardCount, swatch: "platform-deck" },
  { key: "platformFrame", group: "Platform concept", label: "Rim + radial frame", count: PLATFORM_CONCEPT.rimJoistCount + PLATFORM_CONCEPT.primaryJoistCount + PLATFORM_CONCEPT.centerHubCount, swatch: "platform-frame" },
  { key: "platformSupports", group: "Platform concept", label: "Independent supports", count: PLATFORM_CONCEPT.supportCount, swatch: "platform-supports" },
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
  { key: "geometry", label: "Geometry", accessibleLabel: "Open verified geometry summary" },
  { key: "schedule", label: "Specs", accessibleLabel: "Open geometry specifications and schedules" },
];

function subscribeToReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
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
      <div className="cut-warning"><span aria-hidden="true">!</span><p><strong>Centerline reference only.</strong> The original tenons overlap; the redesign clears spatial checks but still has no structural release. Finished timber dimensions remain withheld.</p></div>
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
  const primaryAudit = JOINERY_MODEL.collisionAudits[0];
  const alternateAudit = JOINERY_MODEL.collisionAudits[1];
  const originalFails = primaryAudit.allPairsCollide && alternateAudit.allPairsCollide;
  const redesignClears = REDESIGN_POCKET_AUDIT.allPairsClear && REDESIGN_STUDY.sampledPocketCollisions === 0;
  return (
    <section className={`joinery-summary${compact ? " compact" : ""}`} aria-label="Mortise and tenon audit">
      <div className="joinery-title"><span className={originalFails ? "fail-dot" : "pass-dot"} /><strong>{originalFails ? "FIRST TENON LAYOUT DOES NOT FIT" : "ORIGINAL LAYOUT NEEDS REVIEW"}</strong></div>
      <p>The original 3 in envelope drives every proposed tenon into the same central wood volume.</p>
      <div className="collision-counts">
        {primaryAudit.byValence.map((summary) => <span key={summary.valence}><b>{summary.collisionsPerHub}/{summary.pairsPerHub}</b> H{summary.valence} pairs overlap</span>)}
      </div>
      <div className="redesign-clearance-result"><span className={redesignClears ? "pass-dot" : "fail-dot"} /><p><strong>{redesignClears ? "REDESIGN SPATIAL CLEARANCE VERIFIED" : "REDESIGN INTERFERENCE FOUND"}</strong><small>{REDESIGN_STUDY.sampledPocketCollisions} of {REDESIGN_STUDY.sampledPairTests.toLocaleString()} sampled pocket pairs overlap · structural review remains open</small></p></div>
    </section>
  );
}

export default function DomeHandoff() {
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>(null);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("joinery");
  const [jointStudyMode, setJointStudyMode] = useState<JointStudyMode>("redesign");
  const [azimuthStep, setAzimuthStep] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [resetNonce, setResetNonce] = useState(0);
  const [auditHubValence, setAuditHubValence] = useState<AuditHubValence>(6);
  const [auditRoll, setAuditRoll] = useState<TenonRollOrientation>("width-radial");
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("members");
  const [query, setQuery] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [announcement, setAnnouncement] = useState("Canonical 2V geometry loaded.");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const scheduleRef = useRef<HTMLElement>(null);
  const scheduleFocusPendingRef = useRef(false);
  const lastDomeViewRef = useRef<DomeView>("iso");
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false);

  const selectedMember = MEMBERS.find((member) => member.pieceId === selectedMemberId) ?? null;
  const automaticOrbitEnabled = autoRotate && !prefersReducedMotion;
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
      window.requestAnimationFrame(() => dialogTitleRef.current?.focus());
    }
    if (!messageOpen && dialog.open) dialog.close();
  }, [messageOpen]);

  useEffect(() => {
    if (activePanel === "schedule" && scheduleFocusPendingRef.current) {
      scheduleFocusPendingRef.current = false;
      scheduleRef.current?.focus();
    }
  }, [activePanel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !messageOpen) {
        if (activePanel) {
          setActivePanel(null);
          setAnnouncement("Workbench panel closed.");
          window.setTimeout(() => document.getElementById(`${activePanel}-panel-button`)?.focus(), 0);
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
    setToast(value);
    window.setTimeout(() => setToast(null), 2400);
  };

  const chooseMember = (pieceId: string | null) => {
    const shouldMoveFocusToDetails = Boolean(document.activeElement?.closest("#schedule-drawer"));
    setSelectedMemberId(pieceId);
    if (!pieceId) {
      setIsolateSelected(false);
      setActivePanel((current) => current === "details" ? null : current);
    } else {
      setActivePanel("details");
    }
    const member = MEMBERS.find((candidate) => candidate.pieceId === pieceId);
    setAnnouncement(member ? `${member.pieceId} selected, ${member.length.toFixed(3)} inch centerline chord.` : "Member selection cleared.");
    if (pieceId && shouldMoveFocusToDetails) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>("#details-drawer .panel-heading button")?.focus(), 0);
    }
  };

  const togglePanel = (panel: Exclude<WorkbenchPanel, null>) => {
    const opening = activePanel !== panel;
    setActivePanel(opening ? panel : null);
    const panelName = panel === "details" ? "Parts" : panel === "schedule" ? "Specs" : panel;
    setAnnouncement(`${panelName} panel ${opening ? "opened" : "closed"}.`);
  };

  const closePanel = (panel: Exclude<WorkbenchPanel, null>) => {
    setActivePanel(null);
    window.setTimeout(() => document.getElementById(`${panel}-panel-button`)?.focus(), 0);
  };

  const openScheduleFromSkipLink = () => {
    setScheduleTab("members");
    setAnnouncement("Member schedule opened and focused.");
    if (activePanel === "schedule") {
      scheduleRef.current?.focus();
      return;
    }
    scheduleFocusPendingRef.current = true;
    setActivePanel("schedule");
  };

  const selectRelative = (direction: -1 | 1) => {
    const current = Math.max(0, MEMBERS.findIndex((member) => member.pieceId === selectedMemberId));
    const next = (current + direction + MEMBERS.length) % MEMBERS.length;
    chooseMember(MEMBERS[next].pieceId);
  };

  const toggleLayer = (key: LayerKey) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
    setAnnouncement(`${LAYERS.find((layer) => layer.key === key)?.label} ${layers[key] ? "hidden" : "shown"}.`);
  };

  const soloLayer = (key: LayerKey) => {
    setLayers({ timber: false, hubs: false, panels: false, platformDeck: false, platformFrame: false, platformSupports: false, dimensions: false, labels: false, ground: false, [key]: true });
    setAnnouncement(`${LAYERS.find((layer) => layer.key === key)?.label} isolated.`);
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
      members: MEMBERS,
    };
    downloadFile(`${PROJECT.id.toLowerCase()}-canonical-geometry.json`, JSON.stringify(artifact, null, 2), "application/json");
    notify("json");
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(JANTSZ_REVIEW_NOTE);
      notify("message");
      setAnnouncement("Jantsz review note copied to the clipboard.");
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

  const selectView = (nextView: ViewMode) => {
    if (nextView !== "joinery") lastDomeViewRef.current = nextView;
    setViewMode(nextView);
    if (nextView === "joinery") {
      setActivePanel((current) => current === "details" ? null : current);
      setSelectedMemberId(null);
      setIsolateSelected(false);
    }
    setResetNonce((value) => value + 1);
    const label = nextView === "joinery"
      ? `${jointStudyMode === "redesign" ? "Redesign clearance study" : "Original tenon overlap"} opened at the ${auditHubValence}-way node.`
      : `${DOME_VIEWS.find((view) => view.key === nextView)?.short ?? "Dome"} dome view selected.`;
    setAnnouncement(label);
  };

  const selectJointStudy = (study: JointStudyMode) => {
    setJointStudyMode(study);
    if (study === "redesign") setAuditRoll("width-radial");
    setViewMode("joinery");
    setActivePanel((current) => current === "details" ? null : current);
    setSelectedMemberId(null);
    setIsolateSelected(false);
    setResetNonce((value) => value + 1);
    setAnnouncement(study === "redesign"
      ? `Redesign clearance study opened at the ${auditHubValence}-way node. Zero tested pocket pairs overlap; structural review remains open.`
      : `Original tenon layout opened at the ${auditHubValence}-way node. The proposed tenons overlap.`);
  };

  const returnToDome = () => selectView(lastDomeViewRef.current);
  const selectViewFromDrawer = (nextView: ViewMode) => {
    selectView(nextView);
    setActivePanel(null);
    window.setTimeout(() => document.getElementById("view-panel-button")?.focus(), 0);
  };

  const auditPassed = Object.values(DOME_MODEL.audit.checks).every(Boolean);
  const redesignClearanceVerified = REDESIGN_POCKET_AUDIT.allPairsClear && REDESIGN_STUDY.sampledPocketCollisions === 0;
  const originalCollisionAudit = JOINERY_MODEL.collisionAudits.find((audit) => audit.orientation === auditRoll)!;
  const originalCollisionSummary = originalCollisionAudit.byValence.find((summary) => summary.valence === auditHubValence)!;
  const redesignCollisionSummary = REDESIGN_POCKET_AUDIT.byValence.find((summary) => summary.valence === auditHubValence)!;
  const selectedCollisionSummary = jointStudyMode === "redesign" ? redesignCollisionSummary : originalCollisionSummary;
  const displayedCollisionCount = selectedCollisionSummary.collisionsPerHub;

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
        <a className="cad-brand" href="#top" aria-label="Jantsz dome CAD home"><span className="cad-mark" aria-hidden="true">△</span><span><h1>JANTSZ / DOME CAD</h1><small>{PROJECT.id} · REV {PROJECT.revision}</small></span></a>
        <div className="model-status" role="status" aria-label={`${auditPassed ? "Dome centerline geometry verified" : "Dome geometry failed"}; ${redesignClearanceVerified ? "redesign spatial clearance verified, structural review open" : "redesign interference found"}`}><span className={auditPassed ? "pass-dot" : "fail-dot"} /><strong>{auditPassed ? "DOME VERIFIED" : "MODEL FAILED"}</strong><span className="study-state"><i className={redesignClearanceVerified ? "study-dot" : "fail-dot"} />{redesignClearanceVerified ? "REDESIGN · CLEARANCE ONLY" : "REDESIGN FAILED"}</span></div>
        <div className="top-actions">
          <button type="button" className="jantsz-note-trigger" onClick={() => setMessageOpen(true)}>Read review note</button>
          <a
            className="pdf-download"
            href="/downloads/jantsz-v2-dome-geometry-audit-rev-06.pdf"
            download="Jantsz-V2-Dome-Geometry-Audit-Rev-06.pdf"
            type="application/pdf"
            aria-label="Download Jantsz dome geometry and clearance audit PDF, revision 06. Not for fabrication."
            onClick={() => notify("pdf")}
          >
            <span aria-hidden="true">↓</span><span>Download PDF<small>Audit copy · Rev 06</small></span>
          </a>
        </div>
      </header>

      <div className="cad-grid" aria-hidden={messageOpen ? true : undefined} inert={messageOpen}>
        <section className="viewport-panel" aria-label="3D viewport">
          <div className="viewport-toolbar">
            <div className="viewport-title"><span>{viewMode === "joinery" ? jointStudyMode === "redesign" ? "JOINT / REDESIGN STUDY" : "JOINT / ORIGINAL ISSUE" : `DOME / ${viewMode === "iso" ? "3D" : viewMode.toUpperCase()}`}</span><strong>{viewMode === "joinery" ? jointStudyMode === "redesign" ? `H${auditHubValence} SPATIAL CLEARANCE` : `H${auditHubValence} TENONS OVERLAP` : `${PROJECT.diameterInches} IN NODE-CENTER DIAMETER`}</strong></div>
            <div className="mobile-safety-status" role="status" aria-label={`${auditPassed ? "Dome centerline verified" : "Dome geometry failed"}; ${redesignClearanceVerified ? "redesign clears spatial test, structural review open" : "redesign interference found"}`}><strong>{auditPassed ? "DOME VERIFIED" : "DOME FAILED"}</strong><span>{redesignClearanceVerified ? "CLEARANCE ONLY" : "REDESIGN FAILED"}</span></div>
            <div className="cad-navigation" role="toolbar" aria-label="Dome model controls">
              <div className="navigation-group mode-navigation">
                <span className="navigation-label">Mode</span>
                <div className="navigation-buttons" role="group" aria-label="Study mode">
                  <button type="button" className={viewMode !== "joinery" ? "active" : ""} aria-pressed={viewMode !== "joinery"} onClick={returnToDome}>Dome</button>
                  <button type="button" className={viewMode === "joinery" && jointStudyMode === "redesign" ? "active study" : "study"} aria-pressed={viewMode === "joinery" && jointStudyMode === "redesign"} onClick={() => selectJointStudy("redesign")}>Redesign</button>
                  <button type="button" className={viewMode === "joinery" && jointStudyMode === "original" ? "active danger" : "danger"} aria-pressed={viewMode === "joinery" && jointStudyMode === "original"} onClick={() => selectJointStudy("original")}>Old issue</button>
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
                <span>View</span><strong>{viewMode === "joinery" ? `${jointStudyMode === "redesign" ? "Redesign" : "Old issue"} · H${auditHubValence}` : `Dome · ${DOME_VIEWS.find((view) => view.key === viewMode)?.short}`}</strong>
              </button>
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
          <div className="model-viewport">
            <DomeScene
              layers={layers}
              memberFilter={memberFilter}
              selectedMemberId={selectedMemberId}
              isolateSelected={isolateSelected}
              explode={explode}
              autoRotate={automaticOrbitEnabled}
              viewMode={viewMode}
              azimuthStep={azimuthStep}
              zoom={zoom}
              resetNonce={resetNonce}
              auditHubValence={auditHubValence}
              auditRoll={auditRoll}
              jointStudyMode={jointStudyMode}
              onSelectMember={chooseMember}
            />
            {viewMode === "joinery" ? (
              <>
                {jointStudyMode === "original" ? (
                  <section className="audit-viewport-card" aria-labelledby="audit-viewport-title">
                    <p>BEFORE · ORIGINAL 3-IN HUB PROPOSAL</p>
                    <div><strong id="audit-viewport-title">H{auditHubValence}</strong><span><b>{displayedCollisionCount}/{selectedCollisionSummary.pairsPerHub}</b> tenon pairs overlap</span></div>
                    <dl><div><dt>Tangent apothem</dt><dd>1.500 in</dd></div><div><dt>Radial ref · not clipped</dt><dd>2.000 in</dd></div><div><dt>Tenon test</dt><dd>1.5 × 1.25 × 0.5 in</dd></div></dl>
                    <div className="audit-material-legend" aria-label="Original tenon test visual legend"><span><i className="wood" />Solid wood display stub</span><span><i className="tenon" />Red tenon volume</span><span><i className="reference" />Wire reference only</span></div>
                    <small>The proposed tenons stop only 0.059–0.077 in from the node center, so neighboring volumes occupy the same wood. The dome geometry itself is not the failure.</small>
                  </section>
                ) : (
                  <section className="audit-viewport-card redesign-viewport-card" aria-labelledby="audit-viewport-title">
                    <p>AFTER · PORT-NORMAL CLEARANCE STUDY</p>
                    <div><strong id="audit-viewport-title">H{auditHubValence}</strong><span><b>{displayedCollisionCount}/{selectedCollisionSummary.pairsPerHub}</b> pocket pairs overlap</span></div>
                    <dl><div><dt>Shoulder datum</dt><dd>Axis-normal · S 4.000 in</dd></div><div><dt>Radial slab</dt><dd>q −2.500 to +0.500 in</dd></div><div><dt>Tenon study</dt><dd>1.250 × 0.750 × 0.500 in</dd></div></dl>
                    <div className="audit-material-legend redesign-legend" aria-label="Redesign visual legend"><span><i className="wood" />Opaque timber member</span><span><i className="redesign-tenon" />Green tenon study</span><span><i className="pocket" />Oversized pocket envelope</span></div>
                    <small>The two shells split at q −1.000 in and the member roll is fixed width-radial. H4 extends 1.500 in below the base-node datum, requiring a recess or raised datum. Clearance only; strength, retention, fit, and fabrication remain open.</small>
                  </section>
                )}
                <div className="audit-hub-controls">
                  <div role="group" aria-label="Choose representative hub">
                    {([4, 5, 6] as const).map((valence) => { const summary = (jointStudyMode === "redesign" ? REDESIGN_POCKET_AUDIT.byValence : originalCollisionAudit.byValence).find((item) => item.valence === valence)!; return <button key={valence} type="button" className={auditHubValence === valence ? "active" : ""} aria-pressed={auditHubValence === valence} aria-label={`${valence}-way hub: ${summary.collisionsPerHub} of ${summary.pairsPerHub} ${jointStudyMode === "redesign" ? "pocket" : "tenon"} pairs overlap`} onClick={() => { setAuditHubValence(valence); setResetNonce((value) => value + 1); setAnnouncement(`${valence}-way ${jointStudyMode === "redesign" ? "redesign clearance" : "original overlap"} study selected.`); }}>H{valence}<span>{summary.collisionsPerHub}/{summary.pairsPerHub}</span></button>; })}
                  </div>
                  {jointStudyMode === "redesign"
                    ? <button type="button" className="audit-roll-button" disabled aria-label="Redesign member roll fixed width radial"><span>ROLL FIXED</span><strong>WIDTH-RADIAL</strong></button>
                    : <button type="button" className="audit-roll-button" onClick={() => { const next = auditRoll === "width-tangential" ? "width-radial" : "width-tangential"; setAuditRoll(next); setAnnouncement(`${next === "width-tangential" ? "Width-tangential" : "Width-radial"} legacy collision audit selected.`); }} aria-label={`Rotate legacy test tenons 90 degrees. Current orientation: ${auditRoll === "width-tangential" ? "width tangential" : "width radial"}`}><span>ROLL</span><strong>{auditRoll === "width-tangential" ? "0°" : "90°"}</strong></button>}
                  <button type="button" className="compare-study-button" onClick={() => selectJointStudy(jointStudyMode === "redesign" ? "original" : "redesign")}>{jointStudyMode === "redesign" ? "Why old failed" : "See redesign"}</button>
                  <button type="button" className="return-dome-button" onClick={returnToDome}>Back to dome</button>
                </div>
                <div className={`audit-watermark${jointStudyMode === "redesign" ? " redesign-watermark" : ""}`} aria-hidden="true">{jointStudyMode === "redesign" ? "CLEARANCE ONLY" : "TENONS OVERLAP"}</div>
              </>
            ) : (
              <>
                <div className="viewport-stamp"><span>NODE RADIUS</span><b>72.000 IN</b><span>BASE NODES</span><b>Ø 144.000 IN</b></div>
                <button type="button" className="viewport-safety-cta redesign-cta" onClick={() => selectJointStudy("redesign")}><span>JOINT REDESIGN STUDY</span><strong>Inspect verified spatial clearance</strong></button>
                <div className="viewport-legend"><span><i className="short" />SHORT · 39.350</span><span><i className="long" />LONG · 44.498</span><span><i className="hub" />SCHEMATIC NODE</span></div>
                <div className="viewport-mode">{selectedMember ? `${selectedMember.pieceId} SELECTED · OPEN PARTS` : "CLICK A TIMBER FOR PARTS"}</div>
              </>
            )}
          </div>
        </section>

        {activePanel === "view" ? (
          <aside className="layers-panel workbench-drawer view-drawer" id="view-drawer" aria-label="Choose model mode and view">
            <div className="panel-heading"><span>VIEW</span><button type="button" onClick={() => closePanel("view")} aria-label="Close view chooser">×</button></div>
            <section className="control-section" aria-labelledby="mode-drawer-heading">
              <div className="section-heading"><h2 id="mode-drawer-heading">Study mode</h2></div>
              <div className="drawer-choice-grid study-choice-grid" role="group" aria-label="Study mode">
                <button type="button" className={viewMode !== "joinery" ? "active" : ""} aria-pressed={viewMode !== "joinery"} onClick={() => selectViewFromDrawer(lastDomeViewRef.current)}>Dome</button>
                <button type="button" className={viewMode === "joinery" && jointStudyMode === "redesign" ? "active study" : "study"} aria-pressed={viewMode === "joinery" && jointStudyMode === "redesign"} onClick={() => { selectJointStudy("redesign"); setActivePanel(null); }}>Redesign</button>
                <button type="button" className={viewMode === "joinery" && jointStudyMode === "original" ? "active danger" : "danger"} aria-pressed={viewMode === "joinery" && jointStudyMode === "original"} onClick={() => { selectJointStudy("original"); setActivePanel(null); }}>Old issue</button>
              </div>
            </section>
            <section className="control-section" aria-labelledby="views-heading">
              <div className="section-heading"><h2 id="views-heading">Dome camera</h2><button type="button" onClick={resetCamera}>Reset</button></div>
              <div className="drawer-choice-grid">
                {DOME_VIEWS.map((view) => <button key={view.key} type="button" className={viewMode === view.key ? "active" : ""} aria-pressed={viewMode === view.key} aria-label={view.label} onClick={() => selectViewFromDrawer(view.key)}>{view.short}</button>)}
              </div>
              <div className="camera-tools" aria-label="Camera controls">
                <button type="button" onClick={() => setAzimuthStep((value) => value - 1)} aria-label="Rotate view left 15 degrees">↶ 15°</button>
                <button type="button" onClick={() => setZoom((value) => Math.max(.65, value - .1))} aria-label="Zoom out">−</button>
                <button type="button" onClick={() => setZoom((value) => Math.min(1.6, value + .1))} aria-label="Zoom in">+</button>
                <button type="button" onClick={() => setAzimuthStep((value) => value + 1)} aria-label="Rotate view right 15 degrees">15° ↷</button>
              </div>
            </section>
          </aside>
        ) : null}

        {activePanel === "layers" ? (
          <aside className="layers-panel workbench-drawer" id="layers-drawer" aria-label="Model layers">
            <div className="panel-heading"><span>LAYERS</span><button type="button" onClick={() => closePanel("layers")} aria-label="Close layers">×</button></div>
            {viewMode === "joinery" ? <section className="panel-mode-note"><strong>{jointStudyMode === "redesign" ? "Redesign clearance study is active." : "Original tenon overlap is active."}</strong><p>The opaque timber stubs, hub study envelope, tenons, pocket wires, axes, and labels are separated visually in this dedicated joint view. Dome-wide layers return with the assembly view.</p><div><button type="button" onClick={() => selectJointStudy(jointStudyMode === "redesign" ? "original" : "redesign")}>{jointStudyMode === "redesign" ? "Compare old issue" : "Compare redesign"}</button><button type="button" onClick={returnToDome}>Back to dome</button></div></section> : (
              <>
                <section className="control-section layer-section" aria-labelledby="layers-heading">
                  <div className="section-heading"><h2 id="layers-heading">Visibility stack</h2><button type="button" onClick={() => setLayers({ timber: true, hubs: true, panels: true, platformDeck: true, platformFrame: true, platformSupports: true, dimensions: true, labels: true, ground: true })}>Show all</button></div>
                  {(["Dome structure", "Platform concept", "Documentation", "Context"] as const).map((group) => <div className="layer-group" key={group}><h3>{group}</h3>{LAYERS.filter((layer) => layer.group === group).map((layer) => <LayerControl key={layer.key} layer={layer} visible={layers[layer.key]} onToggle={() => toggleLayer(layer.key)} onSolo={() => soloLayer(layer.key)} />)}{group === "Platform concept" ? <p className="layer-group-note">Unengineered visual study. No acoustic field is shown because no acoustic model has been validated.</p> : null}</div>)}
                </section>
                <section className="control-section" aria-labelledby="member-filter-heading">
                  <div className="section-heading"><h2 id="member-filter-heading">Member filter</h2></div>
                  <div className="member-filters" aria-label="Timber class filter">
                    {(["all", "S", "L"] as const).map((filter) => <button key={filter} type="button" className={memberFilter === filter ? "active" : ""} aria-pressed={memberFilter === filter} onClick={() => setMemberFilter(filter)}>{filter === "all" ? "ALL 65" : filter === "S" ? "SHORT 30" : "LONG 35"}</button>)}
                  </div>
                </section>
                <section className="control-section display-section" aria-labelledby="display-heading">
                  <div className="section-heading"><h2 id="display-heading">Presentation</h2></div>
                  <label className="range-control"><span><b>Exploded view</b><output>{Math.round(explode * 100)}%</output></span><input type="range" min="0" max="1" step="0.02" value={explode} onChange={(event) => setExplode(Number(event.target.value))} /></label>
                  <button type="button" className={`wide-toggle ${automaticOrbitEnabled ? "active" : ""}`} onClick={() => setAutoRotate((value) => !value)} aria-pressed={automaticOrbitEnabled} disabled={prefersReducedMotion} title={prefersReducedMotion ? "Disabled because reduced motion is enabled in your system settings." : undefined}>
                    {prefersReducedMotion ? "Automatic orbit disabled" : automaticOrbitEnabled ? "Stop automatic orbit" : "Start automatic orbit"}
                  </button>
                </section>
              </>
            )}
          </aside>
        ) : null}

        {activePanel === "geometry" ? (
          <aside className="layers-panel workbench-drawer" id="geometry-drawer" aria-label="Verified geometry summary">
            <div className="panel-heading"><span>GEOMETRY</span><button type="button" onClick={() => closePanel("geometry")} aria-label="Close geometry summary">×</button></div>
            <section className="project-card">
              <p>{PROJECT.geometryMethod}</p>
              <div><span><b>{DOME_MODEL.edges.length}</b> member axes</span><span><b>{DOME_MODEL.vertices.length}</b> nodes</span><span><b>{DOME_MODEL.faces.length}</b> faces</span></div>
            </section>
            <dl className="property-list geometry-facts">
              <div><dt>Base node diameter</dt><dd>{PROJECT.diameterInches}.000 in</dd></div>
              <div><dt>Node radius / peak</dt><dd>{PROJECT.radiusInches}.000 in</dd></div>
              <div><dt>Base</dt><dd>Regular decagon</dd></div>
              <div><dt>Subdivision</dt><dd>2V hemisphere</dd></div>
              <div><dt>Coordinate datum</dt><dd>{DOME_MODEL.baseVertexIds[0]} at +{baseDatumDegrees.toFixed(3)}° from +X</dd></div>
            </dl>
            <AuditSummary compact />
            <JoinerySummary compact />
            <section className="platform-summary" aria-label="Acoustic platform concept status">
              <p>PLATFORM CONCEPT · UNENGINEERED</p>
              <h2>{PLATFORM_CONCEPT.diameterInches} in nominal plan</h2>
              <dl><div><dt>Deck boards</dt><dd>{PLATFORM_CONCEPT.deckBoardCount} individual pieces</dd></div><div><dt>Frame study</dt><dd>{PLATFORM_CONCEPT.rimJoistCount + PLATFORM_CONCEPT.primaryJoistCount + PLATFORM_CONCEPT.centerHubCount} pieces</dd></div><div><dt>Acoustic claims</dt><dd>WITHHELD</dd></div></dl>
              <button type="button" onClick={() => { setLayers((current) => ({ ...current, platformDeck: true, platformFrame: true, platformSupports: true })); setActivePanel("layers"); setAnnouncement("Unengineered platform concept shown. Acoustic performance is not modeled."); }}>Show platform concept layers</button>
            </section>
          </aside>
        ) : null}

        {activePanel === "details" ? (
          <div className="details-drawer" id="details-drawer" aria-label="Parts and selected member">
            <Inspector member={selectedMember} isolated={isolateSelected} onIsolate={() => setIsolateSelected((value) => !value)} onPrevious={() => selectRelative(-1)} onNext={() => selectRelative(1)} onBrowse={openScheduleFromSkipLink} onClear={() => closePanel("details")} />
          </div>
        ) : null}

        {activePanel === "schedule" ? (
          <section ref={scheduleRef} className="schedule-panel workbench-drawer" id="schedule-drawer" tabIndex={-1} aria-label="Geometry specifications and schedules">
            <div className="panel-heading"><span>AUDIT REFERENCE · NOT FOR FABRICATION</span><button type="button" onClick={() => closePanel("schedule")} aria-label="Close geometry audit reference">×</button></div>
            <div className="schedule-toolbar">
              <div className="schedule-tabs" role="tablist" aria-label="Choose geometry schedule">
                {(["members", "hubs", "joinery", "audit"] as const).map((tab) => <button key={tab} id={`schedule-tab-${tab}`} type="button" role="tab" aria-selected={scheduleTab === tab} aria-controls="schedule-tab-panel" className={scheduleTab === tab ? "active" : ""} onClick={() => setScheduleTab(tab)}>{tab === "members" ? `Members / ${MEMBERS.length}` : tab === "hubs" ? `Nodes / ${DOME_MODEL.vertices.length}` : tab === "joinery" ? "Joint redesign" : "Geometry audit"}</button>)}
              </div>
              {scheduleTab === "members" ? <label className="member-search"><span>Search pieces or nodes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="S-01, V012…" /></label> : null}
              <div className="schedule-exports"><button type="button" onClick={exportCsv}>CSV</button><button type="button" onClick={exportJson}>JSON</button></div>
            </div>
            <div className="schedule-scroll" id="schedule-tab-panel" role="tabpanel" aria-labelledby={`schedule-tab-${scheduleTab}`}>
              {scheduleTab === "members" ? <table className="data-table member-table"><caption>All individual modeled members. Lengths are verified node-center chords, not finished cuts.</caption><thead><tr><th>Member ID</th><th>Class</th><th>Centerline</th><th>Start</th><th>End</th><th>Slope</th><th>Status</th></tr></thead><tbody>{filteredMembers.map((member) => { const orientation = memberOrientation(member); return <tr key={member.pieceId} className={selectedMemberId === member.pieceId ? "selected" : ""}><td><button type="button" aria-pressed={selectedMemberId === member.pieceId} onClick={() => chooseMember(member.pieceId)}>{member.pieceId}</button></td><td>{member.type === "S" ? "Short" : "Long"}</td><td>{member.length.toFixed(3)} in</td><td>{member.start}</td><td>{member.end}</td><td>{orientation.slope.toFixed(2)}°</td><td><span className="derived-status">Centerline verified</span></td></tr>; })}</tbody></table> : null}
              {scheduleTab === "hubs" ? <table className="data-table"><caption>All nodes and their topologically derived valence.</caption><thead><tr><th>Node</th><th>Node class</th><th>Location</th><th>X</th><th>Y / height</th><th>Z</th></tr></thead><tbody>{DOME_MODEL.vertices.map((vertex) => <tr key={vertex.id}><td>{vertex.id}</td><td>{vertex.valence}-way</td><td>{vertex.isBase ? "Base" : vertex.position[1] === PROJECT.radiusInches ? "Apex" : "Interior"}</td><td>{vertex.position[0].toFixed(3)} in</td><td>{vertex.position[1].toFixed(3)} in</td><td>{vertex.position[2].toFixed(3)} in</td></tr>)}</tbody></table> : null}
              {scheduleTab === "joinery" ? (
                <div className="joinery-audit-grid">
                  <JoinerySummary />
                  <section>
                    <h2>Before / after clearance geometry</h2>
                    <dl>
                      <div><dt>Old tangent comparison</dt><dd>3.000 in across · every tested pair overlaps</dd></div>
                      <div><dt>Redesign shoulder faces</dt><dd>Normal to each member axis at S = {REDESIGN_STUDY.joinery.shoulderSetback.toFixed(3)} in</dd></div>
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
                    <p>The downloadable PDF records the centerline and clearance audit only. It is not a cut list, shop drawing, blueprint, structural design, permit set, or fabrication release. No finished timber lengths, machining datums, mortise fit, lamination schedule, CNC path, or structural capacity is issued.</p>
                  </section>
                </div>
              ) : null}
              {scheduleTab === "audit" ? <div className="audit-grid"><AuditSummary /><section><h2>Topology invariants</h2>{Object.entries(DOME_MODEL.audit.checks).map(([check, passed]) => <div className="audit-check" key={check}><span className={passed ? "pass-dot" : "fail-dot"} /><span>{check.replace(/([A-Z])/g, " $1")}</span><strong>{passed ? "PASS" : "FAIL"}</strong></div>)}</section><section><h2>Model limits</h2><ul>{MODEL_ASSUMPTIONS.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section><section><h2>Connection record</h2>{JOINERY_NOTES.map(([label, value]) => <div className="audit-check" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section></div> : null}
            </div>
          </section>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <dialog ref={dialogRef} className="message-dialog" onCancel={() => setMessageOpen(false)} onClose={() => setMessageOpen(false)} aria-labelledby="message-title" aria-describedby="message-safety-summary">
        <form method="dialog"><button type="submit" className="dialog-close" aria-label="Close Jantsz message">×</button></form>
        <p className="dialog-kicker">CENTERLINE VERIFIED / REDESIGN CLEARANCE ONLY</p>
        <h2 id="message-title" ref={dialogTitleRef} tabIndex={-1}>JANTSZ REVIEW NOTE</h2>
        <MessageBody />
        <div className="dialog-actions">
          <a className="dialog-pdf-link" href="/downloads/jantsz-v2-dome-geometry-audit-rev-06.pdf" download="Jantsz-V2-Dome-Geometry-Audit-Rev-06.pdf" type="application/pdf" onClick={() => notify("pdf")}>↓ Download audit PDF</a>
          <button type="button" className="copy-button" onClick={copyMessage}>{toast === "message" ? "Copied to clipboard ✓" : "Copy complete note"}</button>
        </div>
      </dialog>

      {toast && toast !== "message" ? <div className="toast" role="status">{toast === "csv" ? "Centerline CSV downloaded · not cut lengths" : toast === "json" ? "Geometry audit data downloaded · reference only" : "Audit PDF downloaded · not for fabrication"}<span>✓</span></div> : null}
    </main>
  );
}
