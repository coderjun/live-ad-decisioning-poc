# Asset prompts

Every brand, product, and creative in this POC is fictional and AI-generated.
The approved stills and end cards were made in ChatGPT, one conversation per 
brand, with the prompts below. 

The pre-approved and personalized creatives made at runtime come from a different model, fal's H3
Max Turbo, anchored to these same approved stills and end cards.

## What each brand needs

| File | What it is |
| --- | --- |
| `<slug>-still.png` | Approved first frame. Generated creatives start here |
| `<slug>-endcard.png` | Approved last frame: brand name and tagline. Generated creatives end here |
| `<slug>-15s.mp4` | The pre-approved creative, played when fit is weaker |

Slugs: `skyward`, `crunch`, `harbor`, `meridian`, `volt`, `house`.

## How to run each brand

### How to run each brand (Still and Endcard)
One new ChatGPT conversation per brand. Three messages, in order:

1. **Brief.** Paste the brand's brief. It sets the rules for the whole
   conversation, so the later prompts stay short.
2. **Still.** Paste the still prompt. Save the image as `<slug>-still.png`.
3. **End card.** Paste the end card prompt. Check the lettering. Save as
   `<slug>-endcard.png`. If any letter is wrong, ask once for a fix, otherwise tell it to 
   generate w/o text and use the ffmpeg fallback at the bottom.


### How to run each brand (Pre-approved mp4)

One new fal H3 Max Turbo generation per brand:

1. **Video.** Attach the still and the end card, then paste the video prompt.
   Save as `<slug>-15s.mp4`.

**Review every result before keeping it.** That review is what makes the
creative "pre-approved."

---

## Skyward Air

**1. Brief**

```text
You are making advertising assets for Skyward Air, a fictional airline. Tone: calm, premium, optimistic. Palette: deep sky blue, white, dawn gold. Rules for everything in this conversation: 16:9, clean commercial photography, soft natural light, shallow depth of field. No real brands, logos, trademarks, or recognizable people. Keep the right third of every photo uncluttered. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: a smiling traveler in her thirties looks out a large airplane window at a sunlit mountain range above the clouds, warm golden morning light, clean modern cabin in soft blue and white. No text or branding anywhere.
```

**3. End card**

```text
The end card: a smooth gradient from deep sky blue to pale dawn gold with a subtle curved line suggesting a flight path. Centered, in large clean white type: "Skyward Air". Beneath it, smaller: "Go further, rested." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. Slow cinematic push toward the airplane window as clouds drift past and sunlight brightens, then a smooth transition into the end card. Calm, premium airline commercial. No text until the end card.
```

---

## Crunch Co. Pretzels

**1. Brief**

```text
You are making advertising assets for Crunch Co. Pretzels, a fictional snack brand. Tone: warm, playful, family-friendly. Palette: toasted orange, cream, golden brown. Rules for everything in this conversation: 16:9, clean commercial photography, soft natural light, shallow depth of field. No real brands, logos, trademarks, packaging, or recognizable people. Keep the right third of every photo uncluttered. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: a wooden board of golden twisted pretzels with a small bowl of mustard dip on a bright kitchen counter, a family's hands reaching in from the edge of the frame, warm afternoon light. No text or packaging anywhere.
```

**3. End card**

```text
The end card: a warm toasted-orange to cream gradient with a subtle salt-grain texture and one abstract pretzel-twist line. Centered, in large clean white type: "Crunch Co." Beneath it, smaller: "Twisted for sharing." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. Hands pick up pretzels and dip them as the camera slowly slides across the board, light and upbeat, then a smooth transition into the end card. Friendly snack commercial. No text until the end card.
```

---

## Harbor Lager

An alcohol brand in a brand-safety demo should model the rules: adults only,
no drinking shown, no driving, no excess.

**1. Brief**

```text
You are making advertising assets for Harbor Lager, a fictional beer brand. Tone: relaxed, grown-up, premium. Palette: deep navy, warm amber. Rules for everything in this conversation: 16:9, clean commercial photography, soft natural light, shallow depth of field. Responsible alcohol advertising only: adults only, no one drinking on camera, no driving, no excess. No real brands, logos, trademarks, or recognizable people. Keep the right third of every photo uncluttered. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: a single frosted glass bottle of amber lager with no label text, on a weathered wooden table on a harbor pier at golden hour, sailboats softly out of focus behind, condensation on the glass. No people, no text.
```

