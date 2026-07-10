import type { DemoReport } from "./types";

/**
 * 8 full fictional English evaluation reports — same structural dialect as the
 * real reports (header key-values, `## Machine Summary` fenced YAML, Blocks
 * A–G, `## Score Global` table) so the REAL parser (`lib/parsers/report.ts`)
 * runs over them unchanged, and every detail/analytics/facet surface lights up
 * in demo mode. All companies, people, URLs, and salary numbers are invented.
 *
 * The candidate persona in these reports is itself fictional ("a mid-level
 * frontend engineer with a motion-design portfolio") — no real CV content.
 */

const R001 = `# Evaluation: Nimbus Labs — Design Engineer

**Date:** 2026-06-02
**Archetype:** Design Engineer (UI/Motion)
**Score:** 4.4/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-06-02)
**URL:** https://boards.greenhouse.io/nimbuslabs/jobs/5012345
**PDF:** output/demo-cv-nimbus-labs.pdf

---

## Machine Summary

\`\`\`yaml
company: "Nimbus Labs"
role: "Design Engineer"
location: "Remote (EU)"
comp: "€58–72K + equity"
score: 4.4
legitimacy_tier: "High Confidence"
archetype: "Design Engineer (UI/Motion)"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "Three.js listed as nice-to-have — only basic WebGL exposure documented"
  - "Design-tool fluency (Figma plugins) mentioned but not required"
top_strengths:
  - "Motion-first component work in production (spring physics, orchestrated transitions)"
  - "Owns a public component playground with 40+ interactive demos"
  - "React + TypeScript + Tailwind exactly matches the posted stack"
  - "Remote-EU friendly — no visa friction"
risk_level: "Low"
confidence: "High"
next_action: "Apply via Greenhouse with the motion-focused CV and the playground link front and center"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Design Engineer (UI/Motion) |
| **Domain** | Collaboration software — real-time whiteboard product |
| **Seniority** | Mid-level (2–4 years) |
| **Remote** | Remote-first within the EU, quarterly on-sites |
| **Team** | 6-person product-surface squad, dedicated design partner |
| **TL;DR** | Nimbus Labs wants an engineer who treats interaction quality as a feature: micro-interactions, canvas performance, and a component library used across the whiteboard surface. Stack: React, TypeScript, Tailwind, Framer Motion. |

The JD reads like it was written by the team that will do the interviewing: it names concrete surfaces (pointer presence, board transitions, toolbars), lists the exact libraries in production, and describes a portfolio review as the first technical step — a strong signal that craft is genuinely valued rather than aspirational.

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript (required) | ✅ Strong | Production experience across two roles |
| Motion / interaction design (required) | ✅ Strong | Public playground + shipped spring-based transitions |
| Tailwind (required) | ✅ | Used in the last two projects |
| Framer Motion (required) | ✅ | Documented in the portfolio pieces |
| Canvas / WebGL performance (nice-to-have) | ⚠️ Partial | Basic WebGL exposure only — name it honestly |
| Design-tool fluency (nice-to-have) | ⚠️ Partial | Consumer of Figma files, not a plugin author |

**Gap strategy:** the two partial matches are both nice-to-haves. Lead with the playground (it answers the portfolio-review step directly), and frame WebGL as an active learning edge with one concrete demo in progress.

---

## C) Level & Strategy

The posting is explicitly mid-level and the compensation band confirms it. No down-level risk. The differentiator to press: most applicants will show component libraries; far fewer will show *motion systems* — easing scales, orchestration patterns, reduced-motion fallbacks. Position the candidacy around that.

---

## D) Compensation

| Reference | Range | Confidence |
|-----------|-------|------------|
| Posted band | €58–72K + equity | High (in the JD) |
| Market (remote EU, mid DE role) | €55–75K | Medium |
| Target | €62–70K | — |

Posted band brackets the target comfortably. Equity at a 60-person Series-B is meaningful but illiquid — negotiate base first.

---

## E) Personalization Plan

1. Reorder the CV skills line to "React · TypeScript · Framer Motion · Tailwind" — mirror the JD's own ordering.
2. Move the component playground to the first project slot with a one-line metric (40+ demos, source public).
3. Add a "reduced-motion & a11y" bullet to the motion project — the JD calls out accessibility twice.
4. Cover letter hook: their public changelog shipped a board-transition rework last month — reference it specifically.
5. Trim the backend project to one line; this role never touches it.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Portfolio review | 45 min | Walk the playground: one deep dive (orchestrated list transitions), one performance story |
| Technical pairing | 60 min | Build a micro-interaction live — practice narrating tradeoffs while coding |
| System round | 45 min | Design a component library versioning story for a canvas product |
| Values | 30 min | Craft-vs-shipping tension — have one story where you cut scope deliberately |

**Red-flag question to expect:** "Your WebGL is thin — this board is canvas-heavy." Answer with the honest partial + the in-progress demo + the transferable performance instincts (frame budgets, batching, profiling).

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

| Signal | Value | Evaluation |
|--------|-------|------------|
| Liveness | Active (Greenhouse API, 2026-06-02) | ✅ |
| JD specificity | Names real product surfaces and exact stack | ✅ |
| Salary transparency | Band posted in the JD | ✅ |
| Repost history | No prior sighting in scan history | ✅ |
| Process clarity | 4 stages with durations listed | ✅ |

No negative signals. The portfolio-review-first process is consistent with how this team publicly describes its hiring.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 4.5/5 | Stack and craft focus align almost exactly; only nice-to-have gaps |
| North Star alignment | 4.5/5 | Design Engineer is the primary target archetype |
| Compensation | 4.0/5 | Posted band brackets the target; equity is upside |
| Culture signals | 4.5/5 | Craft-forward JD, portfolio-first process, remote-EU native |
| Red flags | 0 | None identified |
| **Global** | **4.4/5** | **→ APPLY** |
`;

