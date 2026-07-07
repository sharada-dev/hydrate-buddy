# 🎨 Make your own character

Hydrate Buddy needs **two images** of your character:

| File | Pose |
| ---- | ---- |
| `assets/raw/idle.png` | **standing**, holding a water bottle |
| `assets/raw/drinking.png` | **drinking** from the bottle |

The trick is making both look like the **same character**. Here's a copy-paste
recipe for any AI image tool (ChatGPT, Gemini, etc.).

---

## The 3 rules for results that "just work"

1. **Plain, solid background** (a flat pale blue works great) — the app cuts it
   out automatically, and a busy background will leave messy edges.
2. **Full body, with empty space around them** — head to feet, centered.
3. **Same character in both images** — generate the standing pose first, then
   make the drinking pose *in the same chat* so the tool can match it.

---

## Step 1 — the standing pose

Paste this, replacing the **[DESCRIBE YOUR CHARACTER]** part:

> Full-body pixel-art character, front view, standing and smiling.
> **[DESCRIBE YOUR CHARACTER — e.g. a young man with short black hair, round
> glasses, a navy hoodie and grey joggers, brown sneakers].**
> They are holding a reusable water bottle in one hand, down at their side.
> Clean, detailed pixel-art style with soft shading; friendly and wholesome.
> Plain solid pale-blue background, a subtle soft shadow under the feet, the
> character centered with empty space all around. No text, no frame, no border.

Save the result as `assets/raw/idle.png`.

## Step 2 — the drinking pose (keep it in the same chat!)

Right after, with the first image still in the conversation, paste this:

> Using the previous image as the reference, keep the **exact same character** —
> same face, hairstyle, glasses, outfit, colours, art style and proportions.
> Now show them tilting their head back and **drinking from the same water
> bottle**, seen from the side. Same clean pixel-art style, same plain solid
> pale-blue background, same soft shadow under the feet. Full body, centered,
> with empty space around them. No text, no frame, no border.

Save the result as `assets/raw/drinking.png`.

---

## Step 3 — turn them into the app's sprites

From the project folder:

```bash
npm run prepare-assets   # removes the background, preps the sprites + tray icon
npm run make-icon        # (optional) refresh the app icon from your new character
npm start                # see your character live
```

---

## Troubleshooting

- **The two poses don't match.** Regenerate the drinking pose, and add: *"match
  the reference character more closely."* Keeping both prompts in one chat helps a
  lot.
- **Edges look messy / there's a colored halo.** The background wasn't a flat
  solid colour. Regenerate with a plain single-colour background and re-run
  `npm run prepare-assets`.
- **She looks cut off.** Ask for *"full body with more empty space around the
  character."*
- **Different theme?** You don't have to keep the water bottle — but the app's
  celebration shows the "drinking" pose, so having them drink *something* in the
  second image keeps it looking right.
