#!/usr/bin/env python3
"""Runs the labeled scenarios in data/scenarios.json through the same decision code as the player.
Calls Jev, never fal. Run: python3 scorecard.py"""
import json, os

os.environ.setdefault("NOW", "2026-10-01")  # pin the date so campaign flight checks give the same answer every run
from decisioning import BRAND_SAFE_THRESHOLD, ROOT, decide

scenarios = json.loads((ROOT / "data" / "scenarios.json").read_text())["scenarios"]
matches = 0
print(f"{'id':4} {'break':20} {'advertiser':21} {'expected':26} {'actual':26} p_safe p_strong")
for s in scenarios:
    c = decide(s["break"], s["viewer"], only=s["advertiser"], dry_run=True)["log"]["candidates"][0]
    actual = {"route": c["route"], "brand_safe": c.get("p_safe", 0) >= BRAND_SAFE_THRESHOLD, "fit": c.get("fit")}
    compared = ["route"] if s["expected"]["route"] == "ineligible" else ["route", "brand_safe", "fit"]  # Jev never sees ineligible
    match = all(actual[k] == s["expected"][k] for k in compared)
    matches += match
    show = lambda d: " ".join(str(d[k]) for k in compared)
    probabilities = f"{c['p_safe']:.2f}   {c['p_strong']:.2f}" if "p_safe" in c else ""
    print(f"{s['id']:4} {s['break']:20} {s['advertiser']:21} {show(s['expected']):26} {show(actual):26} "
          f"{probabilities:13} {'' if match else 'MISS'}")
print(f"\n{matches}/{len(scenarios)} scenarios match")
