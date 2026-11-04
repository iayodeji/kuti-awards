---
name: Nocturne Laurels
colors:
  surface: '#141315'
  surface-dim: '#141315'
  surface-bright: '#3a393b'
  surface-container-lowest: '#0f0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f21'
  surface-container-high: '#2b292c'
  surface-container-highest: '#363436'
  on-surface: '#e6e1e4'
  on-surface-variant: '#d9c1c1'
  inverse-surface: '#e6e1e4'
  inverse-on-surface: '#313032'
  outline: '#a18c8c'
  outline-variant: '#544343'
  surface-tint: '#ffb3b6'
  primary: '#ffb3b6'
  on-primary: '#591a22'
  primary-container: '#4a0e17'
  on-primary-container: '#ca7379'
  inverse-primary: '#93474d'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#f7b6bb'
  on-tertiary: '#4e2329'
  tertiary-container: '#40181e'
  on-tertiary-container: '#b77d82'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b6'
  on-primary-fixed: '#3d040e'
  on-primary-fixed-variant: '#763037'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdadc'
  tertiary-fixed-dim: '#f7b6bb'
  on-tertiary-fixed: '#340f15'
  on-tertiary-fixed-variant: '#68393e'
  background: '#141315'
  on-background: '#e6e1e4'
  surface-variant: '#363436'
typography:
  headline-xl:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Newsreader
    fontSize: 34px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 26px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0em
  headline-md:
    fontFamily: Newsreader
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Newsreader
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: 0.01em
  title-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  label-lg:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.12em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 4rem
---

## Brand & Style

This design system establishes an atmospheric, dark-editorial digital environment created exclusively for collegiate honors and awards voting. Combining historic gravitas with restrained modern luxury, the visual narrative honors hall legacy, fraternity, and intellectual distinction.

### Personality & Tone
- **Atmospheric & Somber:** Immersive, low-key lighting aesthetic grounded in deep wine tones and textured shadows.
- **Editorial Distinction:** Editorial proportions led by sharp, literary serif typography balanced against disciplined geometric UI elements.
- **Restrained Reverence:** Deliberate suppression of hyper-saturated accents; gold is treated as an elusive honor rather than decorative adornment.
- **Spacious & Uncluttered:** Subtraction over addition. Negative space commands respect, eliminating unnecessary border lines, boxes, and UI noise.

### Target Audience & Emotional Impact
Designed for collegiate residents, alumni, and voting cohorts participating in hall accolades. The emotional register evokes an evening convocation—ceremonial, discerning, intimate, and distinctly prestigious.

## Colors

The palette balances dark, light-absorbent charcoal backgrounds with rich wine undertones, muted ash stone text hierarchies, and a strictly disciplined champagne gold reserved for conclusive interactions.

### Palette Roles & Balance

- **Background Foundations:**
  - Base canvas: `#121113` (Soft Charcoal).
  - Raised atmospheric wash & cards: `#18161A` (Layered Charcoal) and deep blackened burgundy `#1E0509` / `#2B080E`.
- **Primary Accent (`#4A0E17`):**
  - Rich velvety wine used to tint elevation gradients, nominee profile overlays, and selected category surfaces.
- **Secondary Accent (`#D4AF37` / `#DFCA8A` Champagne Gold):**
  - Applied sparingly. Restrict strictly to: confirmed vote marks, winner laurel insignias, active radio indicators, and primary CTAs in committed states. Never used for full-bleed card fills or decorative border rings.
- **Neutral Stone Spectrum:**
  - Primary text: `#E5E2DE` (Warm Off-White / Fine Chalk).
  - Secondary metadata & captions: `#A39E98` (Muted Warm Ash).
  - Ghost copy, category index counters, and disabled tracks: `#6B6661` (Deep Ash Stone).

## Typography

The typographical pairing expresses academic honor through contrasting typographic traditions: the literary, high-caliber presence of Newsreader for display text, juxtaposed against the disciplined clarity of Manrope for voting metadata, nomination biographies, and system controls.

