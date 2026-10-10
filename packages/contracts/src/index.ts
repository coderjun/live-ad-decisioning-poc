import { z } from "zod";

/** The hops of one ad break's deadline chain, in the order they happen. Defined in docs/spec.md. */
export const Hop = z.enum([
  "cue_observed",
  "manifest_published",
  "asset_list_requested",
  "asset_list_answered",
  "first_ad_frame",
  "primary_resumed",
]);
export type Hop = z.infer<typeof Hop>;

/** When one hop happened for one break, in milliseconds since the Unix epoch. */
export const HopMark = z.object({
  breakId: z.string().min(1),
  hop: Hop,
  atMs: z.number().nonnegative(),
});
export type HopMark = z.infer<typeof HopMark>;
