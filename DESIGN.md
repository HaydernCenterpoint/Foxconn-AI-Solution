---
name: FII Cyber Industrial
colors:
  surface: 'rgba(15, 23, 42, 0.88)'
  surface-dim: 'rgba(15, 23, 42, 0.95)'
  surface-bright: 'rgba(30, 41, 59, 0.90)'
  surface-container-lowest: '#030712'
  surface-container-low: 'rgba(15, 23, 42, 0.50)'
  surface-container: 'rgba(15, 23, 42, 0.70)'
  surface-container-high: 'rgba(30, 41, 59, 0.75)'
  surface-container-highest: 'rgba(30, 41, 59, 0.90)'
  on-surface: '#FFFFFF'
  on-surface-variant: '#94A3B8'
  outline: 'rgba(56, 180, 255, 0.45)'
  outline-variant: 'rgba(56, 180, 255, 0.65)'
  primary: '#1C64F2'
  on-primary: '#FFFFFF'
  primary-container: 'rgba(28, 100, 242, 0.15)'
  secondary: '#D00B27'
  on-secondary: '#FFFFFF'
  error: '#D00B27'
  on-error: '#FFFFFF'
  background: '#050B14'
  on-background: '#FFFFFF'
  accent: '#20DFF3'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-bold:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  label-caps:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  stat-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
rounded:
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  unit: 0.2rem
  xs: 4.8px
  sm: 9.6px
  md: 19.2px
  lg: 28.8px
  xl: 38.4px
  '2xl': 57.6px
---

## 1. Visual Theme & Atmosphere

The **FII (Foxconn Industrial Internet) Cyber Industrial** design system utilizes a high-performance, futuristic SCADA/cyber-dashboard theme. It is designed specifically for displaying real-time machine telemetry, active alarm signals, and production lines configurations with absolute clarity and industrial precision. The visual language blends a strong corporate identity with a "command center" atmosphere: dark, semi-transparent panels layered over deep space backgrounds, glowing cyan accents, and rigid layout grids that evoke advanced automation control rooms.

The design system prioritizes high readability and low eye strain during long operator shifts. This is achieved by combining low-glare dark backgrounds with highly saturated functional status markers (Running, Idle, Warning, Fault). Interactive modules are wrapped in card components featuring a glowing cyan border and distinct corner brackets. The overall density is high but meticulously structured to maximize information bandwidth without compromising visual hierarchy.

## 2. Color Palette & Roles

The color palette is engineered functional-first, organizing colors by their system roles rather than simple hues.

### Primary Foundation
*   **Page Background:** `#050B14` (Deep Space Navy) — Low-glare dark page root background.
*   **Secondary/Sidebar Background:** `#0B1220` (Dark Steel Blue) — Secondary panel backdrop and navigation sidebar background.
*   **Surface Panels:** `rgba(15, 23, 42, 0.88)` (Translucent Dark Slate) — Main card container and widget background.
*   **Table Headers:** `#0B2142` (Dark Teal-Blue) — Background for table header rows.
*   **Low Containers:** `rgba(15, 23, 42, 0.50)` — Low priority container panels.

### Accent & Interactive
*   **Primary Accent/Interactive Text:** `#20DFF3` (Cyber Cyan) — Primary button text, glowing borders, active nav icons, active dropdown borders, and hover states.
*   **Primary Action Fill:** `#1C64F2` (Corporate FII Cobalt Blue) — Core branding color, used for primary actions, selected indicators, and badges.
*   **Primary Hover/Glow:** `#3F83F8` / `#3CE9F7` — High brightness hover states.
*   **Secondary Action Fill:** `#D00B27` (FII Crimson Red) — Reserved for critical actions, deletes, or emergency resets.

### Typography & Text Hierarchy
*   **Primary Text:** `#FFFFFF` or `#F8FAFC` (Solid White) — Highest hierarchy, used for primary values, headings, and active elements.
*   **Secondary Text:** `#94A3B8` (Cool Grey) — Labels, descriptions, inactive states, and unit dimensions.
*   **Muted Text:** `#64748B` / `#475569` — Disabled options and secondary context description labels.
*   **Border Outline:** `rgba(56, 180, 255, 0.45)` or `rgba(32, 198, 226, 0.25)` — Cyber outline border.

