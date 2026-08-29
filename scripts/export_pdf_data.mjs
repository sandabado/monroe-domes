import { registerHooks } from "node:module";

// The app source uses extensionless local imports for Next.js. Node's direct
// TypeScript runner needs the source extension when this standalone exporter
// loads the same canonical spec.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  DOME_MODEL,
  ENTRANCE_STUDY,
  HANDOFF,
  JOINERY_MODEL,
  MATERIAL,
  MEMBERS,
  MODEL_ASSUMPTIONS,
  PLATFORM_CONCEPT,
  PROJECT,
  REDESIGN_STUDY,
  WOOD_PANEL_CONCEPT,
  WOOD_PANELS,
} = await import("../lib/spec.ts");

const model = DOME_MODEL;
const joinery = JOINERY_MODEL;

const vertices = model.vertices.map((vertex) => ({
  id: vertex.id,
  position: vertex.position,
  valence: vertex.valence,
  isBase: vertex.isBase,
}));

const edges = model.edges.map((edge) => ({
  id: edge.id,
  start: edge.start,
  end: edge.end,
  type: edge.type,
  length: edge.length,
  chordFactor: edge.chordFactor,
}));

const collisionAudits = joinery.collisionAudits.map((audit) => ({
  orientation: audit.orientation,
  apothem: audit.apothem,
  tenon: audit.tenon,
  allPairsCollide: audit.allPairsCollide,
  byValence: audit.byValence,
}));

process.stdout.write(JSON.stringify({
  project: PROJECT,
  handoff: HANDOFF,
  material: MATERIAL,
  radius: model.radius,
  vertices,
  edges,
  faces: model.faces,
  baseVertexIds: model.baseVertexIds,
  audit: model.audit,
  tangentSetbacks: joinery.tangentSetbacks,
  fabricationClasses: joinery.fabricationClasses,
  collisionAudits,
  members: MEMBERS,
  panels: WOOD_PANELS,
  panelConcept: WOOD_PANEL_CONCEPT,
  entrance: ENTRANCE_STUDY,
  platform: PLATFORM_CONCEPT,
  modelAssumptions: MODEL_ASSUMPTIONS,
  redesign: {
    status: REDESIGN_STUDY.status,
    configuration: REDESIGN_STUDY.joinery,
    pocketEnvelope: REDESIGN_STUDY.pocketEnvelope,
    hubEnvelope: REDESIGN_STUDY.hubEnvelope,
    bodyFamilies: REDESIGN_STUDY.bodyFamilies,
    memberLengthStudy: REDESIGN_STUDY.memberLengthStudy,
    selectedRoll: REDESIGN_STUDY.selectedRoll,
    sampledPairTests: REDESIGN_STUDY.sampledPairTests,
    sampledPocketCollisions: REDESIGN_STUDY.sampledPocketCollisions,
    minimumSampledPocketSeparation: REDESIGN_STUDY.minimumSampledPocketSeparation,
    sampledMemberPairTests: REDESIGN_STUDY.externalMemberPairTests,
    sampledMemberCollisions: REDESIGN_STUDY.externalMemberCollisions,
    minimumSampledMemberSeparation: REDESIGN_STUDY.minimumSampledMemberSeparation,
    continuousRollPocketPairTests: REDESIGN_STUDY.continuousRollPocketPairTests,
    continuousRollPocketCollisions: REDESIGN_STUDY.continuousRollPocketCollisions,
    minimumContinuousRollPocketSeparation: REDESIGN_STUDY.minimumContinuousRollPocketSeparation,
    continuousRollMemberPairTests: REDESIGN_STUDY.continuousRollMemberPairTests,
    continuousRollMemberCollisions: REDESIGN_STUDY.continuousRollMemberCollisions,
    minimumContinuousRollMemberSeparation: REDESIGN_STUDY.minimumContinuousRollMemberSeparation,
    pocketRadialRange: REDESIGN_STUDY.pocketRadialRange,
    minimumPocketSplitPenetration: REDESIGN_STUDY.minimumPocketSplitPenetration,
    minimumPocketToOtherFaceClearance: REDESIGN_STUDY.minimumPocketToOtherFaceClearance,
    shoulderRadialRange: REDESIGN_STUDY.shoulderRadialRange,
    minimumShoulderToOtherFaceClearance: REDESIGN_STUDY.minimumShoulderToOtherFaceClearance,
    minimumH4ShoulderBottomRim: REDESIGN_STUDY.minimumH4ShoulderBottomRim,
    minimumCrossKeyReliefToOtherPocketSeparation: REDESIGN_STUDY.minimumCrossKeyReliefToOtherPocketSeparation,
    minimumCrossKeyReliefToReliefSeparation: REDESIGN_STUDY.minimumCrossKeyReliefToReliefSeparation,
    minimumClampBoreToPocketSeparation: REDESIGN_STUDY.minimumClampBoreToPocketSeparation,
    minimumClampBoreToCrossKeyReliefSeparation: REDESIGN_STUDY.minimumClampBoreToCrossKeyReliefSeparation,
    note: REDESIGN_STUDY.note,
  },
}));
