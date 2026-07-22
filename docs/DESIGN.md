# File Tools - Design

> Cross-references: [VISION](./VISION.md)

This document describes the design system and key screens for File Tools as they are actually
shipped, plus the mockups for the four screens that extend the shipped Unzip flow: the
tool-picker home, a batch/multi-file view, and settings with the Pro unlock.

## 1. Design principles

- **Calm, trustworthy, offline-first.** The interface should read like a small, honest utility,
  not a product trying to sell you something. Generous whitespace, a single accent color, and no
  urgency-manufacturing UI (no countdown timers, no "X people are viewing this").
- **The UI is the proof, not a claim.** "100% offline" and the trust-chip footer
  ("No uploads · No account · No permissions · No network") appear on every screen so the promise
  is visible at the moment of use, not buried in a privacy policy. This is a product decision as
  much as a design one: the interface itself is the evidence.
- **No manipulative UI patterns.** No dark patterns in the UX sense: no disguised ads, no
  forced continuity, no obstructed cancel paths, no pre-checked opt-ins. The Pro unlock is a
  plain, honestly labeled purchase flow (see section 3, Settings/Pro).
- **Content-first.** The chrome stays out of the way. A file tree, a progress bar, and two
  buttons are usually the entire interface for a given state; there is no persistent nav bar,
  sidebar, or toolbar competing for attention.
- **Keyboard-first.** Every interactive surface (dropzone, buttons, file rows) is reachable and
  operable by keyboard alone, with visible focus states. See section 5.
- **Minimal motion.** The only animation in the system is the progress-bar pulse during
  extraction. Nothing else moves. The mocks wrap that pulse in
  `@media (prefers-reduced-motion: reduce)`; that guard is not yet present on the shipped
  `Progress` component (Tailwind's `animate-pulse` utility has no built-in reduced-motion
  handling), noted as a small follow-up in section 6.

## 2. Design system

### 2.1 Color tokens

Color scheme is fixed to **light** (`<meta name="color-scheme" content="light">`). There is no
in-app dark theme (see section 6 for why).

| Role | Token | Hex |
| --- | --- | --- |
| Root text | forest near-black | `#172217` |
| Root background | | `#f7faf5` |
| Page background | gradient | `radial-gradient(circle at top left, #e5f5e7, transparent 35%), #f8faf6` |
| Primary button bg | emerald-700 | `#047857` |
| Primary button bg (hover) | emerald-800 | `#065f46` |
| Accent tile / icon fill | emerald-100 | `#d1fae5` |
| Accent tile text | emerald-800 | `#065f46` |
| Offline pill border | emerald-200 | `#a7f3d0` |
| Offline pill text | emerald-800 | `#065f46` |
| Progress track | emerald-100 | `#d1fae5` |
| Progress fill | emerald-600 | `#059669` |
| Heading text | stone-950 | `#0c0a09` |
| Body text (primary) | stone-900 | `#1c1917` |
| Body text (secondary) | stone-800 | `#292524` |
| Body text (muted) | stone-600 | `#57534e` |
| Caption / helper text | stone-500 | `#78716c` |
| Disabled / placeholder | stone-400 | `#a8a29e` |
| Borders | stone-200 / stone-300 | `#e7e5e4` / `#d6d3d1` |
| Row/table divider | stone-100 | `#f5f5f4` |
| Subtle surface fill | stone-50 | `#fafaf9` |
| Error surface | red-50 | `#fef2f2` |
| Error border | red-200 | `#fecaca` |
| Error heading | red-950 | `#450a0a` |
| Error body | red-800 | `#991b1b` |

Emerald scale in full: 50 `#ecfdf5`, 100 `#d1fae5`, 200 `#a7f3d0`, 300 `#6ee7b7`, 500 `#10b981`,
600 `#059669`, 700 `#047857`, 800 `#065f46`. Stone scale in full: 50 `#fafaf9`, 100 `#f5f5f4`,
200 `#e7e5e4`, 300 `#d6d3d1`, 400 `#a8a29e`, 500 `#78716c`, 600 `#57534e`, 700 `#44403c`,
800 `#292524`, 900 `#1c1917`, 950 `#0c0a09`.

### 2.2 Type

