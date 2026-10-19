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

// Every timed step is named <step>_started, then exactly one of <step>_completed or <step>_failed
// (spec: STEP-1). _failed means the step broke; a negative answer is a _completed outcome.

/** The mapper's read of the source playlist, where cues first appear (spec: MAP-7). */
export const SourceStage = z.enum([
  "source_load_started",
  "source_load_completed",
  "source_load_failed",
]);
export type SourceStage = z.infer<typeof SourceStage>;

/** The stages that make a personalized creative ready, which run beside the chain (spec: GEN-3). */
export const CreativeStage = z.enum([
  "generation_started",
  "generation_completed",
  "generation_failed",
  "packaging_started",
  "packaging_completed",
  "packaging_failed",
  "checks_started",
  "checks_completed",
  "checks_failed",
  "fetch_back_started",
  "fetch_back_completed",
  "fetch_back_failed",
  "creative_ready",
  "creative_failed",
]);
export type CreativeStage = z.infer<typeof CreativeStage>;

/** The steps the decision service times for one break, besides the hops (spec: DEC-6). */
export const DecisionStage = z.enum([
  "eligibility_started",
  "eligibility_completed",
  "eligibility_failed",
  "judgment_cache_lookup_started",
  "judgment_cache_lookup_completed",
  "judgment_cache_lookup_failed",
  "judge_started",
  "judge_completed",
  "judge_failed",
  "creative_cache_lookup_started",
  "creative_cache_lookup_completed",
  "creative_cache_lookup_failed",
]);
export type DecisionStage = z.infer<typeof DecisionStage>;

/** What the player times for each asset in the asset list (spec: PLAY-1). */
export const AdAssetStage = z.enum([
  "asset_playlist_load_started",
  "asset_playlist_load_completed",
  "asset_playlist_load_failed",
  "first_segment_load_started",
  "first_segment_load_completed",
  "first_segment_load_failed",
  "asset_playback_started",
  "asset_playback_completed",
  "asset_playback_failed",
]);
export type AdAssetStage = z.infer<typeof AdAssetStage>;

/** The answer a _completed step carries, for the steps that have one (spec: STEP-2). */
export const outcomes = {
  source_load_completed: ["new_cue", "no_new_cue"],
  checks_completed: ["passed", "rejected"],
  judgment_cache_lookup_completed: ["hit", "miss"],
  creative_cache_lookup_completed: ["hit", "miss"],
} as const;
export const Outcome = z.enum(["new_cue", "no_new_cue", "passed", "rejected", "hit", "miss"]);
export type Outcome = z.infer<typeof Outcome>;

/** Requires the outcome on the stages that have one, and forbids it elsewhere. */
const outcomeMatchesStage = (mark: { stage: string; outcome?: Outcome | undefined }) => {
  const allowed: readonly Outcome[] | undefined = outcomes[mark.stage as keyof typeof outcomes];
  return allowed
    ? mark.outcome !== undefined && allowed.includes(mark.outcome)
    : mark.outcome === undefined;
};
const outcomeMessage = {
  message: "outcome must match the stage (spec: STEP-2)",
  path: ["outcome"],
};

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

/**
 * A reading of the recorder's monotonic clock: performance.now() in the player, process.hrtime in
 * the services. It never jumps, but it restarts with the process or page, so readings only compare
 * within one runId (spec: CLOCK-6).
 */
export const Monotonic = z.object({
  /** Made when the process or page starts, so a restart can't be mistaken for elapsed time. */
  runId: z.string().min(1),
  /** Milliseconds since the run started. */
  ms: z.number().nonnegative(),
});
export type Monotonic = z.infer<typeof Monotonic>;

/** When a mark was recorded, in both of the recorder's clocks (spec: CLOCK-1, CLOCK-6). */
const clockFields = {
  /** Wall-clock time in the recorder's clock, in milliseconds since the Unix epoch. */
  atMs: z.number().nonnegative(),
  /** For durations within the recorder. Optional, but every recorder in this repo sets it. */
  monotonic: Monotonic.optional(),
};

