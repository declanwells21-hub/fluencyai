# Fluency AI — Design System

**Fluency AI is an AI language coach you talk to.** It exists for one problem:
*"I've studied this language, but when someone actually speaks to me I freeze."*
The product's job is to move a learner from studying a language to communicating in it —
so the centre of the product is a real spoken conversation, not a lesson queue.

The AI is designed as a full loop, and the interface makes every stage of it visible:

> **Listen → Detect → Understand → Interpret → Respond → Correct → Teach → Adapt**

Design consequences that follow from that, and that this system enforces:

- **The conversation is the product.** One immersive dark surface, one voice object, no chrome competing with it. Speaking is one tap from every screen (the raised mic in the tab bar).
- **Corrections teach, they never grade.** Every fix is *what you said → what to say → why*, plus how a local would phrase it. No scores on utterances, no red crosses, no "streak lost".
- **Confidence is shown, not hidden.** Live captions mark words the recogniser is unsure about, pronunciation is broken down per syllable — that is how the AI proves it is really listening.
- **Progress is measured in communication ability** (speaking, listening, grammar-in-speech, range) and in recurring mistakes drawn from the learner's own quoted words — never in points or completed units.
- **Gamification is a seasoning, not the identity.** There is no XP economy in this system; a streak is at most a caption on a header.

## Sources given

| Source | What it is | How it was used |
|---|---|---|
| `assets/logo-appicon.png` (from `uploads/photo_2026-08-27_05-11-41.jpg`) | Fluency app icon: type-only wordmark, teal "F" on ink navy | Defines the brand's ink navy + teal, the wordmark treatment, and the corner-radius feel |
| `assets/illustration-characters-group.png` (from `…05-12-55.jpg`) | Flat character illustration, teal/mint/indigo with grain and black line accents | The brand's character cast: onboarding, empty states, coach cards, CTA |
| `assets/lettering-stay-strong.jpg` (from `…05-12-16.jpg`) | Expressive hand-lettering in the same palette | Milestone / celebration moments only |
| `assets/reference-ui-palette.jpg` (from `…05-12-03.jpg`) | Two generic UI templates (a course-site hero, a SaaS dashboard) in teal / mint / indigo | Palette + confirmation of the teal-with-indigo-accent scheme. **Its layout conventions were deliberately not copied** — see "Reference critique" |
| Duolingo (named as tonal inspiration) | Playful, character-driven learning app | Tactile press edges, character presence, plain-spoken copy. **Not** copied: mascot styling, XP/gem economy, lesson-tree IA, cartoon proportions |

No codebase, Figma file, font binaries, icon set or photography were supplied. Everything flagged
below as a substitution should be replaced when the real assets exist.

### Reference critique (what would have limited the product)
- The dashboard reference is **metric-dense** — four KPI tiles, three charts. Applied to a language app that becomes vanity scoring. Here the same visual density is spent on *ability and mistakes*, capped at three stat tiles per screen.
- The course-site hero sells **catalogue size** ("300+ courses"). Fluency's hero instead shows the live voice UI hearing a sentence, because the differentiator is comprehension, not inventory.
- Both references are **light-only**. A conversation needs an immersive, low-noise surface, so this system adds a dark immersive layer (`--surface-immersive`, `--grad-immersive`) that is the *default* for live voice.
- The pure-geometric shape collage in the reference hero would fight the character illustrations. Characters win; geometry is limited to the shapes already inside the illustration style.

### Opportunities added beyond the brief
Repair moves as a first-class UI (say again / slower / explain differently / give me a phrase) · confidence-marked live captions · syllable-level pronunciation with a physical instruction, not a score · mistake patterns quoted from the learner's own speech with a trend · correction-mode control (Live / After / Off) inside the conversation · listening challenges at native speed · "describe any situation" free scenario entry instead of a fixed catalogue · level inferred from the first spoken sentence instead of a placement quiz.

---

## CONTENT FUNDAMENTALS

**Voice: a good coach who has heard you speak.** Direct, warm, specific, never gushing and never clinical.

- **Person.** Address the learner as **you**. The AI refers to itself sparingly and never as "we the company" inside a lesson moment: *"You handle past tense well now."* / *"Fluency listens to how you actually speak."*
- **Casing.** Sentence case everywhere — headings, buttons, tabs. UPPERCASE only for 11px overlines with 12% tracking (`LISTENING`, `COACH`). Never Title Case a sentence.
- **Length.** Headlines ≤ 8 words. Body ≤ 2 sentences per block. Correction "why" is exactly one sentence. Voice-state labels ≤ 3 words.
- **Specificity over encouragement.** ✅ *"You asked people to repeat 7 times this week instead of switching to English."* ❌ *"Great job, keep it up!"*
- **Situations, not skills.** Scenario titles name a moment: *"Ordering when the place is packed"*, *"“Tell me about yourself”"*, *"Complaining about a bill"* — not *"Restaurant vocabulary A2"*.
- **Corrections are three beats.** Said → better → why, then optionally *"A local would say: …"*. Grammar terms are allowed only with a plain gloss: *"accusative (the object form)"*.
- **Errors blame the system, never the learner.** *"We couldn't hear you — check your mic."* Not *"Invalid input"*, not *"You spoke too quietly"*.
- **Numbers stay honest.** Minutes spoken, % understood first time, times a mistake recurred. No invented scores, no points.
- **Emoji: no.** The character illustrations and the icon set carry all the personality. Emoji never appear in product UI or marketing copy.
- **Target-language text** is set in the display face and never italicised for foreignness; translations and glosses are the italic/secondary layer.

