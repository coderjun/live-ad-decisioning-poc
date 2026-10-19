import { authoritativeRecorder, type Hop } from "@lad/contracts";
import Hls from "hls.js";

/** The hops this player is the authoritative recorder for. */
export const observes: readonly Hop[] = Object.entries(authoritativeRecorder)
  .filter(([, recorder]) => recorder === "player")
  .map(([hop]) => hop as Hop);

export const supported = (): boolean => Hls.isSupported();