Font stack: `Inter, ui-sans-serif, system-ui, sans-serif`. This is declared as the Tailwind
theme's `--font-sans`, but no `@font-face` or webfont file is loaded anywhere in the shipped code,
so Inter only renders if the visiting OS happens to have it installed; otherwise every screen
already falls back to the system UI font. The mocks rely on that same fallback stack directly and
load no webfont either, so they stay fully self-contained and render offline.

| Use | Size / weight | Color |
| --- | --- | --- |
| Eyebrow label ("FILE TOOLS") | text-sm, font-semibold, tracking-wide (the label text itself is typed in caps, there is no `uppercase` transform) | emerald-700 |
| H1 | text-4xl → text-5xl at `sm`, font-bold, tracking-tight | stone-950 |
| Intro / lede paragraph | text-base, leading-7 | stone-600 |
| Section heading (H2) | text-2xl or text-xl, font-bold/semibold | stone-950 |
| Body / row text | text-sm | stone-800 |
| Caption / helper | text-xs | stone-500 |
| Column label (table header) | text-xs, font-semibold, uppercase, tracking-wide | stone-500 |

### 2.3 Spacing, radii, shadow

- Page container: `max-w-4xl` (56rem), centered, `px-5 py-10`.
- Cards: white background, `border border-stone-200`, `shadow-sm`, `p-8` (or `p-6` for smaller
  tool cards on the home grid).
- Radii: buttons `rounded-xl` (0.75rem); cards, the file tree, and inputs `rounded-2xl` (1rem);
  the dropzone and large sections `rounded-3xl` (1.5rem); pills and badges `rounded-full`.
- Shadow is a single flat `shadow-sm`; nothing else in the system uses elevation, there is no
  modal/overlay pattern shipped yet.

### 2.4 Component inventory

- **Button** (`components/Button.tsx`). Primary: `bg-emerald-700` / hover `emerald-800`, white
  text, `rounded-xl px-4 py-2.5 text-sm font-semibold`. Secondary: white background,
  `border-stone-300`, `text-stone-800`, hover `bg-stone-50`. Disabled: `opacity-50`,
  `cursor-not-allowed`. Used for every action in the product; there is no tertiary/ghost variant.
- **Dropzone** (`lib/core/dropzone.tsx`). `rounded-3xl border-2 border-dashed`, idle state
  `border-stone-300 bg-white`, hover `border-emerald-500`, active drag state
  `border-emerald-600 bg-emerald-50`. Contains a `size-14` `rounded-2xl bg-emerald-100` icon tile
  with a single glyph (↓), a bold prompt line, and a muted instruction line. Fully keyboard
  operable: `role="button"`, `tabIndex`, Enter/Space opens the file picker.
- **FileTree** (`components/FileTree.tsx`). `rounded-2xl border border-stone-200`, a
  `bg-stone-50` header row with uppercase `stone-500` column labels (File / Size / a
  screen-reader-only Action label), rows divided by `divide-stone-100`, filename truncates with a
  `title` tooltip, size is `tabular-nums text-stone-500`, and each row ends in a secondary
  "Download" button. Rows also select a file for preview and expose that action to keyboards as a
  real button with an `aria-pressed` state. The list is capped at `max-h-96` with `overflow-auto`,
  so a large archive scrolls inside the tree rather than growing the page.
- **FilePreview** (`components/FilePreview.tsx`). An inline card beside the FileTree at desktop
  widths and below it on narrow screens. It always shows the selected path, human-readable size,
  and derived type. UTF text is decoded from a bounded 256 KB prefix; supported images use a
  short-lived local blob URL and a 10 MB render cap. Binary, oversized, and browser-rejected
  images show a clear no-preview state while retaining the per-file Download action.
- **Progress** (`components/Progress.tsx`). `h-2 rounded-full bg-emerald-100` track holding a
  fixed `w-1/3` `bg-emerald-600` fill that pulses via `animate-pulse`. There is no determinate
  percentage shown, extraction is fast enough that an indeterminate pulse reads honestly.
- **Card / section surfaces.** Plain `rounded-3xl border border-stone-200 bg-white p-8` for the
  extracting and ready states; the error state swaps to `border-red-200 bg-red-50`.
