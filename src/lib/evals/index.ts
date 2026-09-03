export { evaluateAdherence, summarizeAdherence } from "./adherence";
export { evaluateMath, summarizeMath } from "./math";
export { acceptLesson, DEFAULT_ACCEPTANCE } from "./accept";
export {
  generateLesson,
  makeSupabaseClient,
  resolveSubtopicMetadata,
} from "./generate";
export { listVariants, variantExists, readVariant } from "./variants";
export {
  evalsRoot,
  iterPaths,
  subtopicSummaryPath,
  variantSummaryPath,
  writeJson,
  readJson,
  readLessonSteps,
  writeReport,
} from "./storage";
export type {
  AdherenceMetrics,
  EquivalenceError,
  FidelityError,
  LessonReport,
  MathMetrics,
  MicroLessonOperation,
  MicroLessonPhase,
  WhiteboardStep,
} from "./types";
export { EXPANDING_OPS, COMPACT_OPS, FIDELITY_CHECKED_OPS } from "./types";