**3. End card**

```text
The end card: a deep navy to warm amber gradient evoking a harbor at dusk, with a faint abstract wave line along the bottom. Centered, in large clean white type: "Harbor Lager". Beneath it, smaller: "Brewed by the water. Enjoy responsibly." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. Slow dolly around the frosted bottle as the sunset warms and boats drift in the background, then a smooth transition into the end card. Premium, relaxed beer commercial for adults. No one drinks. No text until the end card.
```

---

## Meridian Motors

**1. Brief**

```text
You are making advertising assets for Meridian Motors, a fictional car brand. Tone: confident, serene, precise. Palette: graphite, cool silver, sunrise warmth. Rules for everything in this conversation: 16:9, clean commercial photography, soft natural light, shallow depth of field. No real car brands, badges, logos, license plate text, or recognizable people. Keep the right third of every photo uncluttered. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: a sleek unbranded midsize electric SUV in deep graphite, parked on an empty coastal road at sunrise, ocean and cliffs behind, dew on the paint. No badges, no text.
```

**3. End card**

```text
The end card: a graphite to cool silver gradient with a single thin horizontal line suggesting a horizon. Centered, in large clean white type: "Meridian Motors". Beneath it, smaller: "Every road, calmly." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. The SUV glides slowly along the coastal road as the sun rises, smooth tracking shot, then a smooth transition into the end card. Calm, premium car commercial. No text until the end card.
```

---

## Volt Hydration

**1. Brief**

```text
You are making advertising assets for Volt Hydration, a fictional sports drink. Tone: energetic, determined, clean. Palette: electric blue, deep teal. Rules for everything in this conversation: 16:9, clean commercial photography, soft natural light, shallow depth of field. No real brands, logos, trademarks, brand markings on clothing, or recognizable people. Keep the right third of every photo uncluttered. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: a runner in her twenties pauses on a mountain trail at sunrise holding an unlabeled bright blue sports drink bottle, beads of sweat, mountains behind. No text or markings anywhere.
```

**3. End card**

```text
The end card: an electric blue to deep teal gradient with a subtle diagonal energy streak. Centered, in large clean white type: "Volt Hydration". Beneath it, smaller: "Charge the next mile." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. The runner takes a drink and sets off again as the camera follows, dynamic but smooth, then a smooth transition into the end card. Energetic sports drink commercial. No text until the end card.
```

---

## House ad "The Network": network promo

Plays when no advertiser clears brand safety, which includes breaking news, so
it must be safe next to anything: no people, no products, no mood that could
clash.

**1. Brief**

```text
You are making assets for a fictional TV network "The Network"'s own promo, its channel ident. It must be safe to air next to any content, including breaking news: no people, no products, no strong emotion. Tone: calm, elegant, neutral. Palette: violet, deep blue, warm white on dark. Rules for everything in this conversation: 16:9, abstract, no real brands or logos. I will ask for a still, an end card, and a 15-second video.
```

**2. Still**

```text
The still: soft layered ribbons of light in violet, blue, and warm white flowing across a dark background, gentle and elegant, like a premium TV channel ident. No text.
```

**3. End card**

```text
The end card: a dark violet to deep blue gradient with one faint glowing light ribbon. Centered, in large clean white type: "The Network". Beneath it, smaller: "Stay with us." Spell both exactly. Nothing else in the frame.
```

**4. Video** (attach the still and the end card)

```text
Make a 15-second video that opens on the first image and ends on the second. Ribbons of light drift and fold slowly across the frame, calm and elegant, then settle into the end card. Neutral channel ident. No text until the end card.
```

---

## Fallback: exact end card text with ffmpeg

Use this only if ChatGPT keeps misspelling the lettering. Ask it for the end
card background with no text, save it as `<slug>-endcard-bg.png`, then:

```bash
ffmpeg -y -i assets/skyward-endcard-bg.png -vf "drawtext=text='Skyward Air':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='Go further, rested.':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+50" assets/skyward-endcard.png
```

If `drawtext` fails for lack of a font library, add the text in any image
editor.