### Functional States (Status Colors)
*   **Running / Success / Optimal:** `#10B981` (Emerald Green) — Indicates healthy active machine status. Container bg: `rgba(16, 185, 129, 0.15)`.
*   **Warning / Attention Required:** `#F59E0B` (Amber Gold) — Highlights threshold alerts and warnings. Container bg: `rgba(245, 158, 11, 0.15)`.
*   **Error / Critical Fault:** `#D00B27` (Crimson Red) — Indicates machine failure or connection error. Container bg: `rgba(208, 11, 39, 0.15)`.
*   **Idle / Standby / Information:** `#3B82F6` (Electric Blue) — Machine waiting or polling. Container bg: `rgba(59, 130, 246, 0.15)`.
*   **Offline / Disconnected:** `#64748B` (Cool Slate) — Device uncommunicative. Container bg: `rgba(100, 116, 139, 0.15)`.
*   **Maintenance:** `#8B5CF6` (Amethest Purple) — Device in maintenance. Container bg: `rgba(139, 92, 246, 0.15)`.

---

## 3. Typography Rules

### Hierarchy & Weights
Typography utilizes a clean font pairing: **Outfit** and **Inter** for primary headings and body elements, and **Roboto Mono** for technical readouts, values, and memory registers.
*   **Heading 1 (Page Title):** `text-3xl font-extrabold text-on-surface` (`2.34375rem` / ~39px).
*   **Heading 2 (Section Title):** `text-base font-bold text-on-surface tracking-wide uppercase` (`1.25rem` / ~21px).
*   **Eyebrow / Label Caps:** `text-xs uppercase font-medium tracking-wider text-text-muted` (`0.9375rem` / ~15px).
*   **Body Text:** `text-sm font-normal text-on-surface` (`1.09375rem` / ~18px).
*   **Code / Registers:** `font-mono text-xs text-on-surface-variant` (`0.859375rem` / ~14px).
*   **Numeric Readings:** `font-mono text-2xl font-bold tabular-nums`.

### Spacing Principles
Spacing utilizes a strict 4.8px baseline unit (`--spacing: 0.2rem` on `16.8px` base font size), scaling as follows:
*   `--spacing-xs`: `4.8px`
*   `--spacing-sm`: `9.6px`
*   `--spacing-md`: `19.2px`
*   `--spacing-lg`: `28.8px`
*   `--spacing-xl`: `38.4px`
*   `--spacing-2xl`: `57.6px`

Headings and titles use tight tracking to emphasize visual density, while data lists use tabular alignment for numeric alignment.

---

## 4. Component Stylings

### Buttons
All buttons use uppercase text and a border radius of `4px` with a minimum touch height of `2.3rem` (`btn`).
*   **Primary Button (`.btn-primary`):** Solid `#20DFF3` (Cyber Cyan) fill with `#08162F` dark text. On hover, it brightens to `#3CE9F7` and emits a glowing shadow (`0 0 15px rgba(60, 233, 247, 0.45)`).
*   **Secondary Button (`.btn-secondary`):** Transparent background with `#20DFF3` border (`rgba(32, 198, 226, 0.5)`) and cyan text. Hover state adds a light cyan backdrop (`rgba(32, 198, 226, 0.15)`).
*   **Danger Button (`.btn-danger`):** Red tinted border/text (`#FF5C6C`). On hover, turns solid red with a red glow.
*   **Ghost Button (`.btn-ghost`):** Completely transparent, adding a subtle cyan wash on hover.

### Cards & Panels (Domain-Specific Containers)
Containers utilize two primary wrapper classes:
*   **Cyber Panel (`.panel` / `PanelFrame`):** Card with a translucent dark gradient background, border `rgba(32, 198, 226, 0.36)`, and **absolute-positioned corner bracket decorations** (`.panel::before`, `.panel::after`) that draw neon cyan L-brackets on the top-left and bottom-right edges.
*   **Flat Cyber Panel (`.panel-flat`):** A lighter border version (`rgba(32, 198, 226, 0.24)`) with smaller corner decorations.
*   **KPI StatCard:** Features a solid `3px` left-hand vertical bar color-coded to the metric status (Emerald for running, Gold for warn, Blue for idle, Crimson for error). Emits a subtle scale effect (`hover:scale-[1.01]`) and slide animation on hover.

### Navigation
*   **Topbar:** High header bar (`h-14`) with a translucent background (`#07142C` at 90% opacity) and blur backdrop filter. Features a corporate logo with an angled polygon clip-path (`clip-path: polygon(0 0, 100% 0, calc(100% - 20px) 100%, 0 100%)`). Integrates shift badges, online/offline blinking telemetry dots, language selectors, and a user profile dropdown with a glowing border (`border-[#20DFF3]/35`).
*   **Sidebar:** Left vertical bar spanning `64px` collapsed and `260px` when expanded. Leverages a smooth width transition. Uses a slightly darker blue background (`#0B1220`). Active links draw a distinct left vertical border indicator (`3px` primary) and a colored icon block.