const R002 = `# Evaluation: Vectorline — Frontend Engineer, Platform

**Date:** 2026-06-03
**Archetype:** Frontend Engineer (React/Next.js)
**Score:** 3.8/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-06-03)
**URL:** https://boards.greenhouse.io/vectorline/jobs/5023456
**PDF:** output/demo-cv-vectorline.pdf

---

## Machine Summary

\`\`\`yaml
company: "Vectorline"
role: "Frontend Engineer, Platform"
location: "Amsterdam, Netherlands"
comp: "€60–75K (hybrid)"
score: 3.8
legitimacy_tier: "High Confidence"
archetype: "Frontend Engineer (React/Next.js)"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "Platform emphasis: build tooling and CI ownership are half the role"
  - "Monorepo tooling (Turborepo/Nx) not documented in the CV"
top_strengths:
  - "Deep React + TypeScript in product teams"
  - "Has shipped shared component infrastructure consumed by other teams"
  - "Comfortable owning developer-facing docs"
risk_level: "Medium"
confidence: "Medium"
next_action: "Apply, but ask early whether the split is closer to 70/30 platform/product"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Frontend Engineer (React/Next.js), platform-leaning |
| **Domain** | Logistics SaaS |
| **Seniority** | Mid-level |
| **Remote** | Hybrid Amsterdam (2 days office) |
| **TL;DR** | Frontend platform seat: shared component infra, build pipeline, DX for ~25 frontend engineers. Product work is secondary. |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript | ✅ Strong | Core competency |
| Shared component infra | ✅ | Built and versioned a cross-team UI kit |
| Build tooling (Vite/Turbopack) | ⚠️ Partial | Consumer, not owner |
| Monorepo tooling | ❌ Soft gap | Not documented — learnable, say so plainly |
| CI pipeline ownership | ⚠️ Partial | Contributed jobs, never owned the pipeline |

---

## C) Level & Strategy

Right level, wrong center of gravity: the posting is 50–70% platform work. If product craft is the goal, this is a detour — but the infra ownership story it would add is genuinely valuable. Recommend applying with eyes open and probing the split in the first call.

---

## D) Compensation

Posted €60–75K, hybrid Amsterdam. Above target at the midpoint. Relocation support mentioned but not detailed — clarify before the on-site round.

---

## E) Personalization Plan

1. Lead with the shared UI kit project — versioning, adoption metrics, migration guides.
2. Add the one CI contribution story to the second project.
3. Mention docs ownership explicitly; the JD lists "you write things down" as a value.
4. Do NOT oversell build-tooling depth — the pairing round will surface it.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Recruiter screen | 30 min | The platform/product split question |
| Technical | 60 min | Component API design + versioning tradeoffs |
| Platform round | 60 min | Be honest on monorepo gaps; bring migration-strategy thinking |

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

Active on the Greenhouse API, salary band posted, team named, no repost history. Standard mature-scaleup posting.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 3.5/5 | Strong core, real platform-tooling gaps |
| North Star alignment | 3.5/5 | Platform seat, product craft secondary |
| Compensation | 4.5/5 | Above target at midpoint |
| Culture signals | 4.0/5 | Docs-culture, sane hybrid policy |
| Red flags | 0 | None |
| **Global** | **3.8/5** | **→ APPLY (probe the role split early)** |
`;

