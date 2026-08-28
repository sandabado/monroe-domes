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

const { DOME_MODEL, JOINERY_MODEL, REDESIGN_STUDY } = await import("../lib/spec.ts");

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
  radius: model.radius,
  vertices,
  edges,
  faces: model.faces,
  baseVertexIds: model.baseVertexIds,
  audit: model.audit,
  tangentSetbacks: joinery.tangentSetbacks,
  fabricationClasses: joinery.fabricationClasses,
  collisionAudits,
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
    minimumPocketSplitPenetration: REDESIGN_STUDY.minimumPocketSplitPenetration,
    minimumShoulderToOtherFaceClearance: REDESIGN_STUDY.minimumShoulderToOtherFaceClearance,
    minimumH4ShoulderBottomRim: REDESIGN_STUDY.minimumH4ShoulderBottomRim,
    minimumCrossKeyReliefToOtherPocketSeparation: REDESIGN_STUDY.minimumCrossKeyReliefToOtherPocketSeparation,
    minimumClampBoreToPocketSeparation: REDESIGN_STUDY.minimumClampBoreToPocketSeparation,
    note: REDESIGN_STUDY.note,
  },
}));