/** Fields every mark carries (spec: CORR-1, CLOCK-1). */
const markFields = {
  ...BreakRef.shape,
  recordedBy: Recorder,
  ...clockFields,
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
export const CreativeMark = z
  .object({
    kind: z.literal("creative"),
    stage: CreativeStage,
    /** Derived from the cache key, so it is the same in every break that uses the creative (spec: CACHE-1). */
    creativeId: z.string().min(1),
    outcome: Outcome.optional(),
    ...markFields,
    recordedBy: z.literal("decision"),
  })
  .refine(outcomeMatchesStage, outcomeMessage);
export type CreativeMark = z.infer<typeof CreativeMark>;

/** One step of the decision service's work for one break. */
export const DecisionMark = z
  .object({
    kind: z.literal("decision"),
    stage: DecisionStage,
    outcome: Outcome.optional(),
    /** Set on creative cache lookups, and on a hit it names the creative served. */
    creativeId: z.string().min(1).optional(),
    ...markFields,
    recordedBy: z.literal("decision"),
  })
  .refine(outcomeMatchesStage, outcomeMessage);
export type DecisionMark = z.infer<typeof DecisionMark>;

/** One step of loading or playing one asset of a break's asset list. Only the player sees these. */
export const AdAssetMark = z.object({
  kind: z.literal("ad_asset"),
  stage: AdAssetStage,
  /** The asset's position in the asset list, from 0. */
  assetIndex: nonNegativeInt,
  /** Set when the asset list says which creative the asset is. */
  creativeId: z.string().min(1).optional(),
  ...markFields,
  recordedBy: z.literal("player"),
});
export type AdAssetMark = z.infer<typeof AdAssetMark>;

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
  ...clockFields,
  reason: CueRejectReason,
  /** SHA-256 of the raw cue bytes, hex, so the same cue can be found again. */
  cueSha256: z.string().regex(/^[0-9a-f]{64}$/),
  spliceEventId: BreakRef.shape.spliceEventId,
  segmentationEventId: BreakRef.shape.segmentationEventId,
  mediaSequence: nonNegativeInt.optional(),
  detail: z.string().optional(),
});
export type CueRejectedMark = z.infer<typeof CueRejectedMark>;

/** Where a source timestamp came from. Both are in the source's clock, not the mapper's (spec: CLOCK-5). */
export const SourceModifiedFrom = z.enum(["http_last_modified", "file_mtime"]);
export type SourceModifiedFrom = z.infer<typeof SourceModifiedFrom>;

/** One read of the source playlist. Most reads find no new cue, so there is often no breakId. */
export const SourceLoadMark = z
  .object({
    kind: z.literal("source_load"),
    stage: SourceStage,
    outcome: Outcome.optional(),
    recordedBy: z.literal("mapper"),
    ...clockFields,
    /** Set when the load found a cue that became a break. */
    breakId: BreakRef.shape.breakId.optional(),
    spliceEventId: BreakRef.shape.spliceEventId,
    segmentationEventId: BreakRef.shape.segmentationEventId,
    mediaSequence: nonNegativeInt.optional(),
    /** When the source says the playlist last changed, in the source's clock. */
    sourceModifiedMs: z.number().nonnegative().optional(),
    sourceModifiedFrom: SourceModifiedFrom.optional(),
    detail: z.string().optional(),
  })
  .refine(outcomeMatchesStage, outcomeMessage)
  .refine(
    (mark) => (mark.sourceModifiedMs === undefined) === (mark.sourceModifiedFrom === undefined),
    {
      message: "sourceModifiedMs and sourceModifiedFrom come together (spec: CLOCK-5)",
      path: ["sourceModifiedFrom"],
    },
  );
export type SourceLoadMark = z.infer<typeof SourceLoadMark>;

/** Any trace record. Parse with this at every boundary that reads marks. */
export const Mark = z.discriminatedUnion("kind", [
  HopMark,
  CreativeMark,
  DecisionMark,
  AdAssetMark,
  CueRejectedMark,
  SourceLoadMark,
]);
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