const R004 = `# Evaluation: Helioscope — Product Engineer

**Date:** 2026-06-09
**Archetype:** Product Engineer
**Score:** 4.1/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-06-09)
**URL:** https://jobs.lever.co/helioscope/7a1b2c3d-demo
**PDF:** output/demo-cv-helioscope.pdf

---

## Machine Summary

\`\`\`yaml
company: "Helioscope"
role: "Product Engineer"
location: "Remote (EU)"
comp: "€64–80K + equity"
score: 4.1
legitimacy_tier: "High Confidence"
archetype: "Product Engineer"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "LLM-integration experience is prototype-level, not production"
top_strengths:
  - "End-to-end feature ownership across design, frontend, and API"
  - "Fast, pragmatic shipping style matches the stated culture"
  - "Remote-first EU with async-heavy workflow"
risk_level: "Low"
confidence: "High"
next_action: "Apply; prepare the AI-assist prototype as the interview case study"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Product Engineer (full-surface ownership) |
| **Domain** | AI-assisted research tooling |
| **Seniority** | Mid-level |
| **Remote** | Remote-first EU |
| **TL;DR** | Small product pods shipping user-facing AI features weekly; the JD explicitly wants "engineers who talk to users". |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript | ✅ Strong | — |
| Full feature ownership | ✅ Strong | Two documented zero-to-one features |
| API design (Node/tRPC-ish) | ✅ | Typed API routes in production |
| LLM feature integration | ⚠️ Partial | Prototype only — position as fast-moving edge |
| User-facing iteration habits | ✅ | User-call notes cited in a past project |

---

## C) Level & Strategy

Level is right and the product-pod model rewards exactly this profile's breadth. Strategy: emphasize speed-with-judgment stories over depth-in-one-layer stories.

---

## D) Compensation

Posted €64–80K + equity. Clearly above target. Ask about the equity refresh policy — early-stage grants here vest against an aggressive growth plan.

---

## E) Personalization Plan

1. Retitle the summary line to "Product Engineer" — mirror the JD.
2. Put the AI-assist prototype first with honest framing ("prototype, 200 users").
3. Add one sentence on async communication habits (they ask for writing samples).
4. Link the changelog-style project log — matches their weekly-shipping rhythm.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Founder screen | 30 min | Why this product space; one sharp user-empathy story |
| Product case | 60 min | Scope a feature from a user complaint — practice thinking aloud |
| Technical | 60 min | Full-stack pairing; typed API + optimistic UI |
| Team fit | 30 min | Async writing sample discussed |

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

Live on the Lever API, comp posted, founders public, product shipping visibly. No repost or ghost-job signals.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 4.0/5 | Breadth matches; LLM depth is the only partial |
| North Star alignment | 4.0/5 | Product ownership + AI surface |
| Compensation | 4.5/5 | Above target with equity upside |
| Culture signals | 4.5/5 | Async-first, user-contact culture, weekly shipping |
| Red flags | 0 | None |
| **Global** | **4.1/5** | **→ APPLY** |
`;