Sample strings to copy the register from:
*"You've studied enough. Now say something."* · *"What do you need to survive?"* · *"Say anything — even badly."* ·
*"Three things worth fixing — the rest was understandable."* · *"Two minutes of speaking beats an hour of scrolling."*

---

## VISUAL FOUNDATIONS

**Colour.** Ink navy `#0B2233` and teal `#10B8B8` from the supplied app icon are the spine. Mint `#25D79B` is momentum/success, indigo `#5B55B8` is depth and grammar, cyan `#35DDFB` is the *listening* spark. Neutrals are navy-tinted (`--ink-*`) — never pure grey, never pure black. Max two background colours per screen: one light (`--ink-50`) or one immersive (`--ink-950`).
Correction types have **fixed** hues (cyan pronunciation, indigo grammar, amber word-choice, mint natural, teal listening) and voice states have fixed hues (cyan listening, indigo thinking, teal speaking, grey idle, coral error). These are the product's semantics — never improvise a new one.

**Type.** One family does display and UI: **Figtree** (Black 800 for display at −3% tracking, Bold 700 for titles, 400/500 for body). **Manrope** for numerals (tabular, via `.fl-tabnum`). **JetBrains Mono** for IPA, timings, confidence values and quoted learner speech. Conversation text is 17px minimum — it is read while speaking.

**Spacing & layout.** 4-based scale (2/4/8/12/16/20/24/32/40/48/64/80). Screen gutter 20, card padding 20, related-line stack 12. Mobile canvas 402×872 with a 76px tab bar; web content maxes at 1200. Tap targets ≥ 44px, primary voice control 56–190px. Fixed elements: top bar (56, translucent), bottom tab bar (76, translucent, raised mic), bottom sheets.

**Backgrounds.** Two worlds. *Light product surfaces*: `--ink-50` page with white cards. *Immersive*: `--grad-immersive` (a radial navy-teal well) for onboarding, live conversation and the marketing hero. Full-bleed imagery is always paired with `--grad-protect-bottom` before text. No repeating patterns, no noise overlays except the grain already inside the character art. Gradients are limited to the four defined tokens; there are **no purple-blue AI gradients** in this system.

**Cards.** 20px radius (28 for hero/scenario), 1px `--border-subtle` hairline, `--shadow-s` at rest. Shadows are navy-tinted, never black. Glass cards (`tone="glass"`, 8% white + blur) exist **only** over the immersive surface. Never nest two elevated cards.

**Transparency & blur.** Reserved for chrome over content (top bar, tab bar, sheet scrim) and glass cards on dark. Never for decoration on light surfaces.

**Glow.** `--glow-listen / speak / think` are semantic, not decorative — a glow means *live audio state right now*. The only exception is `--glow-brand-soft` under the raised mic button.

**Animation.** 140ms hover/press, 220ms state change, 360ms sheets and scene changes. `--ease-standard` for most, `--ease-out` for entering, `--ease-spring` for toggles and pops, `--ease-breathe` for anything representing breath/voice. Named keyframes: `fl-breathe` (voice presence), `fl-pulse-ring` (listening rings), `fl-think-dots`, `fl-bar` (waveform), `fl-shimmer` (skeleton), `fl-pop-in`. Motion is used to express listening, thinking, speaking and progress — never to decorate. Reduced-motion is honoured globally.

**Hover.** Cards lift −2px and go to `--shadow-m`. Buttons darken by 4% brightness. Links move teal-600 → teal-700 with a 3px-offset underline; on dark, → teal-300.

**Press.** The tactile system: primary and accent buttons carry a 3px darker bottom edge (`--edge-brand`, `--edge-mint`) which collapses as the button translates +2px and scales to .97. Icon buttons only scale. This is the one borrowed idea from playful learning apps, restyled.

**Borders & radii.** Hairline 1px `--ink-200` is the default separation; 2px only for checkbox and focus; 3px only for the tactile edge. Radii: 6 (checkbox) / 10 (chips, tooltips) / 14 (inputs, small tiles) / 20 (cards) / 28 (sheets, hero cards) / pill (all buttons, tags, badges).

**Focus.** `--ring-focus` (white gap + teal halo) on light, `--ring-focus-inverse` on immersive. Never remove focus visibility.

**Imagery vibe.** Cool, saturated teal-to-indigo, flat vector with light grain and black line accents; characters are stylised adults with expressive posture — not cute mascots, not 3D, not photoreal. Photography, if introduced, should be cool-toned, low-contrast and always sit behind the protection gradient.

