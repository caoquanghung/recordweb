# Component Sidebar — Figma reconstruction

## Source and target

- Figma file: `Record-UI`
- Selected node: `25:2615` (`Aside`), 288 × 1026 px
- Source URL: <https://www.figma.com/design/sl2QfWk1DTKZs7SN0wqT7R/Record-UI?node-id=25-2615&t=hYtapJzEqihy3Hal-4>
- Target route: `/component/sidebar`
- Reusable component: `src/components/app/AppSidebar.tsx`

## Evidence and hierarchy

The selected node is a white vertical aside with a right border and subtle shadow. Its hierarchy is:

1. Top container, 20 px padding
   - Brand row: 48 px blue mark, product title, subtitle, bottom divider
   - Navigation stack: four 52–54 px rows with 8 px gaps
2. Flexible empty region
3. Footer: slate-tinted background, top divider, 16 px horizontal padding
   - User card: avatar, name, organization label, sign-out action

The selected state in Figma is “Thư viện bài giảng”: `#eff6ff` background, `#bfdbfe` border, `#1e40af` text, and a 10 px blue status dot. The Figma node has no bound design variables. Measured values are therefore represented as component-scoped CSS custom properties and declarations.

## Typography and tokens

- Reference font: Be Vietnam Pro, weights 500/600/700. The implementation prefers it when locally available and falls back to the repository's existing Geist font; it does not add a Google Fonts build-time network dependency.
- Brand blue: `#1d4ed8`; active text: `#1e40af`
- Primary text: `#0f172a`; navigation text: `#475569`; secondary text: `#64748b`
- Borders: `#e2e8f0`; brand divider: `#f1f5f9`
- Corner radius: 12 px for brand, nav items, and profile card
- Exact vector assets were downloaded from the Figma context into `public/figma/sidebar/`.

## Component mapping

| Figma region | Implementation | Decision |
| --- | --- | --- |
| Aside | `AppSidebar` | New reusable navigation component |
| Brand | `AppSidebar` brand link | Links to `/dashboard` |
| Nav links | Typed `AppSidebarItem[]` | Route links or caller-supplied actions |
| Selected link | `usePathname()` / `activeHref` | Dynamic active state; override supported for previews |
| User card | Clerk `useUser()` and `useClerk().signOut()` | Reuses current authentication state |
| Target frame preview | `SidebarShowcase` | Demonstrates both layout behaviors |

## Interaction contract

- `behavior="fixed"`: sidebar is pinned to the left viewport edge; the consuming page/layout must reserve 288 px for content.
- `behavior="adaptive"`: sidebar is sticky in desktop layouts and becomes an off-canvas drawer below 840 px, with a menu trigger and dismissible backdrop.
- Each page or shared layout selects the behavior explicitly. The component does not infer behavior from route names.
- Active navigation is derived from the current pathname unless `activeHref` is supplied.
- Items can be links (`href`) or page-owned actions (`onSelect`). An action without a callback is disabled instead of pretending to navigate.

## Assumptions

- `/component/sidebar` is a component showcase route, not a replacement for existing application navigation.
- Existing routes were not migrated because the user did not yet identify which routes should use fixed versus adaptive behavior.
- The organization label is configurable because Clerk does not currently expose a matching department field in this UI.
- Be Vietnam Pro is not checked into this repository; Geist is the deterministic fallback until a licensed/self-hosted font asset is supplied.

## Visual acceptance criteria

- Sidebar is exactly 288 px wide and spans the viewport height.
- Brand, nav spacing, selected Library state, footer, and profile card match the selected Figma frame.
- At widths above 840 px, adaptive mode participates in the page layout; below it, content receives full width and the sidebar opens as a drawer.
- Keyboard focus is visible, the drawer has an accessible label/state, and reduced-motion preferences disable transitions.
