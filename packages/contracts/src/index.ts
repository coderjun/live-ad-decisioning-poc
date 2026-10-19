import { z } from "zod";

// Trace events for one ad break. These are this project's names, not SCTE-35 terms: SCTE-35 only
// signals where a break starts and ends. Definitions, recorders, and clock rules are in docs/spec.md.

/** The component that recorded a mark. Each one has its own wall clock (spec: CLOCK-1). */
export const Recorder = z.enum(["mapper", "decision", "player"]);
export type Recorder = z.infer<typeof Recorder>;

/** The hops of the deadline chain, in the order they happen (spec: CHAIN-1). */
export const Hop = z.enum([
  "cue_observed",
  "manifest_published",
  "manifest_loaded",
  "asset_list_requested",
  "asset_list_answered",
  "break_reached",
  "first_ad_frame",
  "primary_resumed",
]);
export type Hop = z.infer<typeof Hop>;

/** The component whose mark is authoritative for each hop. Others may record a secondary mark. */
export const authoritativeRecorder = {
  cue_observed: "mapper",
  manifest_published: "mapper",
  manifest_loaded: "player",
  asset_list_requested: "player",
  asset_list_answered: "decision",
  break_reached: "player",
  first_ad_frame: "player",
  primary_resumed: "player",
} as const satisfies Record<Hop, Recorder>;

/**
 * The stages that make a generated creative ready, which run beside the chain (spec: GEN-3).
 * Each stage has a start mark and exactly one end mark, success or failure, so its duration is
 * measured, not inferred (spec: READY-1).
 */
export const CreativeStage = z.enum([
  "generation_started",
  "generation_finished",
  "generation_failed",
  "packaging_started",
  "packaging_finished",
  "packaging_failed",
  "checks_started",
  "checks_passed",
  "checks_failed",
  "creative_ready",
  "creative_failed",
]);
export type CreativeStage = z.infer<typeof CreativeStage>;

const nonNegativeInt = z.number().int().nonnegative();

/**
 * Identifies one break across every component. Only breakId is required; the rest are optional
 * because they don't exist yet at every point, or for every cue (spec: CORR-1).
 */
export const BreakRef = z.object({
  /** Ours: stable for a break and loop iteration (spec: MAP-2). */
  breakId: z.string().min(1),
  /** splice_event_id from a splice_insert() command, when the cue has one. */
  spliceEventId: nonNegativeInt.max(0xffffffff).optional(),
  /** segmentation_event_id from a segmentation descriptor, when the cue has one. */
  segmentationEventId: nonNegativeInt.max(0xffffffff).optional(),
});
export type BreakRef = z.infer<typeof BreakRef>;

/** Fields every mark carries (spec: CORR-1, CLOCK-1). */
const markFields = {
  ...BreakRef.shape,
  recordedBy: Recorder,
  /** Wall-clock time in the recorder's clock, in milliseconds since the Unix epoch. */
  atMs: z.number().nonnegative(),
  /** EXT-X-MEDIA-SEQUENCE of the playlist involved: which segments it covered. */
  mediaSequence: nonNegativeInt.optional(),
  /** Our counter for the served playlist's content; it changes even when mediaSequence doesn't. */
  playlistRevision: nonNegativeInt.optional(),
  /** Position on the media timeline (EXT-X-PROGRAM-DATE-TIME), when the event has one. */
  programDateTimeMs: z.number().nonnegative().optional(),
  /** Free-text detail, such as a failure reason. */
  detail: z.string().optional(),
};

/** One hop of the deadline chain for one break. */
export const HopMark = z.object({ kind: z.literal("hop"), hop: Hop, ...markFields });
export type HopMark = z.infer<typeof HopMark>;

/** One stage of making one creative ready. Recorded by the decision service, which runs the Generator. */
export const CreativeMark = z.object({
  kind: z.literal("creative"),
  stage: CreativeStage,
  creativeId: z.string().min(1),
  ...markFields,
  recordedBy: z.literal("decision"),
});
export type CreativeMark = z.infer<typeof CreativeMark>;

/** Why the mapper couldn't use a cue (spec: MAP-6). */
export const CueRejectReason = z.enum([
  "unparseable",
  "unsupported_command",
  "missing_duration",
  "duplicate",
  "in_the_past",
]);
export type CueRejectReason = z.infer<typeof CueRejectReason>;

/** A cue the mapper read but couldn't turn into a break. No breakId exists, so ids are optional. */
export const CueRejectedMark = z.object({
  kind: z.literal("cue_rejected"),
  recordedBy: z.literal("mapper"),
  atMs: z.number().nonnegative(),
  reason: CueRejectReason,
  /** SHA-256 of the raw cue bytes, hex, so the same cue can be found again. */
  cueSha256: z.string().regex(/^[0-9a-f]{64}$/),
  spliceEventId: BreakRef.shape.spliceEventId,
  segmentationEventId: BreakRef.shape.segmentationEventId,
  mediaSequence: nonNegativeInt.optional(),
  detail: z.string().optional(),
});
export type CueRejectedMark = z.infer<typeof CueRejectedMark>;

/** Any trace record. Parse with this at every boundary that reads marks. */
export const Mark = z.discriminatedUnion("kind", [HopMark, CreativeMark, CueRejectedMark]);
export type Mark = z.infer<typeof Mark>;

/**
 * A break as the mapper scheduled it. The splice point is on the media timeline; each player
 * reaches it later, by however far it plays behind the live edge (spec: CLOCK-3).
 */
export const BreakSchedule = BreakRef.extend({
  /** The splice point on the program date-time timeline: the interstitial's START-DATE. */
  spliceProgramDateTimeMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
});
export type BreakSchedule = z.infer<typeof BreakSchedule>;
