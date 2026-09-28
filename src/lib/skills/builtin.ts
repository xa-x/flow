import { parseAndResolve, type ResolvedSkill } from "./format";

const SUMMARIZE = `---
name: summarize-bullets
displayName: Summarize in bullets
description: >
  Turn long text into five concrete bullet points.
  Use when the user pastes an article or notes and wants a short brief.
---

# Summarize in bullets

Read the incoming text and produce exactly five bullets.

## Rules

- Lead each bullet with the fact, not a preamble.
- Keep each bullet to one sentence.
- Drop filler, ads, and navigation.
- Preserve names, numbers, and dates.
- If the source is already short, still emit five bullets — split or infer cautiously.

## Output

Plain markdown bullets. No title, no closing remark.
`;

const REWRITE = `---
name: rewrite-clear
displayName: Rewrite clearly
description: >
  Rewrite incoming prose so it is direct, specific, and easy to scan.
  Use for emails, docs, or messy notes.
---

# Rewrite clearly

Rewrite the incoming text. Keep the meaning. Cut the fog.

## Rules

- Prefer short sentences and concrete verbs.
- Keep technical terms the author already used.
- Do not add a greeting or sign-off unless the source has one.
- Preserve lists when they already exist.

## Output

The rewritten text only.
`;

const PRODUCT = `---
name: cinematic-product
displayName: Cinematic product photo
description: >
  Product photography direction for image models.
  Use when generating or editing a still of an object.
---

# Cinematic product photo

Photograph the subject as a finished commercial still.

## Prompting

85mm look, soft key from camera-left, gentle rim, dark seamless backdrop,
sharp subject, no text, no watermark, no extra props unless asked.
`;

const STORYBOARD = `---
name: storyboard-shot
displayName: Storyboard shot
description: >
  One-shot video direction: subject, camera move, lighting.
  Use for text-to-video or image-to-video nodes.
---

# Storyboard shot

Describe a single continuous shot the video model can hold.

## Prompting

Hold on the main subject. Slow push-in. Natural light. No jump cuts,
no on-screen text, no logos. Keep motion small and readable.
`;

const VOICE = `---
name: voice-narration
displayName: Voice narration
description: >
  Spoken narration style for text-to-speech.
  Use when turning copy into a voiceover.
---

# Voice narration

Speak the incoming text as a calm narrator.

## Prompting

Even pace, clear diction, no stage directions, no music cues.
Read numbers naturally. Do not add a greeting.
`;

export const BUILTIN_SKILL_MD = [
  SUMMARIZE,
  REWRITE,
  PRODUCT,
  STORYBOARD,
  VOICE,
] as const;

export const BUILTIN_SKILLS: ResolvedSkill[] = BUILTIN_SKILL_MD.map((raw) =>
  parseAndResolve(raw),
);

export function builtinBySlug(slug: string) {
  return BUILTIN_SKILLS.find((s) => s.slug === slug) ?? null;
}

export function builtinMdBySlug(slug: string) {
  const hit = BUILTIN_SKILLS.find((s) => s.slug === slug);
  if (!hit) return null;
  return BUILTIN_SKILL_MD[BUILTIN_SKILLS.indexOf(hit)] ?? null;
}
