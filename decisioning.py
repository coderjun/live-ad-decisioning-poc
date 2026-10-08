"""Decides what plays in one ad break for one viewer. The sections follow the README's method:
1. eligibility rules in code, 2. typed judgments from Jev, 3. creative from the cache or fal,
then decide(), which gates on those judgments and fills the break."""
import base64, datetime as dt, hashlib, json, os, threading, time, urllib.request
from collections import defaultdict
from pathlib import Path

from stream import duration

ROOT = Path(__file__).parent
MEDIA = ROOT / "media"
MEDIA.mkdir(exist_ok=True)


def load_env(path):
    """Read KEY=value lines into the environment, without overriding anything already set."""
    if path.exists():
        for line in path.read_text().splitlines():
            key, has_value, value = line.partition("=")
            if has_value and not key.strip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip())


load_env(ROOT / ".env")
env = os.environ.get
BRAND_SAFE_THRESHOLD = float(env("THRESHOLD_BRAND_SAFE", "0.90"))
FIT_THRESHOLD = float(env("THRESHOLD_CONTEXT_FIT", "0.75"))
GENERATIONS_PER_DAY = int(env("GENERATIONS_PER_DAY", "5"))
MAX_GENERATED_SECONDS = int(env("MAX_GENERATED_SECONDS", "15"))
MIN_GENERATED_SECONDS = 5  # fal's shortest clip
GENERATION_RESOLUTION = env("GENERATION_RESOLUTION", "480P")
GENERATION_OVERHEAD_SECONDS = float(env("GENERATION_OVERHEAD_SECONDS", "3"))
GENERATION_SECONDS_PER_CLIP_SECOND = float(env("GENERATION_SECONDS_PER_CLIP_SECOND", "0.2"))
GENERATION_SEED = 20260929  # fixed, so every approved generation can be reproduced


def load(name):
    return json.loads((ROOT / "data" / name).read_text())


ADVERTISERS = load("advertisers.json")  # file order breaks ties between equally good fits
ADVERTISERS_BY_ID = {a["id"]: a for a in ADVERTISERS}
BREAKS = {b["id"]: b for b in load("breaks.json")}
VIEWERS = {v["id"]: v for v in load("viewers.json")}
HOUSE_AD = load("house-ad.json")
lock = threading.Lock()


