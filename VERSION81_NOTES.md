# Version 81 — Menu Stability Fix

## Fixed
- Removed overlapping click and pointer event handlers that could toggle the menu twice on iPhone.
- Removed the older scroll-restoration accordion logic that caused jumping and stuck sections.
- Replaced it with one menu controller and one accordion controller.
- Closing the menu now resets all open sections.
- Safari back/forward navigation now clears stale menu state.
- Improved touch behaviour and prevented the page behind the menu from scrolling.
- Forced fresh CSS and JavaScript caching for this release.

All V80 platform features remain included.