### Typographic Principles
- **Editorial Proportions:** Category titles and nominee names utilize generous line heights and subtle negative tracking to command visual authority.
- **Label Tracking:** All uppercase indicators (`label-lg`, `label-sm`) carry wide tracking (+0.08em to +0.12em) to articulate ceremonial order (e.g., `CATEGORY 04`, `VOTE RECORDED`).
- **No Weight Bloat:** Bold weights are eliminated from headlines. Visual weight is maintained entirely through scale and serif cut rather than artificial heavy weights.

## Layout & Spacing

Layout rhythm relies on spatial proportion rather than visible dividing lines. Whitespace (or deep charcoal void) acts as an active structural element to isolate each nominee and category.

### Layout Philosophy & Grid
- **Columns & Container:** Desktop operates on a 12-column grid capped at 1280px max-width, maintaining generous 3rem (`margin`) canvas gutters. Nominee cards span 4 or 6 columns to allow wide breathing room for portraits and credentials.
- **Mobile Reflow:** Single-column layout with 1.25rem margin. Cards stretch edge-to-edge within margins, emphasizing vertical rhythm and continuous scrolling.
- **Breathing Intervals:** A standard vertical spacer of `space-2xl` (4rem) separates major ballot categories, establishing natural pauses in the voting journey.

## Elevation & Depth

To sustain atmospheric editorial minimalism, physical drop shadows and visible hairline border grids are strictly avoided. Depth is achieved via pure tonal layering and subdued ambient radiance.

### Depth Mechanics
- **Tonal Stepping:**
  - Base layer: Solid `#121113`.
  - Content containers: Surface step to `#18161A` or `#1E0509`.
  - Nominee highlight: Low-gradient wash blending from `#2B080E` into translucent charcoal.
- **Ambient Vignettes:** Nominee portrait cards feature subtle radial gradient vignettes rather than card borders. Imagery dissolves organically into the background canvas.
- **Zero Borders:** No 1px keylines or container strokes. Visual grouping is achieved strictly via surface color contrast and typography positioning.

## Shapes

The design system maintains a refined, architectural curvature with soft micro-radii (`0.25rem` / 4px base). 

### Geometry Guidelines
- **Nominee Surfaces & Containers:** Soft, clipped corners preserve the tactile quality of printed ballot programs.
- **Interactive Badges & Buttons:** Subtle 4px corner radii avoid sterile brutalist sharpness while resisting the overly playful look of pill-shaped buttons.
- **Portraits:** Square or architectural 4:5 ratios with soft 4px edge finishing.

## Components

### Buttons
- **Primary (Submit Vote / Confirm Ballot):** Background set to `#4A0E17`, transitioning into muted gold `#D4AF37` text on focus and active states. Minimum height: 48px. Padding: 0 2rem. Manrope uppercase tracking.
- **Secondary / Ghost (View Bio / Return):** Background `#18161A`, text `#E5E2DE`. No border. Hover state lifts background subtly to `#2B080E`.

### Nominee Voting Cards
- Structural cards that house the candidate portrait, moniker, credentials, and selection target.
- Background: `#18161A`. Hover states reveal a quiet underlay of `#1E0509`.
- Selected State: Outlined purely through subtle tone shifts; champagne gold (`#D4AF37`) is introduced only on the radio selection ring and check indicator.

### Radio Buttons & Selection Controls
- Unselected: A subtle 16px disc in `#2B080E` with a muted ash center `#6B6661`.
- Selected: A rich wine background (`#4A0E17`) with a solid champagne gold (`#D4AF37`) center pin. Zero jarring glow effects.

### Category Filters & Status Chips
- Chips operate as typographic indicators.
- Inactive: Pure text in `#A39E98` accompanied by category index numbers (`01`, `02`).
- Active: Text transitions to `#E5E2DE` with a subtle wine-tinted underline marker or soft background wash in `#2B080E`.

### Input Fields (Voter Token & Hall ID)
- Background `#18161A` with zero bottom border or box-stroke. Soft internal padding.
- Text `#E5E2DE`, placeholder rendered in `#6B6661`. Focus state initiates a soft ambient warm-ash background change to `#1E0509`.