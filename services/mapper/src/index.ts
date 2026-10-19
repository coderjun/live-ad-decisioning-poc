import type { Hop } from "@lad/contracts";

/** The hops this service records: reading a cue, and serving the playlist that contains its break. */
export const records: readonly Hop[] = ["cue_observed", "manifest_published"];