---

## THE COACH (mascot decision, Oct 2026)

The app's **Coach** character (`Coach.dc.html` → `cast/fluency-coach.js`, `<fl-coach>`) is the brand's only character on web and in-app. It **replaces Wiko** everywhere; Wiko is retired. The voice orb is no longer the hero object on the website, though it stays in the live-voice UI.

- Two presets: **Dan** and **Mia**, with skin, hair and outfit options set by the learner in *Your coach*.
- 11 expressions mapped to AI state: idle · welcome · listening · thinking · speaking · happy · encouraging · confused · cantHear · sad · celebrating.
- Expression is **semantic**: it follows live voice state (cyan listening, indigo thinking, teal speaking) and never animates for decoration alone. The circle disc + glow follows the same state hues.
- Website: the hero Coach animates in step with the live correction card; in the conversational layout a sticky Coach reacts to the section in view.
- Reduced motion: the float and glow stop; expressions still change.

---

## ICONOGRAPHY

No icon set was supplied. **Substituted: [Lucide](https://lucide.dev) 0.454.0 via CDN** — 2px stroke, round caps, geometric, which matches the geometric grotesque wordmark and the flat illustration line weight. Every icon in the system goes through the `Icon` component (`<Icon name="mic" size={20} />`), so swapping in a bespoke set later is one file.

- Sizes: 12 inside badges · 14–16 inline with text · 18–20 default UI · 22–24 nav and list medallions · 26–28 hero/voice.
- Stroke 2 by default; 2.3–2.6 for small filled contexts; 1.9 for 24px+ nav.
- Icons are always paired with a label or an `aria-label`; icon-only controls use `IconButton` (label required).
- **Emoji are never used as icons.** Unicode is used only for real linguistic content (IPA `/ɛntˈʃʊldɪɡʊŋ/`, umlauts) in the mono/display faces.
- Product-specific glyph vocabulary: `mic` speak · `audio-lines` pronunciation/AI speaking · `ear` listening · `scan-text` grammar · `book-open` vocabulary · `sparkles` AI insight · `brain` memory · `repeat` say again · `gauge` speed · `languages` translate · `captions` subtitles.
- Logo/illustration assets are raster (`assets/*.png`, `*.jpg`) as supplied. **No logo was drawn or reconstructed** — the wordmark is set in type by the `Wordmark` component, matching the supplied type-only mark.

### Substitutions to confirm
1. **Fonts** — Figtree / Manrope / JetBrains Mono are Google-Fonts stand-ins loaded via `tokens/fonts.css`. Send the real brand font files and only that file changes.
2. **Icons** — Lucide, as above.
3. **Photography / scenario imagery** — none supplied; scenario cards fall back to the immersive gradient.
4. **Character art** — one group illustration was supplied and is used whole, background knocked out. Individual per-partner character cut-outs (Lena, Jonas, Ute…) are needed for the AI-partner system to reach its full potential.

---

## Index

| Path | What |
|---|---|
| `styles.css` | Consumer entry point — `@import` list only |
| `tokens/` | `fonts` · `colors` · `typography` · `spacing` · `radius` · `elevation` · `motion` · `base` |
| `guidelines/*.card.html` | 21 foundation specimen cards (Colors, Type, Spacing, Brand) |
| `components/` | React primitives, grouped by concern (below) |
| `ui_kits/app/` | Mobile app recreation — onboarding → today → practice → live conversation → debrief → progress |
| `ui_kits/site/` | Marketing landing page |
| `assets/` | Logo/app icon, character illustration, lettering, reference board |
| `SKILL.md` | Agent-Skills entry point |

### Components

**core** — `Icon`, `Button`, `IconButton`, `Card`, `Badge`, `Tag`, `Avatar`, `Wordmark`
**forms** — `Input`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `Slider`
**feedback** — `Toast`, `Sheet`, `Tooltip`, `EmptyState`, `Skeleton`
**navigation** — `TabBar`, `TopBar`, `ListRow`
**voice** — `VoiceOrb`, `WaveformMeter`, `ThinkingIndicator`, `LiveCaption`, `TranscriptTurn`, `PronunciationMeter`
**learning** — `CorrectionCard`, `ScenarioCard`, `SkillBar`, `StatTile`, `CoachTip`, `MistakePattern`, `ProgressRing`

Each component directory carries `<Name>.jsx`, `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (what & when, usage, variants), plus one `@dsCard` HTML showing its states.

**Intentional additions** (no source defined a component inventory, so the set was authored from the product's needs): the `voice` and `learning` groups exist because the product's differentiators — voice state, confidence, correction, mistake memory — cannot be expressed with generic primitives. `Wordmark` exists because the supplied mark is type-only. `SegmentedControl` replaces a generic Tabs component: every exclusive choice in this product is short and inline.

## Usage

```html
<link rel="stylesheet" href="styles.css">
<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, VoiceOrb, CorrectionCard } = window.FluencyAIDesignSystem_b0c8f6;
</script>
```