const R006 = `# Evaluation: Lumen Systems — Frontend Engineer, AI Tools

**Date:** 2026-06-16
**Archetype:** Frontend Engineer (React/Next.js)
**Score:** 3.9/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-06-16)
**URL:** https://boards.greenhouse.io/lumensystems/jobs/5045678
**PDF:** output/demo-cv-lumen-systems.pdf

---

## Machine Summary

\`\`\`yaml
company: "Lumen Systems"
role: "Frontend Engineer, AI Tools"
location: "Berlin, Germany"
comp: "€62–78K (hybrid)"
score: 3.9
legitimacy_tier: "High Confidence"
archetype: "Frontend Engineer (React/Next.js)"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "JD hints at a senior bar ('you have mentored engineers') despite the mid title"
  - "Streaming-UI patterns (token streams) not yet documented"
top_strengths:
  - "React + TypeScript core is exact"
  - "Data-heavy dashboard experience transfers to the eval-tooling surface"
risk_level: "Medium"
confidence: "Medium"
next_action: "Apply; address the seniority hint head-on in the cover note"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Frontend Engineer (React/Next.js) |
| **Domain** | ML evaluation tooling |
| **Seniority** | Mid title, senior-leaning body text |
| **Remote** | Hybrid Berlin (3 days office) |
| **TL;DR** | Internal-facing AI evaluation dashboards going external; streaming UIs, large tables, annotation flows. |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript | ✅ Strong | — |
| Data-dense UI (tables, virtualscroll) | ✅ | Dashboard project is directly relevant |
| Streaming/real-time UI | ⚠️ Partial | WebSocket exposure, no token-stream work |
| Mentoring | ❌ Soft gap | The JD's senior hint — name informal onboarding help honestly |

---

## C) Level & Strategy

The title/body mismatch is the main risk: the take-home may be calibrated senior. Worth the attempt given the stack fit, but treat as a stretch and don't over-invest.

---

## D) Compensation

Posted €62–78K hybrid Berlin. Above target; relocation not mentioned — must be asked in the first call.

---

## E) Personalization Plan

1. Surface the largest-table story (row virtualization, 50k rows) into the first bullet.
2. Add a streaming-adjacent line (live WebSocket updates) with honest scope.
3. Cover note: one paragraph naming the seniority hint and countering with shipped-scope evidence.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Screen | 30 min | Relocation/hybrid logistics + seniority calibration question |
| Take-home | ~4h | Expect a data-grid or annotation-flow exercise — timebox strictly |
| On-site loop | Half day | Performance profiling story; state management tradeoffs |

**Outcome note (post-hoc):** rejected after the take-home; feedback cited the seniority bar. The archetype fit was real — the level calibration was the miss, as flagged above.

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

Live posting, real product, salary posted. The only oddity — mid title with senior body — is a calibration smell, not a legitimacy one.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 4.0/5 | Stack exact; streaming + mentoring partials |
| North Star alignment | 4.0/5 | AI-tools surface, product-facing |
| Compensation | 4.0/5 | Above target, relocation unknown |
| Culture signals | 3.5/5 | Title/body mismatch suggests unsettled leveling |
| Red flags | 1 | Senior-bar hint in a mid posting |
| **Global** | **3.9/5** | **→ APPLY (stretch, timebox the take-home)** |
`;