- **Pill / badge.** The signature "100% offline" pill: `rounded-full border-emerald-200 bg-white
  px-3 py-1.5 text-xs font-semibold text-emerald-800`. The mocks extend this family with a
  "Ready" badge (emerald outline), a "Fast follow" badge (neutral stone outline), and a "Pro"
  badge (solid emerald-700 fill, white text) for anything gated behind the one-time unlock.
- **Trust-chip footer.** A centered row of four short claims in `text-xs text-stone-500`:
  "No uploads · No account · No permissions · No network." Present on every screen, mocks
  included.

## 3. Key screens and user flows

### 3.1 Home / tool picker - [`mocks/home.html`](mocks/home.html)

Entry point once the toolkit grows past a single tool. Same header treatment as the shipped app
(eyebrow, H1, lede, offline pill), followed by a responsive grid of tool cards: Unzip (flagship,
marked "Ready"), Create ZIP, Hash/checksum, Base64, and Split/merge as plain entries, TAR/GZ and
Metadata inspector marked "Fast follow," and RAR/7z shown locked with a "Pro" badge and a padlock
icon in place of the usual accent tile. Same trust-chip footer as every other screen.

### 3.2 Extract flow (the shipped Unzip tool, `entrypoints/app/App.tsx`)

Four states, driven by a single `status` value:

1. **Idle** - the Dropzone, described above.
2. **Extracting** - a card with "Opening `<name>`", the subtext "Validating and extracting
   safely…", a secondary Cancel button, and the Progress bar.
3. **Ready** - [`mocks/unzip.html`](mocks/unzip.html). Archive name, a bold
   "`{n}` files · `{size}`" heading, "Open another" (secondary) and "Download all" (primary)
   actions, the FileTree with an inline text/image preview panel, and a centered helper caption
   underneath explaining that "Download all" preserves folder names on both Chrome and Firefox.
4. **Error** - a red-50/red-200 card, red-950 heading ("This archive could not be opened"),
   red-800 body text with the specific reason, and a primary "Try another file" button that
   resets to idle.

### 3.3 Batch - [`mocks/batch.html`](mocks/batch.html)

A Pro-gated view for extracting several archives in one queue. An overall progress card shows
how many of the queued archives are done, an indeterminate Progress bar for the batch as a whole,
and a Cancel button that stops the remaining queue (already-extracted files are kept). Below it,
each queued archive gets one row with three possible states: Done (a small emerald check), a
per-item "Extracting…" with its own compact progress bar, or Queued (muted, waiting its turn).
A primary "Download all (.zip)" action bundles everything extracted so far into one archive. The
batch header carries a small "Pro" badge to mark this as a paid capability layered on the same
visual language as the free flow, not a different product.

### 3.4 Settings and Pro - [`mocks/settings-pro.html`](mocks/settings-pro.html)

Two stacked cards. The Settings card holds two toggles ("Preserve folder paths on download,"
"Confirm before extracting very large archives"), a size-limit select tied to the second toggle,
and a note that appearance follows the system's light color scheme with no separate in-app theme
toggle. The Pro card explains the one-time unlock model: a short tagline, a plain checklist of
what Pro adds (RAR/7z, batch extract, encrypted-ZIP creation, save-to-folder), an "Unlock Pro"
primary button, an "Import license file" secondary button for the offline-license path, an
honest disclosure line that purchasing happens on an external store page while the app itself
never phones home, and a low-emphasis "Buy me a coffee" link styled with the same secondary
button treatment as the rest of the system (white background, stone-300 border) so it reads as a
real, optional action rather than a full-weight competing button.

## 4. State coverage for the flagship flow

| State | Trigger | What's shown |
| --- | --- | --- |
| Empty / idle | First load, or after "Open another" | Dropzone only |
| Loading / progress (+cancel) | A file was dropped/chosen | "Opening `<name>`" card, Cancel button, indeterminate Progress bar |
| Success / ready | Extraction completed | File count + size heading, Open another / Download all, FileTree, helper caption |
| Error | Wrong file type or extraction failure | Red card, specific reason, "Try another file" |
| Disabled / blocked | Dropzone `disabled` prop, or an action mid-flight | Dropzone at `opacity-60` with `cursor-not-allowed`; buttons at `opacity-50` with `cursor-not-allowed` |

