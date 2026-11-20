# Register PDF dependencies

Self-hosted browser distributions, pinned for reproducible exports; no runtime CDN.

- pdf-lib 1.17.1 — MIT, Andrew Dillon. Included licence.
- @pdf-lib/fontkit 1.1.1 — MIT, Devon Govett / pdf-lib contributors. Upstream README includes licence declaration; source https://github.com/Hopding/fontkit . Distribution includes fontkit/restructure/unicode shaping and pako code. Review upstream notices before production release.
- Noto Sans Regular — SIL Open Font License 1.1, The Noto Project Authors. Included licence; unmodified bundled LibreOffice font. Unsupported glyphs abort PDF export with a Print fallback rather than silently changing names.

The synthetic PDF regression exercises the exact vendored distributions. No code is fetched from an external service during customer-data rendering.
