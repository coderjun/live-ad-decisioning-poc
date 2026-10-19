import { describe, expect, it } from "vitest";
import { authoritativeRecorder, BreakSchedule, CreativeStage, Hop, Mark } from "./index.ts";

const at = 1_760_000_000_000;

describe("Hop (CHAIN-1)", () => {
  it("lists the chain in order, with manifest_loaded and break_reached in place", () => {
    expect(Hop.options).toEqual([
      "cue_observed",
      "manifest_published",
      "manifest_loaded",
      "asset_list_requested",
      "asset_list_answered",
      "break_reached",
      "first_ad_frame",
      "primary_resumed",
    ]);
  });

  it("names one authoritative recorder per hop (CHAIN-2)", () => {
    expect(Object.keys(authoritativeRecorder)).toEqual(Hop.options);
    expect(authoritativeRecorder.asset_list_answered).toBe("decision");
    expect(authoritativeRecorder.manifest_loaded).toBe("player");
  });
});

describe("Mark (CORR-1)", () => {
  it("accepts a hop mark with only the required fields", () => {
    const mark = {
      kind: "hop",
      hop: "cue_observed",
      breakId: "b1",
      recordedBy: "mapper",
      atMs: at,
    };
    expect(Mark.parse(mark)).toEqual(mark);
  });

  it("accepts every optional correlation field when it exists", () => {
    const mark = {
      kind: "hop",
      hop: "manifest_published",
      breakId: "b1",
      spliceEventId: 0xffffffff,
      segmentationEventId: 42,
      recordedBy: "mapper",
      atMs: at,
      mediaSequence: 120,
      playlistRevision: 345,
      programDateTimeMs: at + 4000,
    };
    expect(Mark.parse(mark)).toEqual(mark);
  });

  it("rejects event ids outside SCTE-35's 32-bit range", () => {
    const mark = {
      kind: "hop",
      hop: "cue_observed",
      breakId: "b1",
      recordedBy: "mapper",
      atMs: at,
    };
    expect(() => Mark.parse({ ...mark, spliceEventId: 2 ** 32 })).toThrow();
    expect(() => Mark.parse({ ...mark, segmentationEventId: -1 })).toThrow();
  });

  it("rejects an unknown hop name", () => {
    expect(() =>
      Mark.parse({ kind: "hop", hop: "ad_started", breakId: "b1", recordedBy: "player", atMs: at }),
    ).toThrow();
  });
});

describe("CreativeMark (GEN-3)", () => {
  it("gives every measured stage a start, a success end, and a failure end (READY-1)", () => {
    const ends = {
      generation: ["generation_finished", "generation_failed"],
      packaging: ["packaging_finished", "packaging_failed"],
      checks: ["checks_passed", "checks_failed"],
    };
    for (const [stage, [succeeded, failed]] of Object.entries(ends)) {
      expect(CreativeStage.options).toContain(`${stage}_started`);
      expect(CreativeStage.options).toContain(succeeded);
      expect(CreativeStage.options).toContain(failed);
    }
  });

  it("is recorded only by the decision service", () => {
    const mark = {
      kind: "creative",
      stage: "creative_ready",
      creativeId: "c1",
      breakId: "b1",
      recordedBy: "decision",
      atMs: at,
    };
    expect(Mark.parse(mark)).toEqual(mark);
    expect(() => Mark.parse({ ...mark, recordedBy: "player" })).toThrow();
  });
});

describe("CueRejectedMark (MAP-6)", () => {
  it("needs no break id, since the cue never became a break", () => {
    const mark = {
      kind: "cue_rejected",
      recordedBy: "mapper",
      atMs: at,
      reason: "unparseable",
      cueSha256: "a".repeat(64),
    };
    expect(Mark.parse(mark)).toEqual(mark);
    expect(() => Mark.parse({ ...mark, cueSha256: "not-a-hash" })).toThrow();
  });
});

describe("BreakSchedule (CLOCK-3)", () => {
  it("places the splice point on the media timeline", () => {
    const schedule = { breakId: "b1", spliceProgramDateTimeMs: at + 4000, durationMs: 30_000 };
    expect(BreakSchedule.parse(schedule)).toEqual(schedule);
  });
});