Batch extends this with two more granular states at the item level (per-item Extracting with its
own progress bar, and Queued), layered on top of the same overall card while individual rows
resolve to Done or, on failure, would carry the same error tone as the single-file flow (not
pictured in the current mock, called out as an open item below).

## 5. Accessibility and responsive notes

- Every button, link, and the dropzone gets a visible focus ring (`outline: 2px solid emerald-700`
  with a small offset) rather than relying on the browser default or removing it.
- The dropzone is a real `role="button"` with `tabIndex`, and Enter/Space activate it exactly
  like a click. The underlying `<input type="file">` stays `display: none` and out of the tab
  order on purpose (it is never meant to receive focus directly); the wrapping div carries all of
  the interactive semantics and forwards activation to the input via ref.
- Home's tool cards and the settings toggles are real `<a>` and `<button>` elements rather than
  styled `<div>`/`<span>`, so they land in the tab order and carry their native semantics for free
  instead of needing hand-rolled keyboard handling.
- FileTree's action column has a screen-reader-only "Action" label since the visible header only
  needs File/Size; each row's Download button already carries the accessible name it needs
  ("Download") because it sits next to the filename in reading order.
- Each file row exposes a native Preview button with `aria-pressed` and `aria-controls`; selection
  is not communicated by the emerald row background alone. The preview panel has a named landmark
  and a keyboard-operable Close action.
- Toggles in the settings mock use `role="switch"` with `aria-checked` and an explicit
  `aria-label`, so their state is announced without relying on color alone.
- Tab order follows visual order top to bottom, left to right on every screen: header content
  first, then primary content, then footer chips last (chips are not interactive).
- The only animation in the system (the progress-bar pulse) is wrapped in
  `@media (prefers-reduced-motion: reduce)` in the mocks' CSS and disabled entirely for users who
  ask for it. The shipped `Progress` component does not yet carry that guard (see section 6);
  the mocks show the intended end state.
- `body { min-width: 320px; }` is a hard floor carried from the shipped app; the mocks keep the
  same floor and reflow the header (offline pill hides below `640px`, wrapping the tool grid down
  to one column) rather than truncating content.
- `<meta name="color-scheme" content="light">` is set explicitly on every screen, including the
  four mocks, so no OS dark-mode override can silently invert the shipped palette (see section 6).

## 6. Open questions / risks

**Dark theme vs. shipped light theme.** The top-level planning brief asked for a "dark theme" for
these mocks ("Match the existing dark theme + emerald accent + '100% offline' badge"). That
instruction does not match what is actually shipped: `entrypoints/app/App.tsx` renders on
`bg-[radial-gradient(circle_at_top_left,#e5f5e7,transparent_35%),#f8faf6]` with `text-stone-950`
headings and `text-stone-600` body copy, `assets/tailwind.css` sets root `color: #172217;
background: #f7faf5`, and `entrypoints/app/index.html` pins
`<meta name="color-scheme" content="light">`. There is no dark palette anywhere in the shipped
code. Per the same brief's governing instruction that this work be "consistent with what's
already shipped, not a redesign," these four mocks and this design system deliberately follow the
shipped **light**, warm-neutral, emerald-accented theme instead of introducing a dark theme that
does not exist in the product. Flagging this explicitly so it is a recorded decision rather than
a silent deviation from the brief.

A future dark-mode variant is a reasonable fast-follow (`prefers-color-scheme` media query plus a
second token set), but it is out of scope for v1 and would need its own pass to keep the emerald
accent legible on a dark surface (the current emerald-700/800 pairing is tuned for contrast
against white and light stone, not against a dark background).

Smaller open items:

- The batch mock does not show a per-item error state (one archive in the queue failing while
  others continue). It should reuse the same red-50/red-200/red-950/red-800 tokens as the
  single-file error card, scoped to that one row, rather than inventing a new error treatment.
- The Pro "size-limit" control in the settings mock is illustrated as a plain `<select>`; whether
  the shipped implementation uses a select, a slider, or stepped buttons is an implementation
  decision, not a visual one, and can be made later without touching the token set.
- The shipped `components/Progress.tsx` uses Tailwind's `animate-pulse` utility, which has no
  built-in `prefers-reduced-motion` handling. The mocks demonstrate wrapping that animation in a
  reduced-motion media query; carrying the same guard back into the shipped component is a small,
  low-risk follow-up rather than a design change.