const R012 = `# Evaluation: Halcyon Grid — Product Engineer, AI Console

**Date:** 2026-06-26
**Archetype:** Product Engineer
**Score:** 4.2/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-06-26)
**URL:** https://boards.greenhouse.io/halcyongrid/jobs/5067890
**PDF:** output/demo-cv-halcyon-grid.pdf

---

## Machine Summary

\`\`\`yaml
company: "Halcyon Grid"
role: "Product Engineer, AI Console"
location: "Remote (EU)"
comp: "€66–82K + equity"
score: 4.2
legitimacy_tier: "High Confidence"
archetype: "Product Engineer"
final_decision: "Apply"
hard_stops: []
soft_gaps:
  - "Observability-tooling domain knowledge is new"
top_strengths:
  - "Agent-console UI is a near-exact match for the dashboard + streaming portfolio pieces"
  - "React/Next.js/TypeScript production depth"
  - "Remote-EU, async-documented culture"
risk_level: "Low"
confidence: "High"
next_action: "Apply same week — best-fit posting of the current batch"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Product Engineer |
| **Domain** | AI agent observability — console for tracing and replaying agent runs |
| **Seniority** | Mid-level |
| **Remote** | Remote-first EU, async-heavy |
| **TL;DR** | Build the console developers live in: run traces, streaming timelines, diff views. The JD names Next.js App Router, Tailwind, and "taste for dense-but-calm UI". |

The product is a developer tool, which doubles the leverage of a strong portfolio: the interviewers are the users.

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| Next.js App Router + TypeScript | ✅ Strong | Current daily stack |
| Dense data UI (traces, timelines) | ✅ Strong | Dashboard portfolio piece is directly analogous |
| Streaming updates | ✅ | Live-updating views shipped |
| Design sensibility | ✅ | Motion/craft portfolio |
| Observability domain | ⚠️ Partial | New domain — learnable, and the JD says so itself |

---

## C) Level & Strategy

Exact level match. Strategy: treat the application as a product demo — the cover note should read like a crisp PR description, because that is the culture signal they screen for.

---

## D) Compensation

Posted €66–82K + equity, remote EU. Comfortably above target. Equity at Series A: ask for the option-pool percentage, not just the share count.

---

## E) Personalization Plan

1. Rename the dashboard project bullet to lead with "trace-style timeline UI".
2. Add the streaming-updates line with the concrete latency number.
3. Cover note structured as problem → approach → result, ≤150 words.
4. Link the component playground; their design lead follows craft accounts publicly.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Screen | 30 min | Why devtools; concise product-taste answers |
| Pairing | 90 min | Build a mini trace view from a JSON fixture — practice this exact shape |
| System | 60 min | Frontend architecture for streaming + virtualized timelines |
| Founder chat | 30 min | Their public writing on calm software — read it beforehand |

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

| Signal | Value | Evaluation |
|--------|-------|------------|
| Liveness | Active (Greenhouse API, 2026-06-26) | ✅ |
| Salary transparency | Band + equity posted | ✅ |
| JD specificity | Names surfaces, stack, and design values concretely | ✅ |
| Repost history | None | ✅ |

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 4.5/5 | Near-exact surface match; only domain knowledge is new |
| North Star alignment | 4.5/5 | Product Engineer on a developer-facing AI product |
| Compensation | 4.0/5 | Above target; equity details to verify |
| Culture signals | 4.5/5 | Async, documented, craft-conscious |
| Red flags | 0 | None |
| **Global** | **4.2/5** | **→ APPLY** |
`;

const R017 = `# Evaluation: Kestrel Works — Design Engineer

**Date:** 2026-06-29
**Archetype:** Design Engineer (UI/Motion)
**Score:** 3.6/5
**Legitimacy:** Medium Confidence
**Verification:** active (Playwright check 2026-06-29)
**URL:** https://jobs.lever.co/kestrelworks/9f8e7d6c-demo
**PDF:** output/demo-cv-kestrel-works.pdf

---

## Machine Summary

\`\`\`yaml
company: "Kestrel Works"
role: "Design Engineer"
location: "London, UK"
comp: "£55–70K (hybrid)"
score: 3.6
legitimacy_tier: "Medium Confidence"
archetype: "Design Engineer (UI/Motion)"
final_decision: "Apply with reservations"
hard_stops: []
soft_gaps:
  - "UK work authorization needs sponsorship — process exists but adds friction"
  - "Brand-marketing site work is ~40% of the role"
top_strengths:
  - "Motion and interaction portfolio matches the showcased work"
  - "The team publicly credits engineers on design awards"
risk_level: "Medium"
confidence: "Medium"
next_action: "Apply; raise visa sponsorship in the first call, not later"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Design Engineer (UI/Motion), marketing-site-leaning |
| **Domain** | Design agency-turned-product studio |
| **Seniority** | Mid-level |
| **Remote** | Hybrid London (2 days office) |
| **TL;DR** | Half product UI, half high-craft marketing pages. Award-focused culture; motion skills are the differentiator. |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| Motion / interaction craft | ✅ Strong | Portfolio directly matches their public work |
| React + TypeScript | ✅ | — |
| Marketing-page performance (LCP, CWV) | ✅ | Measured wins documented |
| CMS integration (headless) | ⚠️ Partial | One project, thin |
| UK work authorization | ❌ Friction | Sponsorship required — flagged as the main risk |

---

## C) Level & Strategy

Level fits. The 40% marketing-site share is the strategic question: excellent craft reps, weaker product-depth accumulation. Acceptable as a portfolio-building move.

---

## D) Compensation

£55–70K hybrid London — roughly on-target after currency and cost-of-living adjustment, not above it. Sponsorship cost may anchor them low; do not open the range discussion.

---

## E) Personalization Plan

1. Lead the portfolio section with the two most award-adjacent pieces.
2. Add Core Web Vitals numbers to the marketing-page bullet.
3. Mention timezone overlap and willingness for the hybrid pattern explicitly.

---

## F) Interview Plan

| Stage | Format | Prep focus |
|-------|--------|------------|
| Screen | 30 min | Visa question first; portfolio walk second |
| Craft review | 60 min | One piece, deep: decisions, discarded versions, motion system |
| Pairing | 60 min | Likely a scroll-linked animation exercise |

**Status note:** recruiter screen done; waiting on the team round.

---

## G) Posting Legitimacy

### Assessment: Medium Confidence ⚠️

| Signal | Value | Evaluation |
|--------|-------|------------|
| Liveness | Active (Playwright, 2026-06-29) | ✅ |
| Salary transparency | Band posted | ✅ |
| Repost history | Same title re-listed once in 60 days | ⚠️ Mild churn signal |
| Company footprint | Real studio, public client work | ✅ |

The single repost plus agency-to-product transition warrants the Medium tier — not a scam signal, a stability question.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 4.0/5 | Craft match is excellent |
| North Star alignment | 3.5/5 | Marketing-site share dilutes product depth |
| Compensation | 3.0/5 | On-target, not above; sponsorship anchor risk |
| Culture signals | 4.0/5 | Engineers credited on design work |
| Red flags | 1 | One repost in 60 days |
| **Global** | **3.6/5** | **→ APPLY (visa question first)** |
`;