def post_json(url, body, authorization, timeout, calls):
    """POST JSON and return the reply. The call is appended to `calls` for the decision log: URL, request, response
    and time taken, but never the key. Embedded images are replaced by their size to keep the log readable."""
    call = {"url": url, "request": {k: f"<image, {len(v) * 3 // 4 // 1024} KB, not shown>" if str(v).startswith("data:") else v
                                    for k, v in body.items()}}
    calls.append(call)
    started = time.time()
    request = urllib.request.Request(url, json.dumps(body).encode(),
                                     {"Authorization": authorization, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            call["response"] = json.load(response)
            return call["response"]
    except Exception as e:
        call["error"] = repr(e)
        raise
    finally:
        call["ms"] = round((time.time() - started) * 1000)


# ---- 1. Eligibility: business rules, decided in code ----

ADULT_ONLY_CATEGORIES = {"alcohol"}  # only for viewers 21 or older with no children in the household
plays = defaultdict(list)  # (viewer id, advertiser id) -> times played; in memory, so it resets on restart


def ineligible_reason(adv, brk, viewer_id):
    """Why this advertiser may not run in this break for this viewer, or None if it may."""
    today = env("NOW") or dt.date.today().isoformat()
    if not adv["flight"]["start"] <= today <= adv["flight"]["end"]:
        return f"campaign not running on {today}"
    if brk["daypart"] not in adv["dayparts"]:
        return f"does not run in {brk['daypart']}"
    if adv["category"] in ADULT_ONLY_CATEGORIES and (VIEWERS[viewer_id]["min_age"] < 21 or VIEWERS[viewer_id]["children_in_household"]):
        return f"{adv['category']} needs a viewer 21 or older with no children in the household"
    if len([t for t in plays[(viewer_id, adv["id"])] if t > time.time() - 3600]) >= adv["frequency_cap_per_hour"]:
        return "frequency cap reached"


# ---- 2. Judgments: typed questions to Jev, one call per break ----

CATEGORIES = {"sports": "Sport", "news": "News and current events", "food": "Cooking and food",
              "drama": "Scripted drama", "travel": "Travel and nature", "factual": "Factual and documentary",
              "other": "Anything else"}
FIT = {"strong": "The ad naturally complements this content",
       "weak": "Loosely related or neutral to this content",
       "none": "Unrelated to this content"}


def judge(brk, advertisers, calls):
    """Ask Jev about the content just before the break. Returns the content category and, per advertiser,
    p_safe (probability it is brand safe here), fit (strong, weak or none) and the fit probabilities."""
    questions = {"category": {"type": "choice", "instructions": "The category of this content", "criteria": CATEGORIES}}
    for adv in advertisers:
        questions[f"safe_{adv['id']}"] = {"type": "noul", "instructions":
            f"It is brand safe for {adv['name']}, a {adv['category']} advertiser, to run an ad right after this content. "
            f"The advertiser refuses to appear next to: {', '.join(adv['exclude_topics'])}."}
        questions[f"fit_{adv['id']}"] = {"type": "choice", "criteria": FIT, "instructions":
            f"How well an ad for {adv['name']}, a {adv['category']} brand, fits this content itself, regardless of who is watching"}
    state = f"Content rating: {brk['content_rating']}\nThe segment just before the ad break: {brk['preceding_context']}"
    answers = post_json("https://api.typesafe.ai/v1/systemone", {"model": "jev-latest", "state": state, "questions": questions},
                        f"Bearer {env('TYPESAFE_API_KEY')}", timeout=10, calls=calls)["answers"]
    return answers["category"]["choice"], {adv["id"]: {
        "p_safe": answers[f"safe_{adv['id']}"]["noul"],
        "fit": answers[f"fit_{adv['id']}"]["choice"],
        "p_strong": answers[f"fit_{adv['id']}"]["probabilities"]["strong"],
        "p_weak": answers[f"fit_{adv['id']}"]["probabilities"]["weak"],
    } for adv in advertisers}


def fit_score(judgment):
    """Expected fit, with strong counting 2, weak 1 and none 0. Ranks advertisers within a fit level."""
    return 2 * judgment["p_strong"] + judgment["p_weak"] if judgment else 0


def fit_level(judgment):
    """'strong' if Jev is confident the fit is strong, 'weak' if confident it is at least weak, else None.
    Confident means the probability clears THRESHOLD_CONTEXT_FIT."""
    if judgment["p_strong"] >= FIT_THRESHOLD:
        return "strong"
    if judgment["p_strong"] + judgment["p_weak"] >= FIT_THRESHOLD:
        return "weak"


# ---- 3. Creative: personalized from the cache, or generated by fal when the budgets allow ----

BUDGET_FILE = MEDIA / "generations.json"
jobs = {}  # custom ad path -> {"state": "generating" | "ready" | "failed", "api_calls": [...]}; the player polls it


def clip_seconds(break_seconds):
    """Longest clip that can be generated and still play out inside the break, or 0 if none fits."""
    seconds = min(MAX_GENERATED_SECONDS,
                  int((break_seconds - GENERATION_OVERHEAD_SECONDS) / (1 + GENERATION_SECONDS_PER_CLIP_SECOND)))
    return seconds if seconds >= MIN_GENERATED_SECONDS else 0


def expected_generation_seconds(clip):
    return GENERATION_OVERHEAD_SECONDS + clip * GENERATION_SECONDS_PER_CLIP_SECOND


def start_generation(adv, viewer, category, seconds, out):
    """Spend one generation of the daily budget and generate out in the background.
    Returns False, without calling fal, if the budget is spent."""
    with lock:
        recent = [t for t in json.loads(BUDGET_FILE.read_text()) if t > time.time() - 86400] if BUDGET_FILE.exists() else []
        if len(recent) >= GENERATIONS_PER_DAY:
            return False
        BUDGET_FILE.write_text(json.dumps(recent + [time.time()]))
        job = jobs[out.relative_to(ROOT).as_posix()] = {"state": "generating", "api_calls": []}
    threading.Thread(target=generate, args=(adv, viewer, category, seconds, out, job), daemon=True).start()
    return True


def generate(adv, viewer, category, seconds, out, job):
    """Animate the approved still into the approved end card with fal, saving to out. Records the outcome and
    the fal call in job, and appends it to the decision log."""
    try:
        image = lambda path: "data:image/png;base64," + base64.b64encode((ROOT / path).read_bytes()).decode()
        result = post_json("https://fal.run/minimax/h3-max-turbo/image-to-video", {
            "prompt": f"A commercial for {adv['name']}, made for {viewer['segment']} who were just watching {category} "
                      "content. Opens on the first image and lands on the second. Smooth, premium, no text until the end card.",
            "image_url": image(adv["approved_still"]), "end_image_url": image(adv["approved_end_card"]),
            "duration": seconds, "resolution": GENERATION_RESOLUTION, "seed": GENERATION_SEED,
            "prompt_expansion_mode": "disabled",
        }, f"Key {env('FAL_KEY')}", timeout=600, calls=job["api_calls"])
        out.parent.mkdir(exist_ok=True)
        urllib.request.urlretrieve(result["video"]["url"], out.with_suffix(".part"))
        out.with_suffix(".part").rename(out)  # only a complete file ever appears in the cache
        job["state"] = "ready"
    except Exception as e:
        job["state"], job["error"] = "failed", repr(e)
    with lock, open(MEDIA / "decisions.jsonl", "a") as f:
        f.write(json.dumps({"at": dt.datetime.now().isoformat(timespec="seconds"), "generated": str(out.relative_to(ROOT)), **job}) + "\n")


def personalized_creative(adv, viewer, category, break_seconds, allow_generation):
    """For a strong, confident fit. Returns (path, explanation, generating). path is None when no custom ad can play in
    this break; generating is True when path is still being generated, and the network ad should cover the wait.
    Custom ads are made per advertiser, viewer segment and content category, so each combination needs its own."""
    key = hashlib.sha1(f"{adv['id']}|{viewer['segment']}|{category}|strong".encode()).hexdigest()[:12]
    path = MEDIA / "cache" / f"{adv['id']}-{key}.mp4"
    missing = f"there is no custom ad yet for {viewer['segment']} viewers after {category} content"
    if path.exists() and duration(path) <= break_seconds:
        return path, f"its custom ad for {viewer['segment']} viewers after {category} content was in the cache", False
    seconds = clip_seconds(break_seconds)
    if jobs.get(path.relative_to(ROOT).as_posix(), {}).get("state") == "generating":
        if seconds:
            return path, f"{missing}, but one is being generated, so the network ad plays until it is ready", True
        return None, f"{missing}; one is being generated, but there isn't time to wait for it in this break", False
    if not allow_generation:
        return None, f"{missing}, and generation is switched off", False
    if not seconds:
        started = start_generation(adv, viewer, category, MAX_GENERATED_SECONDS, path)
        return None, f"{missing}, and a {break_seconds}s break is too short to generate one" + \
            (", so it is generating for next time" if started else f"; today's budget of {GENERATIONS_PER_DAY} generations is spent"), False
    if not start_generation(adv, viewer, category, seconds, path):
        return None, f"{missing}, and today's budget of {GENERATIONS_PER_DAY} generations is spent", False
    return path, f"{missing}, so one is being generated now and the network ad plays until it is ready", True


# ---- The decision ----

def decide(break_id, viewer_id, allow_generation=False, only=None, dry_run=False):
    """What plays in one break for one viewer, and a log explaining it in plain words.
    An advertiser qualifies when it is eligible and Jev is confident it is brand safe and fits at least weakly.
    Qualifying ads fill the break, strong fits first and best fit first within each level: a strong fit plays its
    custom ad (or its pre-approved ad if no custom ad is ready), a weak fit its pre-approved ad. An ad plays only
    if it fits whole in the time left. The house ad closes the break once, and the program resumes.
    For the scorecard: only judges a single advertiser, and dry_run never generates, counts a play, or logs.
    Each candidate keeps a short route (the label data/scenarios.json uses) and an outcome sentence."""
    started = time.time()
    brk, viewer = BREAKS[break_id], VIEWERS[viewer_id]
    seconds = brk["duration_seconds"]
    log = {"at": dt.datetime.now().isoformat(timespec="seconds"), "break": break_id, "break_seconds": seconds,
           "viewer": viewer_id, "thresholds": {"brand_safe": BRAND_SAFE_THRESHOLD, "fit": FIT_THRESHOLD}, "candidates": [],
           "api_calls": []}

    eligible, ineligible = [], []
    for adv in ADVERTISERS:
        if only and adv["id"] != only:
            continue
        reason = ineligible_reason(adv, brk, viewer_id)
        if reason:
            ineligible.append({"advertiser": adv["id"], "route": "ineligible", "outcome": f"Ineligible ({reason}), so Jev was not asked."})
        else:
            eligible.append(adv)

    judgments = {}
    if eligible:
        try:
            log["category"], judgments = judge(brk, eligible, log["api_calls"])
        except Exception as e:  # no judgment means no proof of safety, so nobody plays
            log["judge_error"] = repr(e)
        log["judge_ms"] = round((time.time() - started) * 1000)

    def rank(adv):  # strong fits first, then weak, then the rest; best fit first within each
        judgment = judgments.get(adv["id"])
        level = judgment and judgment["p_safe"] >= BRAND_SAFE_THRESHOLD and fit_level(judgment)
        return ({"strong": 0, "weak": 1}.get(level, 2), -fit_score(judgment))

    items, remaining, may_generate = [], seconds, allow_generation  # only the best strong fit may generate
    for adv in sorted(eligible, key=rank):
        judgment = judgments.get(adv["id"])
        entry = {"advertiser": adv["id"], **(judgment or {})}
        log["candidates"].append(entry)
        if not judgment:
            entry["route"], entry["outcome"] = "blocked", "Blocked: Jev gave no judgment, so brand safety is unproven."
            continue
        if judgment["p_safe"] < BRAND_SAFE_THRESHOLD:
            entry["route"], entry["outcome"] = "blocked", \
                f"Blocked: brand safety {judgment['p_safe']:.2f} is below {BRAND_SAFE_THRESHOLD:.2f}."
            continue
        level = fit_level(judgment)
        entry["route"] = "fallback"
        if not level:
            entry["outcome"] = (f"Passed over: brand safe, but only {judgment['p_strong'] + judgment['p_weak']:.2f} sure "
                                f"it fits even weakly (needs {FIT_THRESHOLD:.2f}).")
            continue
        creative = adv["fallback_creative"]
        if level == "weak":
            qualified = f"qualifies at the weak level ({judgment['p_strong'] + judgment['p_weak']:.2f} sure it fits at least weakly)"
            if judgment["fit"] == "strong":  # Jev's answer was strong, but not confidently enough
                qualified = f"Jev leans strong, but only {judgment['p_strong']:.2f} sure (strong needs {FIT_THRESHOLD:.2f}), so it {qualified}"
            else:
                qualified = qualified.capitalize()
            plays_what = "its pre-approved ad"
        elif dry_run:
            entry["route"] = "generate" if clip_seconds(remaining) else "fallback"
            qualified, plays_what = f"Qualifies with a strong fit ({judgment['p_strong']:.2f} sure)", "its ad (scorecard run)"
        else:
            path, why, generating = personalized_creative(adv, viewer, log.get("category"), remaining, may_generate)
            may_generate = False
            qualified = f"Qualifies with a strong fit ({judgment['p_strong']:.2f} sure)" + (f", and {why}" if path else f", but {why}")
            if generating:  # the player covers the wait with the network ad, then switches to the custom ad
                clip, wait = clip_seconds(remaining), expected_generation_seconds(clip_seconds(remaining))
                entry["route"], entry["outcome"] = "generate", f"{qualified}. Plays its custom ad ({clip}s) once generated."
                items.append({"src": path.relative_to(ROOT).as_posix(), "seconds": clip, "advertiser": adv["id"],
                              "generating": True, "filler": HOUSE_AD["creative"],
                              "fallback": {"src": creative, "seconds": duration(creative)}})
                remaining -= wait + clip
                continue
            if path:
                creative, entry["route"], plays_what = path.relative_to(ROOT).as_posix(), "generate", "its custom ad"
            else:
                plays_what = "its pre-approved ad instead"
        length = duration(creative)
        if not length:
            entry["outcome"] = f"{qualified}, but {creative} is missing, so nothing of theirs plays."
        elif length > remaining:
            entry["outcome"] = f"{qualified}, but {plays_what} ({length:.0f}s) does not fit the {remaining:.0f}s left."
        else:
            entry["outcome"] = f"{qualified}. Plays {plays_what} ({length:.0f}s)."
            items.append({"src": creative, "seconds": length, "advertiser": adv["id"]})
            remaining -= length
    log["candidates"] += ineligible

    advertisers = [ADVERTISERS_BY_ID[item["advertiser"]]["name"] for item in items]
    if advertisers:
        log["result"] = f"{len(advertisers)} qualifying ad{'s' if len(advertisers) > 1 else ''} play: {', then '.join(advertisers)}."
    elif not eligible:
        log["result"] = "No advertiser is eligible, so only the network ad plays."
    elif not any(j["p_safe"] >= BRAND_SAFE_THRESHOLD for j in judgments.values()):
        log["result"] = "No eligible advertiser is confidently brand safe, so only the network ad plays."
    else:
        log["result"] = "No brand-safe advertiser has a confident fit whose ad fits the break, so only the network ad plays."
    if remaining > 0.5:
        items.append({"src": HOUSE_AD["creative"], "seconds": min(duration(HOUSE_AD["creative"]), remaining)})
    log["items"], log["total_ms"] = items, round((time.time() - started) * 1000)

    if not dry_run:
        for item in items:
            if "advertiser" in item:
                plays[(viewer_id, item["advertiser"])].append(time.time())
        with lock, open(MEDIA / "decisions.jsonl", "a") as f:
            f.write(json.dumps(log) + "\n")
    return {"items": items, "log": log}
