# HTML design contract

Applies to readme.html, decision artifacts, and future interface prototypes. Product-specific choices may extend it once the end user is known.

- Self-contained UTF-8 HTML, inline CSS/JavaScript, no CDN, tracking, remote fonts, or network requests. Set viewport and lang. Work from a local file.
- Palette: background #f4f5f0, paper #ffffff, ink #182c29, muted #526560, accent #146452, line #cbd7d0. Body system sans-serif; headings use the same stack. Max content width 1100px; 16px base font; generous spacing, 12px card radius.
- Clear hierarchy: purpose/status → summary → decisions or tasks → evidence/next step. Distinguish facts, recommendations, assumptions, and pending answers with text, not color alone.
- Responsive one/two-column grids that collapse below 720px. No fixed-width overflow. Semantic headings, fieldsets/legends, explicit labels, visible keyboard focus, adequate contrast, 44px action targets.
- Every question: stable ID, why it matters, meaningful options with benefits/costs and recommended default. Defaults are proposals; leave answer inputs blank. Add free text for edge cases.
- Prototype fidelity and scope must be labelled. Show relevant empty, failure, and success states once the workflow is known. Never present a prototype as a working integration.
- Decision forms export versioned JSON with question IDs and answers. Explain that download does not write repository files; answers become canonical only after explicit import/review by the agent. Do not insert user text via innerHTML.
- Readme and artifacts share these tokens. Changes to the visual language update this file before dependent HTML. Check layout, links, keyboard use, and export behavior before claiming visual verification.