const R023 = `# Evaluation: Summitline — Frontend Engineer, Editor Team

**Date:** 2026-07-02
**Archetype:** Frontend Engineer (React/Next.js)
**Score:** 3.4/5
**Legitimacy:** High Confidence
**Verification:** active (API liveness sweep 2026-07-02)
**URL:** https://jobs.ashbyhq.com/summitline/1a2b3c4d-demo
**PDF:** ❌

---

## Machine Summary

\`\`\`yaml
company: "Summitline"
role: "Frontend Engineer, Editor Team"
location: "New York, US"
comp: "$140–170K"
score: 3.4
legitimacy_tier: "High Confidence"
archetype: "Frontend Engineer (React/Next.js)"
final_decision: "Consider"
hard_stops:
  - "US work authorization required; the JD states no sponsorship at this level"
soft_gaps:
  - "CRDT / collaborative-editing experience expected, not documented"
top_strengths:
  - "Rich-text editing adjacency: shipped a structured-content editor UI"
  - "Strong TypeScript typing discipline — the team's stated bar"
risk_level: "High"
confidence: "Medium"
next_action: "Hold unless the sponsorship stance changes; keep on the watch list"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Frontend Engineer (React/Next.js), editor specialization |
| **Domain** | Knowledge-management SaaS |
| **Seniority** | Mid-level |
| **Remote** | NYC on-site-leaning hybrid |
| **TL;DR** | Editor-team seat: block editor, collaborative presence, CRDT sync layer owned by a sister team but consumed daily. |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript | ✅ Strong | — |
| Editor UI experience | ⚠️ Partial | Structured-content editor, not free-form blocks |
| CRDT familiarity | ❌ Gap | Conceptual only |
| US work authorization | ❌ Hard stop | No sponsorship at this level per the JD |

---

## C) Level & Strategy

The technical gaps are workable; the authorization stop is not. Strategy: do not apply now — track the company, revisit if a remote-EU or sponsored senior seat opens.

---

## D) Compensation

$140–170K NYC — strong on paper, irrelevant while the hard stop stands.

---

## E) Personalization Plan

Not applicable while on hold. If revisited: build one CRDT demo (shared todo with Yjs) to convert the gap into a talking point.

---

## F) Interview Plan

Deferred — no application planned at this time.

---

## G) Posting Legitimacy

### Assessment: High Confidence ✅

Active Ashby posting, comp posted, well-known product. The sponsorship line is explicit, which is honest and saves everyone time.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 3.5/5 | Editor adjacency real, CRDT gap real |
| North Star alignment | 4.0/5 | Deep frontend specialization — attractive |
| Compensation | 4.5/5 | Excellent band |
| Culture signals | 4.0/5 | Public engineering blog, high writing quality |
| Red flags | 1 | Hard stop: no sponsorship |
| **Global** | **3.4/5** | **→ HOLD (watch list)** |
`;

