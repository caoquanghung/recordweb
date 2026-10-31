# Studio styles

`StudioShell.module.css` is the CSS Modules entrypoint and class-name facade.
Components keep their existing `styles.*` imports. It contains only `composes`
aliases; edit visual declarations in the module that owns the UI:

| Module | Responsibility |
| --- | --- |
| `StudioLayout.module.css` | Theme tokens, workspace/grid layout, navigation reveal, Standard Studio viewport |
| `StudioChrome.module.css` | Header, branding, toolbar, session bar and notices |
| `StudioSourcesPanel.module.css` | Source rail, device/Slides connection cards and source settings; also shared by Presentation sources |
| `StudioEffectsPanel.module.css` | Camera/audio/preset controls and effects rail |
| `StudioStage.module.css` | Preview, compositor canvas, idle mock, camera mock and countdown |
| `PresentationStage.module.css` | Presentation surface, PDF interaction layers, webcam/cursor and slide controls |
| `StudioRecordingControls.module.css` | Recording dock, timer, recording/media buttons and shared pulse animations |
| `StudioInputs.module.css` | Shared field labels, selects, text inputs, segmented controls and source messages |
| `StudioPrimitives.module.css` | Shared icons, status dots and screen-reader-only text |

Each module keeps its base rules, light/dark styles, responsive rules and Standard
Studio overrides in their original relative order. This refactor intentionally
does not redesign or consolidate those overrides.

## Why the facade matters

CSS Modules assigns a different identity to `.studioScreen` in each file. Existing
selectors such as `.studioScreen .standardGrid .controlDock` need the same logical
ancestor across components. The facade composes every participating identity into
one exported class string, preserving those relationships without global classes,
DOM changes, or JavaScript styling logic.

- For an existing style, edit its owning module.
- For a new class, add its `composes` export to the facade.
- When referencing an existing class from another module in a selector, add that
  module's identity to the corresponding facade export too. This includes shared
  primitives such as `.icon` and ancestor classes such as `.standardGrid`.
- Keep component imports pointed at the facade; importing a leaf module directly
  omits the additional identities required by contextual selectors.
- Do not add `@import` to the facade: composition already loads dependencies, and
  combining both mechanisms duplicates CSS in Turbopack output. Do not use the
  deprecated `@value` syntax.
- Keep animation declarations and their keyframes in the recording-controls
  module so CSS Modules scopes their names together.

## Verification

Run `node --test tests/unit/studio-styles.test.mjs`, `npm run lint` and
`npm run build`. The contract test catches missing composed identities that would
otherwise silently break cross-component selectors.

The initial extraction was checked against the original 553 selector/context
entries and 167 exported classes. An isolated Chromium fixture compared computed
styles and element geometry across Standard/Presentation, light/dark, widths
1600/1100/760/390 and setup/ready/countdown/recording/hidden-panel states. This
checks CSS behavior; it does not exercise real media devices or cloud requests.
