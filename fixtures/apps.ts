import type { DemoApp } from "./types";

/**
 * ~30 fictional applications across ALL 8 canonical states. Every company,
 * role phrasing, note, and date is invented for the public demo — zero overlap
 * with any real tracker (proved by tests/demo-fixtures.test.ts when the real
 * repo is available locally).
 *
 * Constraints kept stable for existing tests:
 * - App #2 is "Vectorline / Frontend Engineer, Platform" (patch-route demo test).
 * - Apps #1 and #4 carry seeded outreach contacts (outreach-route demo test).
 */
export const DEMO_APPS: DemoApp[] = [
  { num: 1, date: "2026-06-02", company: "Nimbus Labs", role: "Design Engineer", score: 4.4, statusId: "interview", hasPdf: true, notes: "Exact archetype match — React/Tailwind/motion. Second-round interview scheduled.", reportPath: "reports/001-nimbus-labs-2026-06-02.md" },
  { num: 2, date: "2026-06-03", company: "Vectorline", role: "Frontend Engineer, Platform", score: 3.8, statusId: "applied", hasPdf: true, notes: "Strong stack overlap; platform emphasis is a slight mismatch.", reportPath: "reports/002-vectorline-2026-06-03.md" },
  { num: 3, date: "2026-06-05", company: "Acme Intelligence", role: "Senior Fullstack Engineer", score: 2.4, statusId: "skip", hasPdf: false, notes: "SKIP — 8+ years required plus heavy backend focus.", reportPath: null },
  { num: 4, date: "2026-06-09", company: "Helioscope", role: "Product Engineer", score: 4.1, statusId: "offer", hasPdf: true, notes: "Offer received — remote-first, AI product surface, strong craft culture.", reportPath: "reports/004-helioscope-2026-06-09.md" },
  { num: 5, date: "2026-06-12", company: "Quartzworks", role: "UI Engineer", score: 3.2, statusId: "evaluated", hasPdf: false, notes: "Borderline — good stack but design-system-only scope.", reportPath: null },
  { num: 6, date: "2026-06-16", company: "Lumen Systems", role: "Frontend Engineer, AI Tools", score: 3.9, statusId: "rejected", hasPdf: true, notes: "Rejected after take-home; feedback: seniority bar.", reportPath: "reports/006-lumen-systems-2026-06-16.md" },
  { num: 7, date: "2026-06-20", company: "Driftworks", role: "Design Engineer, Web", score: 3.5, statusId: "responded", hasPdf: true, notes: "Recruiter replied — screening call to book.", reportPath: null },
  { num: 8, date: "2026-06-24", company: "Parallax Digital", role: "Creative Developer", score: 2.9, statusId: "discarded", hasPdf: false, notes: "Posting closed before applying.", reportPath: null },
  { num: 9, date: "2026-06-25", company: "Meridian Labs", role: "Frontend Engineer (React)", score: 3.6, statusId: "evaluated", hasPdf: false, notes: "Solid React/TS fit; hybrid Rotterdam, relocation support unclear.", reportPath: null },
  { num: 10, date: "2026-06-25", company: "Quayside", role: "Design Engineer, Design Systems", score: 4.0, statusId: "applied", hasPdf: true, notes: "Applied with the motion-focused CV. Tokens + component API work, remote EU.", reportPath: null },
  { num: 11, date: "2026-06-26", company: "Copperleaf Systems", role: "Senior Backend Engineer", score: 1.8, statusId: "skip", hasPdf: false, notes: "SKIP — pure Go/Kafka backend, zero frontend surface.", reportPath: null },
  { num: 12, date: "2026-06-26", company: "Halcyon Grid", role: "Product Engineer, AI Console", score: 4.2, statusId: "applied", hasPdf: true, notes: "Applied — best score of the week. Agent console UI, React/Next.js, remote EU.", reportPath: "reports/012-halcyon-grid-2026-06-26.md" },
  { num: 13, date: "2026-06-27", company: "Brightgale", role: "Frontend Engineer", score: 3.3, statusId: "evaluated", hasPdf: false, notes: "Decent fit but Vue 3 shop; React experience discounted.", reportPath: null },
  { num: 14, date: "2026-06-27", company: "Windrose Software", role: "UI Engineer, Charts & Data Viz", score: 3.7, statusId: "responded", hasPdf: true, notes: "Hiring manager replied on the portfolio thread — call this week.", reportPath: null },
  { num: 15, date: "2026-06-28", company: "Tessellate Studio", role: "Creative Frontend Developer", score: 3.1, statusId: "evaluated", hasPdf: false, notes: "WebGL-heavy agency work; motion fit good, agency pace a concern.", reportPath: null },
  { num: 16, date: "2026-06-28", company: "Oakline Digital", role: "Frontend Engineer, Commerce", score: 2.7, statusId: "discarded", hasPdf: false, notes: "Discarded — posting re-listed twice, salary band below floor.", reportPath: null },
  { num: 17, date: "2026-06-29", company: "Kestrel Works", role: "Design Engineer", score: 3.6, statusId: "responded", hasPdf: true, notes: "Recruiter screening done; waiting on the team round.", reportPath: "reports/017-kestrel-works-2026-06-29.md" },
  { num: 18, date: "2026-06-29", company: "Bluewick", role: "Fullstack Engineer (Next.js)", score: 3.4, statusId: "evaluated", hasPdf: false, notes: "Next.js + Postgres, small team; equity-heavy comp to probe.", reportPath: null },
  { num: 19, date: "2026-06-30", company: "Fernwave", role: "Frontend Engineer, Growth", score: 2.8, statusId: "rejected", hasPdf: true, notes: "Auto-rejected in 48h — likely ATS keyword screen.", reportPath: null },
  { num: 20, date: "2026-06-30", company: "Arclight Tools", role: "Product Engineer", score: 3.9, statusId: "interview", hasPdf: true, notes: "First interview done — pairing round next. Devtools product, TS-native team.", reportPath: null },
  { num: 21, date: "2026-07-01", company: "Pinebox Systems", role: "Frontend Engineer (TypeScript)", score: 3.0, statusId: "evaluated", hasPdf: false, notes: "Internal tools focus; fine stack, low product surface.", reportPath: null },
  { num: 22, date: "2026-07-01", company: "Glasswing Tech", role: "Mobile Engineer (React Native)", score: 3.5, statusId: "applied", hasPdf: true, notes: "Applied — RN + Reanimated match, consumer app, Berlin hybrid.", reportPath: null },
  { num: 23, date: "2026-07-02", company: "Summitline", role: "Frontend Engineer, Editor Team", score: 3.4, statusId: "evaluated", hasPdf: false, notes: "Rich-text editor work — interesting but CRDT experience expected.", reportPath: "reports/023-summitline-2026-07-02.md" },
  { num: 24, date: "2026-07-02", company: "Rivermark", role: "Senior Design Engineer", score: 2.5, statusId: "skip", hasPdf: false, notes: "SKIP — staff-level scope (org-wide design platform), 7+ years.", reportPath: null },
  { num: 25, date: "2026-07-03", company: "Hollowbrook", role: "Frontend Engineer", score: 3.2, statusId: "evaluated", hasPdf: false, notes: "Fintech dashboard work; solid but on-site only, no relocation package.", reportPath: null },
  { num: 26, date: "2026-07-03", company: "Emberfield", role: "UI Engineer, Motion", score: 4.3, statusId: "interview", hasPdf: true, notes: "Motion-first product team — portfolio landed. Technical round scheduled.", reportPath: null },
  { num: 27, date: "2026-07-04", company: "Larkspur Digital", role: "Frontend Engineer, Accessibility", score: 3.8, statusId: "applied", hasPdf: true, notes: "Applied — a11y-focused role, strong values match, remote EU.", reportPath: null },
  { num: 28, date: "2026-07-04", company: "Saltmarsh Analytics", role: "Frontend Engineer, Dashboards", score: 2.8, statusId: "rejected", hasPdf: true, notes: "Rejected at screening — wanted deep D3 + Python notebooks.", reportPath: "reports/028-saltmarsh-analytics-2026-07-04.md" },
  { num: 29, date: "2026-07-05", company: "Violet Harbor", role: "Product Engineer, Onboarding", score: 3.5, statusId: "applied", hasPdf: true, notes: "Applied — growth-adjacent product work; funnel experiments in React.", reportPath: null },
  { num: 30, date: "2026-07-06", company: "Cinder Peak Software", role: "Design Engineer, Docs Platform", score: 3.7, statusId: "evaluated", hasPdf: false, notes: "Docs-as-product team; MDX pipeline + component library ownership.", reportPath: null },
];
