"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CONSTRUCTION_HOLDS_3V,
  DOME_MODEL_3V,
  MEMBERS_3V,
  MODEL_ASSUMPTIONS_3V,
  PANEL_FAMILIES_3V,
  PANELS_3V,
  PROJECT_3V,
  REFERENCE_SYSTEMS_3V,
  SOURCE_PLAN_3V,
  THREE_V_RELEASE_BOUNDARY,
} from "@/lib/spec3v";
import {
  makeV3CenterlineMemberCsv,
  V3_CENTERLINE_CSV_DOWNLOAD_NAME,
} from "@/lib/memberCsv3v";
import type { V3MemberFilter, V3LayerState, V3ViewMode } from "./DomeScene3V";

const DomeScene3V = dynamic(() => import("./DomeScene3V"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status">Loading audited 3V geometry…</div>,
});

type DisplayMode3V = "dome" | "parts";
type Panel3V = "explore" | "layers" | "audit" | null;
type LayerKey3V = keyof V3LayerState;

function restorePanelFocus3V(panel: Exclude<Panel3V, null>, prior: HTMLElement | null) {
  if (prior?.isConnected && prior.getClientRects().length) {
    prior.focus();
    return;
  }
  const stableId = panel === "layers" ? "v3-layers-button" : panel === "audit" ? "v3-audit-button" : "v3-explore-button";
  const stable = document.getElementById(stableId);
  if (stable?.getClientRects().length) stable.focus();
  else document.getElementById("v3-explore-button")?.focus();
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOBILE_LAYOUT_QUERY = "(max-width: 860px)";
const PDF_PATH_3V = "/downloads/black-belt-building-3v-geometry-field-reference-intake-01.pdf";
const PDF_DOWNLOAD_NAME_3V = "Black-Belt-Building-3V-Geometry-Field-Reference-Intake-01.pdf";

const DEFAULT_LAYERS_3V: V3LayerState = {
  timber: true,
  hubs: true,
  panels: false,
  dimensions: false,
  labels: false,
  ground: true,
};

const LAYERS_3V: ReadonlyArray<{
  key: LayerKey3V;
  label: string;
  count: number;
  swatch: string;
}> = [
  { key: "timber", label: "Unique member axes", count: MEMBERS_3V.length, swatch: "timber" },
  { key: "hubs", label: "Node locations", count: DOME_MODEL_3V.vertices.length, swatch: "hubs" },
  { key: "panels", label: "Gross triangular faces", count: DOME_MODEL_3V.faces.length, swatch: "panels" },
  { key: "dimensions", label: "Reference dimensions", count: 2, swatch: "dimensions" },
  { key: "labels", label: "Member + node IDs", count: MEMBERS_3V.length + DOME_MODEL_3V.vertices.length, swatch: "labels" },
  { key: "ground", label: "Ground + axes", count: 1, swatch: "ground" },
];

const VIEW_OPTIONS_3V: ReadonlyArray<{ key: V3ViewMode; label: string; short: string }> = [
  { key: "iso", label: "Show isometric 3D dome view", short: "3D" },
  { key: "plan", label: "Show top plan", short: "TOP" },
  { key: "front", label: "Show front elevation", short: "FRONT" },
  { key: "right", label: "Show right-side elevation", short: "SIDE" },
];

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
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PartsLayout3V({ onAudit, onInspect }: { onAudit: () => void; onInspect: (pieceId: string) => void }) {
  const classGroups = (["A", "B", "C"] as const).map((type) => ({
    type,
    members: MEMBERS_3V.filter((member) => member.type === type),
  }));

  return (
    <section className="parts-layout v3-parts-layout" aria-labelledby="v3-parts-title">
      <header className="parts-layout-header">
        <div>
          <p>3V GEOMETRY INVENTORY · BEFORE ASSEMBLY</p>
          <h2 id="v3-parts-title">Verified axes, nodes, and gross faces</h2>
        </div>
        <button type="button" onClick={onAudit}>Open 3V audit</button>
      </header>
      <p className="parts-layout-boundary v3-count-warning">
        <strong>No construction system is selected and no cut list is available.</strong> This screen inventories 165 verified node-center axes. The source panel method reports 315 face-edge pieces because adjoining modules duplicate shared boundaries; that count is reconciled, not a verified cut schedule. Doorway pieces remain unresolved.
      </p>
      <section className="v3-reference-systems" aria-labelledby="v3-reference-systems-title">
        <div className="parts-group-heading"><span id="v3-reference-systems-title">TWO DIFFERENT REFERENCE SYSTEMS</span><strong>DO NOT COMBINE COUNTS</strong></div>
        <div className="v3-reference-system-grid">
          {REFERENCE_SYSTEMS_3V.map((system) => (
            <article key={system.id}>
              <p>{system.eyebrow}</p>
              <h3>{system.label}</h3>
              <strong>{system.count} <span>{system.unit}</span></strong>
              <b>{system.status}</b>
              <small>{system.detail}</small>
            </article>
          ))}
        </div>
      </section>
      <div className="parts-inventory-columns v3-member-columns">
        {classGroups.map(({ type, members }) => (
          <section className={`parts-inventory-group v3-class-${type.toLowerCase()}`} key={type} aria-label={`${members.length} class ${type} node-center axes`}>
            <div className="parts-group-heading"><span>CLASS {type}</span><strong>{members.length} × {members[0]?.length.toFixed(3)} IN</strong></div>
            <div className="parts-piece-grid">
              {members.map((member) => (
                <button
                  type="button"
                  className="parts-piece"
                  key={member.pieceId}
                  aria-label={`${member.pieceId}, class ${member.type}, ${member.length.toFixed(3)} inch node-center chord; not a finished cut length. Open audit details.`}
                  onClick={() => onInspect(member.pieceId)}
                >
                  <i aria-hidden="true" /><b>{member.pieceId}</b>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="panel-inventory v3-panel-inventory" aria-labelledby="v3-face-families-title">
        <div className="parts-group-heading"><span id="v3-face-families-title">GROSS FACE FAMILIES</span><strong>105 TOTAL · NODE-CENTER</strong></div>
        <p className="panel-inventory-warning"><strong>Not panel cut dimensions.</strong> These triangles end at node axes and omit frame width, module duplication, bevels, seams, glazing, underlap, drainage, movement, doorway alterations, and weather detailing. Their planar interior angles are not saw or compound-bevel settings.</p>
        <div className="panel-family-grid">
          {PANEL_FAMILIES_3V.map((family) => (
            <section className={`panel-family v3-family-${family.family.toLowerCase()}`} key={family.family} aria-label={`${family.count} ${family.label} gross geometry references`}>
              <header><div><span>{family.family}</span><strong>{family.label}</strong></div><b>{family.count} FACES</b></header>
              <dl>
                <div><dt>Classes</dt><dd>{family.classSignature}</dd></div>
                <div><dt>Gross sides</dt><dd>{family.sideLengthsInches.map((side) => side.toFixed(3)).join(" / ")} in</dd></div>
                <div><dt>B-edge base × altitude to B</dt><dd>{family.baseLengthInches.toFixed(3)} × {family.grossHeightInches.toFixed(3)} in</dd></div>
                <div><dt>Planar interior angles</dt><dd>{family.anglesDegrees.map((angle) => angle.toFixed(3)).join("° / ")}°</dd></div>
              </dl>
              <ol className="panel-piece-grid">
                {PANELS_3V.filter((panel) => panel.family === family.family).map((panel) => (
                  <li className="panel-piece" key={panel.pieceId} aria-label={`${panel.pieceId}, canonical face ${panel.faceId}, gross ${panel.classSignature} face. Not a finished panel cut.`}>
                    <i aria-hidden="true" /><b>{panel.pieceId}</b><small>{panel.faceId}</small>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </section>

      <section className="node-inventory" aria-label="61 node locations grouped by valence">
        <div className="parts-group-heading"><span>NODE LOCATIONS</span><strong>61 TOTAL · LOCATIONS ONLY</strong></div>
        <div className="node-groups">
          {DOME_MODEL_3V.hubClasses.map((group) => (
            <div key={group.valence} aria-label={`${group.count} ${group.valence}-way node locations`}>
              <strong>H{group.valence} · {group.count}</strong>
              <div>{group.vertexIds.map((vertexId) => <span role="img" aria-label={`${vertexId}, ${group.valence}-way node location`} className={`node-piece h${group.valence}`} key={vertexId}>{vertexId.slice(1)}</span>)}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function ModelChoice3V() {
  return (
    <section className="control-section model-choice-section" aria-labelledby="v3-model-choice-title">
      <div className="section-heading"><h2 id="v3-model-choice-title">Choose dome geometry</h2></div>
      <div className="model-choice-grid">
        <Link href="/" className="model-choice-card">
          <span>2V · 12 FT</span><strong>Hemisphere</strong><small>Existing field reference · 65 axes</small>
        </Link>
        <div className="model-choice-card active" aria-current="page">
          <span>3V · 12 FT 8 IN</span><strong>5/8 cap</strong><small>Current view · 165 axes</small>
        </div>
      </div>
      <p className="model-choice-note">Each option has its own geometry and release boundary. 2V physical studies do not transfer to 3V.</p>
    </section>
  );
}

export default function DomeHandoff3V() {
  const [layers, setLayers] = useState<V3LayerState>(DEFAULT_LAYERS_3V);
  const [memberFilter, setMemberFilter] = useState<V3MemberFilter>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode3V>("dome");
  const [viewMode, setViewMode] = useState<V3ViewMode>("iso");
  const [activePanel, setActivePanel] = useState<Panel3V>(null);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [azimuthStep, setAzimuthStep] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [resetNonce, setResetNonce] = useState(0);
  const [announcement, setAnnouncement] = useState("Audited 3V centerline geometry loaded.");
  const [toast, setToast] = useState<string | null>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false);
  const mobileLayout = useSyncExternalStore(subscribeToMobileLayout, getMobileLayoutSnapshot, () => false);

  const selectedMember = useMemo(
    () => MEMBERS_3V.find((member) => member.pieceId === selectedMemberId) ?? null,
    [selectedMemberId],
  );
  const auditPassed = Object.values(DOME_MODEL_3V.audit.checks).every(Boolean);
  const automaticOrbitEnabled = autoRotate && !prefersReducedMotion && viewMode === "iso" && displayMode === "dome";

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activePanel) {
        const panel = activePanel;
        const trigger = panelTriggerRef.current;
        setActivePanel(null);
        setAnnouncement("Panel closed.");
        window.setTimeout(() => restorePanelFocus3V(panel, trigger), 0);
      } else if (selectedMemberId) {
        setSelectedMemberId(null);
        setIsolateSelected(false);
        setAnnouncement("Member selection cleared.");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, selectedMemberId]);

  const notify = (message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  };

  const openPanel = (panel: Exclude<Panel3V, null>) => {
    panelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opening = activePanel !== panel;
    setActivePanel(opening ? panel : null);
    setAnnouncement(`${panel} panel ${opening ? "opened" : "closed"}.`);
    if (opening) window.setTimeout(() => document.getElementById(`v3-${panel}-drawer`)?.focus(), 0);
  };

  const closePanel = () => {
    if (!activePanel) return;
    const panel = activePanel;
    const trigger = panelTriggerRef.current;
    setActivePanel(null);
    setAnnouncement("Panel closed.");
    window.setTimeout(() => restorePanelFocus3V(panel, trigger), 0);
  };

  const chooseMember = useCallback((pieceId: string | null) => {
    setSelectedMemberId(pieceId);
    if (!pieceId) setIsolateSelected(false);
    const member = MEMBERS_3V.find((candidate) => candidate.pieceId === pieceId);
    setAnnouncement(member
      ? `${member.pieceId} selected, ${member.length.toFixed(3)} inch node-center chord. This is not a cut length.`
      : "Member selection cleared.");
  }, []);

  const closePanelAfterSelection = () => {
    const panel = activePanel;
    const trigger = panelTriggerRef.current;
    setActivePanel(null);
    if (panel) window.setTimeout(() => restorePanelFocus3V(panel, trigger), 0);
  };

  const selectDome = (nextView: V3ViewMode = viewMode) => {
    setDisplayMode("dome");
    setViewMode(nextView);
    closePanelAfterSelection();
    setResetNonce((value) => value + 1);
    setAnnouncement(`${VIEW_OPTIONS_3V.find((view) => view.key === nextView)?.short ?? "3D"} 3V dome view selected.`);
  };

  const selectParts = () => {
    setDisplayMode("parts");
    closePanelAfterSelection();
    setAnnouncement("Accessible 3V geometry inventory opened. These are reference axes and gross faces, not cut parts.");
  };

  const inspectPart = (pieceId: string) => {
    panelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    chooseMember(pieceId);
    setActivePanel("audit");
    window.setTimeout(() => document.getElementById("v3-audit-drawer")?.focus(), 0);
  };

  const toggleLayer = (key: LayerKey3V) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
    setAnnouncement(`${LAYERS_3V.find((layer) => layer.key === key)?.label} ${layers[key] ? "hidden" : "shown"}.`);
  };

  const soloLayer = (key: LayerKey3V) => {
    setLayers({ timber: false, hubs: false, panels: false, dimensions: false, labels: false, ground: false, [key]: true });
    setAnnouncement(`${LAYERS_3V.find((layer) => layer.key === key)?.label} isolated.`);
  };

  const resetExperience = () => {
    setLayers(DEFAULT_LAYERS_3V);
    setMemberFilter("all");
    setSelectedMemberId(null);
    setIsolateSelected(false);
    setDisplayMode("dome");
    setViewMode("iso");
    setActivePanel(null);
    setExplode(0);
    setAutoRotate(false);
    setAzimuthStep(0);
    setZoom(1);
    setResetNonce((value) => value + 1);
    setAnnouncement("Complete 3V isometric centerline model restored.");
  };

  const exportCsv = () => {
    downloadFile(
      V3_CENTERLINE_CSV_DOWNLOAD_NAME,
      makeV3CenterlineMemberCsv(),
      "text/csv;charset=utf-8",
    );
    notify("3V node-center reference downloaded · not a cut list");
  };

  const exportJson = () => {
    downloadFile(`${PROJECT_3V.id.toLowerCase()}-geometry-audit.json`, JSON.stringify({
      project: PROJECT_3V,
      units: "inches",
      status: THREE_V_RELEASE_BOUNDARY,
      assumptions: MODEL_ASSUMPTIONS_3V,
      model: DOME_MODEL_3V,
      members: MEMBERS_3V,
      faceFamilies: PANEL_FAMILIES_3V,
      sourcePlanCrossCheck: SOURCE_PLAN_3V,
      referenceSystems: REFERENCE_SYSTEMS_3V,
      constructionHolds: CONSTRUCTION_HOLDS_3V,
    }, null, 2), "application/json");
    notify("3V geometry audit downloaded · reference only");
  };

  const modeLabel = displayMode === "parts"
    ? "3V · Geometry inventory"
    : `3V · ${layers.panels ? "Gross faces" : "Axis model"} · ${VIEW_OPTIONS_3V.find((view) => view.key === viewMode)?.short}`;

  return (
    <main className="cad-app v3-cad-app" id="top">
      <a className="skip-link" href="#v3-audit-drawer" onClick={(event) => { event.preventDefault(); openPanel("audit"); }}>Skip to 3V audit</a>
      <header className="cad-topbar">
        <button type="button" className="cad-brand cad-brand-button" aria-label="Reset the complete Black Belt Building 3V dome view" onClick={resetExperience}>
          <span className="cad-mark" aria-hidden="true">△</span>
          <span><span className="cad-brand-title">BLACK BELT BUILDING</span><small>JANTZ · {PROJECT_3V.id} · {PROJECT_3V.revision}</small></span>
        </button>
        <h1 className="sr-only">Black Belt Building 12 ft 8 in 3V dome reference</h1>
        <div className="model-status" aria-label={`${auditPassed ? "3V canonical geometry verified" : "3V model failed"}; construction not released`}>
          <span className={auditPassed ? "pass-dot" : "fail-dot"} />
          <strong>{auditPassed ? "3V GEOMETRY VERIFIED" : "3V MODEL FAILED"}</strong>
          <span>BUILD NOT RELEASED</span>
        </div>
        <div className="top-actions">
          <nav className="model-route-switch" aria-label="Choose dome geometry">
            <Link href="/">2V</Link><span aria-current="page">3V</span>
          </nav>
          <button type="button" className="v3-audit-trigger" onClick={() => openPanel("audit")}>3V data</button>
          <a
            className="pdf-download"
            href={PDF_PATH_3V}
            download={PDF_DOWNLOAD_NAME_3V}
            type="application/pdf"
            aria-label="Download the Black Belt Building 3V geometry and RFI field reference PDF. Not a fabrication or cut-list release."
            onClick={() => notify("3V geometry + RFI field PDF downloaded · not a cut list")}
          >
            <span aria-hidden="true">↓</span><span>3V PDF<small>Geometry + RFI holds</small></span>
          </a>
        </div>
      </header>

      <div className="cad-grid" data-panel-open={activePanel ?? undefined}>
        <section className="viewport-panel" aria-label="3V model viewport" aria-hidden={activePanel ? true : undefined} inert={Boolean(activePanel)}>
          <div className={`viewport-toolbar${selectedMember && displayMode === "dome" ? " has-mobile-selection" : ""}`}>
            <div className="viewport-title"><span>{displayMode === "parts" ? "3V / GEOMETRY INVENTORY" : `3V / ${viewMode === "iso" ? "3D" : viewMode.toUpperCase()}`}</span><strong>{displayMode === "parts" ? "165 AXES · 61 NODES · 105 FACES" : "152.000 IN MAX BOUNDARY-NODE SPAN"}</strong></div>
            <div className="mobile-safety-status" aria-label="3V geometry verified; construction not released"><strong>GEOMETRY VERIFIED</strong><span>BUILD NOT RELEASED</span></div>
            <div className={`cad-navigation${selectedMember && displayMode === "dome" ? " has-mobile-selection" : ""}`} aria-label="3V dome controls">
              <div className="navigation-group mode-navigation">
                <span className="navigation-label">Explore</span>
                <div className="navigation-buttons" role="group" aria-label="3V experience view">
                  <button type="button" className={displayMode === "dome" ? "active" : ""} aria-pressed={displayMode === "dome"} onClick={() => selectDome()}>Dome</button>
                  <button type="button" className={displayMode === "parts" ? "active" : ""} aria-pressed={displayMode === "parts"} aria-label="Open 3V geometry inventory" onClick={selectParts}>Inventory</button>
                </div>
              </div>
              <div className="navigation-group view-navigation">
                <span className="navigation-label">View</span>
                <div className="navigation-buttons" role="group" aria-label="3V camera view">
                  {VIEW_OPTIONS_3V.map((view) => <button key={view.key} type="button" className={displayMode === "dome" && viewMode === view.key ? "active" : ""} aria-pressed={displayMode === "dome" && viewMode === view.key} aria-label={view.label} onClick={() => selectDome(view.key)}>{view.short}</button>)}
                </div>
              </div>
              <button id="v3-explore-button" type="button" className={`mobile-view-trigger${activePanel === "explore" ? " active" : ""}`} aria-expanded={activePanel === "explore"} aria-controls="v3-explore-drawer" onClick={() => openPanel("explore")}>
                <span>Explore</span><strong>{modeLabel}</strong><i aria-hidden="true">⌄</i>
              </button>
              {selectedMember && displayMode === "dome" ? (
                <>
                  <button type="button" className="mobile-member-selection" aria-label={`Open audit details for ${selectedMember.pieceId}, ${selectedMember.length.toFixed(3)} inch node-center chord; not a finished cut length`} onClick={() => openPanel("audit")}><span>{selectedMember.pieceId}</span><strong>{selectedMember.length.toFixed(3)} IN · NOT A CUT</strong><i aria-hidden="true">NODE-CENTER</i></button>
                  <button type="button" className="mobile-clear-selection" aria-label={`Clear ${selectedMember.pieceId} selection`} onClick={() => chooseMember(null)}>×</button>
                </>
              ) : null}
              <nav className="navigation-group panel-navigation" aria-label="3V information panels">
                <span className="navigation-label">Panels</span>
                <div className="navigation-buttons">
                  <button id="v3-layers-button" type="button" className={activePanel === "layers" ? "active" : ""} aria-expanded={activePanel === "layers"} aria-controls="v3-layers-drawer" onClick={() => openPanel("layers")}>Layers</button>
                  <button id="v3-audit-button" type="button" className={activePanel === "audit" ? "active" : ""} aria-expanded={activePanel === "audit"} aria-controls="v3-audit-drawer" onClick={() => openPanel("audit")}>Audit</button>
                </div>
              </nav>
            </div>
          </div>

          <div className={`model-viewport mode-${displayMode === "parts" ? "parts" : viewMode}`}>
            {displayMode === "parts" ? <PartsLayout3V onAudit={() => openPanel("audit")} onInspect={inspectPart} /> : (
              <>
                <DomeScene3V
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
                  mobileLayout={mobileLayout}
                  onInteractionStart={() => setAutoRotate(false)}
                  onSelectMember={chooseMember}
                />
                <div className="viewport-stamp"><span>SPHERE RADIUS</span><b>{DOME_MODEL_3V.sphereRadius.toFixed(3)} IN</b><span>BOUNDARY</span><b>NONPLANAR · {DOME_MODEL_3V.audit.boundary.rippleInches.toFixed(3)} IN</b></div>
                <section className="viewport-overview-card" aria-labelledby="v3-overview-title">
                  <p>12 FT 8 IN · CLASS-I 3V · 5/8 CAP</p>
                  <h2 id="v3-overview-title">165 axes · 61 nodes · 105 faces</h2>
                  <span>Canonical centerline geometry is verified. Visual member thickness and node markers are arbitrary. Physical members, panels, doorway, pony wall, joinery, foundation, structure, weatherproofing, and fabrication are not issued.</span>
                  <div><button type="button" onClick={() => setLayers((current) => ({ ...current, panels: !current.panels }))}>{layers.panels ? "Hide gross faces" : "Show gross faces"}</button><button type="button" onClick={selectParts}>Geometry inventory</button><button type="button" onClick={() => openPanel("audit")}>Read audit</button></div>
                </section>
                <div className="viewport-legend v3-legend"><span><i className="v3-a" />A · {DOME_MODEL_3V.edgeClasses.find(({ type }) => type === "A")?.length.toFixed(3)}</span><span><i className="v3-b" />B · {DOME_MODEL_3V.edgeClasses.find(({ type }) => type === "B")?.length.toFixed(3)}</span><span><i className="v3-c" />C · {DOME_MODEL_3V.edgeClasses.find(({ type }) => type === "C")?.length.toFixed(3)}</span><span><i className="hub" />NODE</span></div>
                <div className="viewport-mode">{selectedMember ? `${selectedMember.pieceId} SELECTED · NODE-CENTER ONLY` : "DRAG TO ROTATE · PINCH TO ZOOM · TAP A MEMBER"}</div>
              </>
            )}
          </div>
        </section>

        {activePanel === "explore" ? (
          <aside className="layers-panel workbench-drawer view-drawer" id="v3-explore-drawer" tabIndex={-1} aria-label="Explore the 3V dome reference">
            <div className="panel-heading"><span>EXPLORE · 3V</span><button type="button" onClick={closePanel} aria-label="Close Explore menu">×</button></div>
            <ModelChoice3V />
            <section className="control-section" aria-labelledby="v3-experience-title">
              <div className="section-heading"><h2 id="v3-experience-title">What do you want to see?</h2></div>
              <div className="drawer-choice-grid experience-choice-grid">
                <button type="button" className={displayMode === "dome" && !layers.panels ? "active" : ""} aria-pressed={displayMode === "dome" && !layers.panels} onClick={() => { setLayers((current) => ({ ...current, panels: false })); selectDome(); }}><strong>Axis model</strong><span>165 unique centerlines</span></button>
                <button type="button" className={displayMode === "dome" && layers.panels ? "active finish" : "finish"} aria-pressed={displayMode === "dome" && layers.panels} onClick={() => { setLayers((current) => ({ ...current, panels: true })); selectDome(); }}><strong>Gross face surfaces</strong><span>105 geometry triangles</span></button>
                <button type="button" className={displayMode === "parts" ? "active" : ""} aria-pressed={displayMode === "parts"} onClick={selectParts}><strong>Geometry inventory</strong><span>Axes and gross faces · not cuts</span></button>
                <button type="button" onClick={() => openPanel("layers")}><strong>Layers</strong><span>Visibility and filters</span></button>
                <button type="button" onClick={() => openPanel("audit")}><strong>Audit</strong><span>Math and limits</span></button>
              </div>
            </section>
            <details className="camera-details">
              <summary>Camera views and controls</summary>
              <div className="camera-details-body">
                <div className="drawer-choice-grid">{VIEW_OPTIONS_3V.map((view) => <button key={view.key} type="button" className={displayMode === "dome" && viewMode === view.key ? "active" : ""} aria-pressed={displayMode === "dome" && viewMode === view.key} onClick={() => selectDome(view.key)}>{view.short}</button>)}</div>
                <div className="camera-tools" aria-label="Camera controls"><button type="button" onClick={() => setAzimuthStep((value) => value - 1)} aria-label="Rotate left 15 degrees">↶ 15°</button><button type="button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))} aria-label="Zoom out">−</button><button type="button" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} aria-label="Zoom in">+</button><button type="button" onClick={() => setAzimuthStep((value) => value + 1)} aria-label="Rotate right 15 degrees">15° ↷</button></div>
              </div>
            </details>
          </aside>
        ) : null}

        {activePanel === "layers" ? (
          <aside className="layers-panel workbench-drawer" id="v3-layers-drawer" tabIndex={-1} aria-label="3V model layers">
            <div className="panel-heading"><span>3V LAYERS</span><button type="button" onClick={closePanel} aria-label="Close layers">×</button></div>
            {displayMode === "parts" ? <section className="panel-mode-note"><strong>Geometry inventory is a fixed accessible reference.</strong><p>Its axes and gross faces are not finished parts. Return to the dome to isolate visual layers.</p><div><button type="button" onClick={() => selectDome()}>Open whole dome</button></div></section> : (
              <>
                <section className="control-section layer-section" aria-labelledby="v3-layers-heading">
                  <div className="section-heading"><h2 id="v3-layers-heading">Visibility stack</h2><button type="button" onClick={() => setLayers({ timber: true, hubs: true, panels: true, dimensions: true, labels: true, ground: true })}>Show all</button></div>
                  <div className="layer-group"><h3>3V centerline model</h3>{LAYERS_3V.map((layer) => <div className="layer-row" key={layer.key}><button type="button" className="layer-switch" aria-pressed={layers[layer.key]} onClick={() => toggleLayer(layer.key)}><i className={`layer-swatch ${layer.swatch}`} aria-hidden="true" /><span className="layer-name">{layer.label}</span><span className="layer-count">{layer.count}</span><span className="visibility-icon" aria-hidden="true">{layers[layer.key] ? "●" : "○"}</span></button><button type="button" className="solo-button" onClick={() => soloLayer(layer.key)} aria-label={`Show only ${layer.label}`}>SOLO</button></div>)}</div>
                </section>
                <section className="control-section" aria-labelledby="v3-filter-title">
                  <div className="section-heading"><h2 id="v3-filter-title">Member class filter</h2></div>
                  <div className="member-filters v3-member-filters">{(["all", "A", "B", "C"] as const).map((filter) => <button key={filter} type="button" className={memberFilter === filter ? "active" : ""} aria-pressed={memberFilter === filter} onClick={() => setMemberFilter(filter)}>{filter === "all" ? "ALL 165" : `${filter} ${DOME_MODEL_3V.edgeClasses.find(({ type }) => type === filter)?.count}`}</button>)}</div>
                </section>
                <section className="control-section display-section" aria-labelledby="v3-display-title">
                  <div className="section-heading"><h2 id="v3-display-title">Presentation</h2></div>
                  <label className="range-control"><span><b>Exploded view</b><output>{Math.round(explode * 100)}%</output></span><input type="range" min="0" max="1" step="0.02" value={explode} onChange={(event) => setExplode(Number(event.target.value))} /></label>
                  <button type="button" className={`wide-toggle ${automaticOrbitEnabled ? "active" : ""}`} onClick={() => setAutoRotate((value) => !value)} aria-pressed={automaticOrbitEnabled} disabled={prefersReducedMotion || viewMode !== "iso"}>{prefersReducedMotion ? "Automatic orbit disabled" : viewMode !== "iso" ? "Orbit available in 3D" : automaticOrbitEnabled ? "Stop automatic orbit" : "Start automatic orbit"}</button>
                  {selectedMember ? <button type="button" className={`wide-toggle ${isolateSelected ? "active" : ""}`} aria-pressed={isolateSelected} onClick={() => setIsolateSelected((value) => !value)}>{isolateSelected ? `Show all with ${selectedMember.pieceId}` : `Isolate ${selectedMember.pieceId}`}</button> : null}
                </section>
              </>
            )}
          </aside>
        ) : null}

        {activePanel === "audit" ? (
          <aside className="schedule-panel workbench-drawer v3-audit-drawer" id="v3-audit-drawer" tabIndex={-1} aria-label="3V geometry audit and release boundary">
            <div className="panel-heading"><span>3V AUDIT · {PROJECT_3V.revision}</span><button type="button" onClick={closePanel} aria-label="Close 3V audit">×</button></div>
            <div className="v3-audit-actions">
              <a
                className="v3-audit-pdf-action"
                href={PDF_PATH_3V}
                download={PDF_DOWNLOAD_NAME_3V}
                type="application/pdf"
                aria-label="Download the 3V geometry and RFI field reference PDF. Not a fabrication or cut-list release."
                onClick={() => notify("3V geometry + RFI field PDF downloaded · not a cut list")}
              >
                ↓ 3V field PDF · geometry + RFI
              </a>
              <button type="button" onClick={exportCsv}>Node-center CSV · not cut list</button>
              <button type="button" onClick={exportJson}>Download audit JSON</button>
            </div>
            <div className="v3-audit-scroll">
              {selectedMember ? <section className="v3-selected-member" aria-labelledby="v3-selected-title"><p>SELECTED UNIQUE AXIS</p><h2 id="v3-selected-title">{selectedMember.pieceId} · {selectedMember.length.toFixed(3)} in</h2><dl><div><dt>Class</dt><dd>{selectedMember.type}</dd></div><div><dt>Nodes</dt><dd>{selectedMember.start} → {selectedMember.end}</dd></div><div><dt>Status</dt><dd>Node-center chord · not a cut</dd></div></dl><button type="button" onClick={() => chooseMember(null)}>Clear selection</button></section> : null}
              <section className="v3-audit-intro"><p>CANONICAL GEOMETRY VERIFIED</p><h2>3V 5/8 centerline reference</h2><span>This is an independently generated mathematical mesh—not an engineering, joinery, panel-module, entrance, weatherproofing, or fabrication release.</span></section>
              <section className="v3-construction-holds" aria-labelledby="v3-construction-holds-title">
                <p>CONSTRUCTION PACKAGE · HOLD</p>
                <h2 id="v3-construction-holds-title">Geometry passes. Physical construction does not.</h2>
                <span>These unresolved items prevent a responsible cut list, assembly instruction, or occupancy claim.</span>
                <ul>
                  {CONSTRUCTION_HOLDS_3V.map((hold) => (
                    <li key={hold.id}>
                      <div><strong>{hold.label}</strong><b>{hold.status}</b></div>
                      <small>{hold.detail}</small>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="audit-overview v3-audit-overview">
                <section><p>TOPOLOGY</p><h2>Triangulated disk</h2><dl><div><dt>Unique nodes</dt><dd>61</dd></div><div><dt>Unique axes</dt><dd>165</dd></div><div><dt>Triangular faces</dt><dd>105</dd></div><div><dt>Boundary edges</dt><dd>15</dd></div><div><dt>Euler check</dt><dd>61 − 165 + 105 = 1</dd></div><div><dt>Degree sum</dt><dd>330 = 2 × 165</dd></div><div><dt>Face incidences</dt><dd>315 = 2E − B</dd></div></dl></section>
                <section><p>SCALE + ENVELOPE</p><h2>152 in boundary normalization</h2><dl><div><dt>Sphere radius</dt><dd>{DOME_MODEL_3V.sphereRadius.toFixed(6)} in</dd></div><div><dt>Parent sphere Ø</dt><dd>{(DOME_MODEL_3V.sphereRadius * 2).toFixed(6)} in</dd></div><div><dt>Low-tier rise</dt><dd>{DOME_MODEL_3V.peakHeight.toFixed(6)} in</dd></div><div><dt>Boundary ripple</dt><dd>{DOME_MODEL_3V.audit.boundary.rippleInches.toFixed(6)} in</dd></div><div><dt>Min boundary caliper</dt><dd>{DOME_MODEL_3V.audit.boundary.minimumCaliperSpanInches.toFixed(6)} in</dd></div><div><dt>Max mesh plan span</dt><dd>{DOME_MODEL_3V.audit.envelope.maximumMeshPlanSpanInches.toFixed(6)} in</dd></div></dl></section>
              </div>
              <section className="v3-data-section" aria-labelledby="v3-member-classes-title"><p>UNIQUE AXIS CLASSES</p><h2 id="v3-member-classes-title">A / B / C node-center chords</h2><div className="v3-class-table">{DOME_MODEL_3V.edgeClasses.map((edgeClass) => <div key={edgeClass.type}><strong>{edgeClass.type}</strong><span>{edgeClass.count} axes</span><b>{edgeClass.length.toFixed(6)} in</b><small>factor {edgeClass.chordFactor.toFixed(12)} R</small></div>)}</div></section>
              <section className="v3-data-section" aria-labelledby="v3-hub-classes-title"><p>NODE VALENCE</p><h2 id="v3-hub-classes-title">Locations—not designed connector blocks</h2><div className="v3-class-table">{DOME_MODEL_3V.hubClasses.map((hubClass) => <div key={hubClass.valence}><strong>H{hubClass.valence}</strong><span>{hubClass.count} locations</span><b>{hubClass.valence}-way topology</b><small>Joinery not modeled</small></div>)}</div></section>
              <section className="v3-source-boundary"><p>PRIVATE SOURCE CROSS-CHECK</p><h2>The supplied plan is not republished here</h2><span>{SOURCE_PLAN_3V.licenseBoundary}</span><strong>{SOURCE_PLAN_3V.reconciliation}</strong><strong>{SOURCE_PLAN_3V.dimensionCrossCheck}</strong></section>
              <section className="v3-data-section" aria-labelledby="v3-release-title"><p>RELEASE BOUNDARY</p><h2 id="v3-release-title">What is—and is not—ready</h2><dl className="v3-release-list">{Object.entries(THREE_V_RELEASE_BOUNDARY).map(([label, value]) => <div key={label}><dt>{label.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl></section>
              <section className="v3-data-section" aria-labelledby="v3-assumptions-title"><p>MODEL LIMITS</p><h2 id="v3-assumptions-title">Read before physical work</h2><ul>{MODEL_ASSUMPTIONS_3V.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section>
            </div>
          </aside>
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      {toast ? <div className="toast" role="status">{toast}<span>✓</span></div> : null}
    </main>
  );
}
