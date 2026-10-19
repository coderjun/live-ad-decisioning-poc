import { type Hop, SourceStage } from "@lad/contracts";

/** The hops this service records: reading a cue, and serving the playlist that contains its break. */
export const records: readonly Hop[] = ["cue_observed", "manifest_published"];

/** The timed step this service records: each read of the source playlist (spec: MAP-7). */
export const steps: readonly SourceStage[] = SourceStage.options;
