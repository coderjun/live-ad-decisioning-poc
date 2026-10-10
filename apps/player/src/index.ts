import type { Hop } from "@lad/contracts";
import Hls from "hls.js";

/** The hops only the player can observe. */
export const observes: readonly Hop[] = [
  "asset_list_requested",
  "first_ad_frame",
  "primary_resumed",
];

export const supported = (): boolean => Hls.isSupported();
