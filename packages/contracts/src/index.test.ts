import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AdAssetStage,
  authoritativeRecorder,
  BreakSchedule,
  CreativeStage,
  DecisionStage,
  Hop,
  Mark,
  outcomes,
  SourceStage,
} from "./index.ts";

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

describe("timed steps (STEP-1, STEP-2)", () => {
  const stages = [
    ...SourceStage.options,
    ...CreativeStage.options,
    ...DecisionStage.options,
    ...AdAssetStage.options,
  ];

  it("ends every started step with both a _completed and a _failed stage", () => {
    const started = stages.filter((stage) => stage.endsWith("_started"));
    expect(started.length).toBeGreaterThan(0);
    for (const stage of started) {
      const step = stage.slice(0, -"_started".length);
      expect(stages).toContain(`${step}_completed`);
      expect(stages).toContain(`${step}_failed`);
    }
  });

  it("gives outcomes only to stages that exist", () => {
    for (const stage of Object.keys(outcomes)) expect(stages).toContain(stage);
  });

  it("requires a matching outcome where the stage has one, and none elsewhere", () => {
    const lookup = {
      kind: "decision",
      stage: "creative_cache_lookup_completed",
      breakId: "b1",
      recordedBy: "decision",
      atMs: at,
    };
    expect(Mark.parse({ ...lookup, outcome: "hit", creativeId: "c1" })).toMatchObject({
      outcome: "hit",
    });
    expect(() => Mark.parse(lookup)).toThrow();
    expect(() => Mark.parse({ ...lookup, outcome: "passed" })).toThrow();
    expect(() => Mark.parse({ ...lookup, stage: "judge_completed", outcome: "hit" })).toThrow();
    expect(
      Mark.parse({ ...lookup, stage: "creative_cache_lookup_failed", detail: "unreachable" }),
    ).toBeTruthy();
  });
});

describe("monotonic time (CLOCK-6)", () => {
  const mark = { kind: "hop", hop: "break_reached", breakId: "b1", recordedBy: "player", atMs: at };

  it("pairs each reading with the run it came from", () => {
    const withMonotonic = { ...mark, monotonic: { runId: "page-1", ms: 1234.5 } };
    expect(Mark.parse(withMonotonic)).toEqual(withMonotonic);
    expect(() => Mark.parse({ ...mark, monotonic: { ms: 1234.5 } })).toThrow();
    expect(() => Mark.parse({ ...mark, monotonic: { runId: "page-1" } })).toThrow();
  });

  it("is carried by marks outside a break too", () => {
    const load = {
      kind: "source_load",
      stage: "source_load_started",
      recordedBy: "mapper",
      atMs: at,
      monotonic: { runId: "mapper-1", ms: 10 },
    };
    expect(Mark.parse(load)).toEqual(load);
  });
});

describe("SourceLoadMark (MAP-7, CLOCK-5)", () => {
  const load = {
    kind: "source_load",
    stage: "source_load_completed",
    outcome: "no_new_cue",
    recordedBy: "mapper",
    atMs: at,
  };

  it("needs no break id when the load found nothing new", () => {
    expect(Mark.parse(load)).toEqual(load);
  });

  it("carries the source's own timestamp, and says where it came from", () => {
    const found = {
      ...load,
      outcome: "new_cue",
      breakId: "b1",
      sourceModifiedMs: at - 1000,
      sourceModifiedFrom: "http_last_modified",
    };
    expect(Mark.parse(found)).toEqual(found);
    expect(() => Mark.parse({ ...load, sourceModifiedMs: at - 1000 })).toThrow();
  });
});

describe("AdAssetMark (PLAY-1)", () => {
  it("is recorded only by the player, per asset", () => {
    const mark = {
      kind: "ad_asset",
      stage: "first_segment_load_completed",
      assetIndex: 0,
      breakId: "b1",
      recordedBy: "player",
      atMs: at,
    };
    expect(Mark.parse(mark)).toEqual(mark);
    expect(() => Mark.parse({ ...mark, recordedBy: "decision" })).toThrow();
  });
});

describe("CreativeMark (GEN-3)", () => {
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

describe("spec citations", () => {
  it("cites only requirement ids that exist in docs/spec.md", () => {
    const spec = readFileSync(new URL("../../../docs/spec.md", import.meta.url), "utf8");
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const cited = [...source.matchAll(/spec: ([A-Z]+-\d+(?:, [A-Z]+-\d+)*)/g)].flatMap((m) =>
      (m[1] ?? "").split(", "),
    );
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(spec).toContain(`- ${id}:`);
  });
});