### Inputs & Forms
*   **Field (`.field`):** Height of `2.75rem`, thin cyan border `rgba(32, 198, 226, 0.3)`, dark blue background (`rgba(8, 22, 47, 0.8)`). Placeholder text is `#64879D`.
*   **Focus state:** Border glows to solid `#20DFF3` and adds a cyan halo (`box-shadow: 0 0 8px rgba(32, 223, 243, 0.3)`).
*   **Select fields:** Leverages a customized svg dropdown arrow indicator and `padding-right: 2.75rem`.

### Domain-Specific Components
*   **Status Indicators / Badges:** Micro tags with colored backgrounds indicating live status.
*   **SCADA Flow Diagrams:** Features custom network node edges (e.g. `ButtonEdge`) utilizing custom SVGs and SVG path animations (`stroke-dasharray` and `animation`) to represent material flow direction.

---

## 5. Layout Principles

### Grid & Structure
*   **Shell:** Standard desktop application shell uses `h-[100dvh] w-full flex flex-col overflow-hidden`.
*   **Workspace:** Contains a fixed/hover-expanded Sidebar on the left and a main content viewport (`main class="flex-1 overflow-y-auto p-6" bg-background`) on the right.
*   **Grids:** Grid systems use multi-column systems (`grid grid-cols-1 lg:grid-cols-3 gap-6`) for dashboards.

### Whitespace Strategy
*   Section spacing is kept tight to maintain high informational density. Base gaps are `p-6` on main wrappers and `p-5` (`--spacing-xl`) for panel children.
*   Dividers (`.divider-line`) are thin lines of `1px` using `var(--color-outline-variant)`.

### Alignment & Visual Balance
*   Left alignment is standard for data labels and description properties.
*   Monospaced numbers are always right-aligned or set to tabular-nums to prevent visual shifts.
*   Form elements are stacked vertically in single columns or 2-column groups to ensure balanced tab-flows.

### Responsive Behavior & Touch
*   **Breakpoints:** Standard screen limits (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`).
*   **Sidebar Collapse:** Below `1280px`, the sidebar defaults to collapsed status (`64px`) and only expands temporarily on mouse hover.
*   **Form / Header Stacking:** Below `860px`, the main layout shifts html/body overflow to `auto` and stacks panel header options vertically instead of horizontally.

---

## 6. Light Theme Palette

For compatibility with light monitoring stations, the system supports a calibrated Light Theme triggered via `:root[data-theme='light']`.

*   **Page Background:** `#F8FAFC` (Slate Light Grey)
*   **Secondary Background:** `#F1F5F9` (Slate Cool Grey)
*   **Surface Panels:** `#FFFFFF` (Solid White)
*   **Borders:** `rgba(0, 45, 114, 0.15)` (Light Indigo Outline)
*   **Primary Text:** `#0F172A` (Dark Slate Text)
*   **Secondary Text:** `#475569` (Medium Cool Slate)
*   **Primary Accent/Interactive:** `#002D72` (Corporate Navy Blue)
*   **Primary Hover:** `#001C46`
*   **Secondary Accent:** `#D00B27` (FII Crimson Red)
*   **Secondary Hover:** `#A0081E`
*   **Status Containers:** Re-calibrated lower-opacity status containers (`rgba(..., 0.12)`) to ensure high text contrast on white surface backdrops.

---

## 7. Design System Notes for Stitch Generation

### Language to Use
*   Use terms like **"Cyber Industrial Dashboard"**, **"SCADA Telemetry Visualizer"**, **"Low-glare Command Center Theme"**, **"Futuristic Grid System"**, and **"Cyberpunk Control Room Board"**.
*   Describe borders as **"Glowing Cyber Cyan Brackets"** or **"Thin Cyan Outlines"**.
*   Specify surface colors as **"Dark Translucent Slate-Blue Panels"** and backgrounds as **"Deep space navy color fields"**.

### Color References
*   `primary`: `#1C64F2` (FII Cobalt Blue)
*   `accent`: `#20DFF3` (Cyber Cyan Glow)
*   `secondary` / `error`: `#D00B27` (FII Crimson Red)
*   `surface`: `rgba(15, 23, 42, 0.88)` (Dark Slate)
*   `background`: `#050B14` (Deep Space Background)

### Component Prompts
*   **Panel Container:** *"Create a translucent slate-blue panel with a thin cyber cyan border and L-shaped neon cyan corner decorations."*
*   **Stat Widget:** *"Design a KPI stat card featuring a bold tabular value, a 3px status colored left indicator border, and an icon block in the top-right."*
*   **Telemetry Table:** *"Render a data table with dark teal-blue sticky headers, cyan outline separators, and glowing status tags in the cells."*