const R028 = `# Evaluation: Saltmarsh Analytics — Frontend Engineer, Dashboards

**Date:** 2026-07-04
**Archetype:** Frontend Engineer (React/Next.js)
**Score:** 2.8/5
**Legitimacy:** Medium Confidence
**Verification:** active (API liveness sweep 2026-07-04)
**URL:** https://jobs.ashbyhq.com/saltmarsh/5e6f7a8b-demo
**PDF:** output/demo-cv-saltmarsh.pdf

---

## Machine Summary

\`\`\`yaml
company: "Saltmarsh Analytics"
role: "Frontend Engineer, Dashboards"
location: "Boston, US"
comp: "$125–150K"
score: 2.8
legitimacy_tier: "Medium Confidence"
archetype: "Frontend Engineer (React/Next.js)"
final_decision: "Skip unless desperate for reps"
hard_stops: []
soft_gaps:
  - "Deep D3 expected (custom scales, canvas rendering) — only chart-library depth documented"
  - "Python notebook integration listed as required"
  - "US timezone overlap of 6h expected from EU"
top_strengths:
  - "Dashboard product experience"
  - "Data-heavy UI performance stories"
risk_level: "High"
confidence: "Medium"
next_action: "Applied against the recommendation for pipeline volume — treat any response as upside"
\`\`\`

---

## A) Role Summary

| Field | Detail |
|-------|--------|
| **Detected archetype** | Frontend Engineer, data-viz specialized |
| **Domain** | BI / analytics SaaS |
| **Seniority** | Mid-to-senior blur |
| **Remote** | Remote US-hours; EU tolerated "for the right candidate" |
| **TL;DR** | Custom D3 charting at canvas level plus notebook-embedding work. The stack ask is deeper than the title implies. |

---

## B) CV Match

| JD requirement | Match | Comment |
|----------------|-------|---------|
| React + TypeScript | ✅ | — |
| Custom D3 (scales, canvas) | ❌ Gap | Chart-library work only (Recharts-level) |
| Python notebooks | ❌ Gap | Not documented |
| Dashboard UX | ✅ | Genuine strength |
| US-hours overlap | ⚠️ Friction | 6h overlap from CET is punishing |

---

## C) Level & Strategy

Two required-skill gaps plus a timezone friction: the honest read is below the apply threshold. This went out anyway during a volume push — the outcome (screen-stage rejection citing D3 + notebooks) matched the prediction exactly. Lesson recorded in patterns.

---

## D) Compensation

$125–150K remote-US. Good band; not the point given the gaps.

---

## E) Personalization Plan

Was minimal by design — one CV variant emphasizing dashboard performance. Deeper tailoring would not have closed required-skill gaps.

---

## F) Interview Plan

Did not reach interviews. Screening feedback: "looking for hands-on D3 at the canvas level and notebook tooling experience."

---

## G) Posting Legitimacy

### Assessment: Medium Confidence ⚠️

Active posting and a real product, but the JD mixes two roles (viz specialist + tooling integrator) and the "EU tolerated" remote line reads like an unsettled policy. Legitimate company, fuzzy req.

---

## Score Global

| Dimension | Score | Comment |
|-----------|-------|---------|
| CV match | 2.5/5 | Two required-skill gaps |
| North Star alignment | 3.0/5 | Data-viz depth is adjacent, not core |
| Compensation | 4.0/5 | Solid band |
| Culture signals | 3.0/5 | Mixed-role req, unsettled remote policy |
| Red flags | 2 | Below-threshold application; timezone friction |
| **Global** | **2.8/5** | **→ SKIP (applied anyway — logged as a pattern lesson)** |
`;

export const DEMO_REPORTS: DemoReport[] = [
  { num: 1, path: "reports/001-nimbus-labs-2026-06-02.md", content: R001 },
  { num: 2, path: "reports/002-vectorline-2026-06-03.md", content: R002 },
  { num: 4, path: "reports/004-helioscope-2026-06-09.md", content: R004 },
  { num: 6, path: "reports/006-lumen-systems-2026-06-16.md", content: R006 },
  { num: 12, path: "reports/012-halcyon-grid-2026-06-26.md", content: R012 },
  { num: 17, path: "reports/017-kestrel-works-2026-06-29.md", content: R017 },
  { num: 23, path: "reports/023-summitline-2026-07-02.md", content: R023 },
  { num: 28, path: "reports/028-saltmarsh-analytics-2026-07-04.md", content: R028 },
];
