/**
 * Demo Discovery data — a pipeline inbox in the REAL data/pipeline.md dialect
 * (run through the real `parsePipeline`, one code path for demo + FS) and a
 * fictional scanner history. All companies and URLs are invented.
 */

export const DEMO_PIPELINE_MD = `# Pipeline — Pending URLs

## Pending
- [ ] https://boards.greenhouse.io/nimbuslabs/jobs/5099001 | Nimbus Labs | Design Engineer (Motion) | Remote EU | ⭐ exact archetype
- [ ] https://jobs.ashbyhq.com/bluewick/2b3c4d5e-demo | Bluewick | Product Engineer, Billing | Remote EU
- [ ] https://jobs.lever.co/emberfield/3c4d5e6f-demo | Emberfield | Senior UI Engineer | Lisbon/remote
- [ ] https://boards.greenhouse.io/windrose/jobs/5099004 | Windrose Software | Frontend Engineer, Maps | Munich, Germany

## Processed
- [x] #012 | https://boards.greenhouse.io/halcyongrid/jobs/5067890 | Halcyon Grid | Product Engineer, AI Console | 4.2/5 | PDF ✅
- [x] #023 | https://jobs.ashbyhq.com/summitline/1a2b3c4d-demo | Summitline | Frontend Engineer, Editor Team | 3.4/5
- [x] #028 | https://jobs.ashbyhq.com/saltmarsh/5e6f7a8b-demo | Saltmarsh Analytics | Frontend Engineer, Dashboards | 2.8/5 | PDF ✅
- [dup] https://boards.greenhouse.io/halcyongrid/jobs/5067891 | Halcyon Grid | Product Engineer (EU) | duplicate of #012
- [skip] Rivermark | Senior Design Engineer | SKIP — staff-level scope, 7+ years
- [skip] https://jobs.lever.co/copperleaf/4d5e6f7a-demo | Copperleaf Systems | Senior Backend Engineer | SKIP — no frontend surface
- [screened] Batch scan 2026-07-05: 14 offers screened out (US-only, agency contracts, or backend-heavy), list available on request.
`;

/** Fictional scanner dedup history rows (url / firstSeen / portal / title /
 * company / status / location — the scan-history.tsv column contract). */
export const DEMO_SCAN_HISTORY = [
  { url: "https://boards.greenhouse.io/nimbuslabs/jobs/5012345", firstSeen: "2026-06-01", portal: "greenhouse-api", title: "Design Engineer", company: "Nimbus Labs", status: "added", location: "Remote EU" },
  { url: "https://boards.greenhouse.io/nimbuslabs/jobs/5099001", firstSeen: "2026-07-03", portal: "greenhouse-api", title: "Design Engineer (Motion)", company: "Nimbus Labs", status: "added", location: "Remote EU" },
  { url: "https://boards.greenhouse.io/vectorline/jobs/5023456", firstSeen: "2026-06-02", portal: "greenhouse-api", title: "Frontend Engineer, Platform", company: "Vectorline", status: "added", location: "Amsterdam, Netherlands" },
  { url: "https://jobs.lever.co/helioscope/7a1b2c3d-demo", firstSeen: "2026-06-08", portal: "lever-api", title: "Product Engineer", company: "Helioscope", status: "added", location: "Remote (EU)" },
  { url: "https://boards.greenhouse.io/lumensystems/jobs/5045678", firstSeen: "2026-06-14", portal: "greenhouse-api", title: "Frontend Engineer, AI Tools", company: "Lumen Systems", status: "added", location: "Berlin, Germany" },
  { url: "https://boards.greenhouse.io/halcyongrid/jobs/5067890", firstSeen: "2026-06-25", portal: "greenhouse-api", title: "Product Engineer, AI Console", company: "Halcyon Grid", status: "added", location: "Remote (EU)" },
  { url: "https://jobs.lever.co/kestrelworks/9f8e7d6c-demo", firstSeen: "2026-06-28", portal: "lever-api", title: "Design Engineer", company: "Kestrel Works", status: "added", location: "London, UK" },
  { url: "https://jobs.ashbyhq.com/summitline/1a2b3c4d-demo", firstSeen: "2026-07-01", portal: "ashby-api", title: "Frontend Engineer, Editor Team", company: "Summitline", status: "added", location: "New York, US" },
  { url: "https://jobs.ashbyhq.com/saltmarsh/5e6f7a8b-demo", firstSeen: "2026-07-03", portal: "ashby-api", title: "Frontend Engineer, Dashboards", company: "Saltmarsh Analytics", status: "added", location: "Boston, US" },
  { url: "https://jobs.ashbyhq.com/bluewick/2b3c4d5e-demo", firstSeen: "2026-07-04", portal: "ashby-api", title: "Product Engineer, Billing", company: "Bluewick", status: "added", location: "Remote (EU)" },
  { url: "https://jobs.lever.co/emberfield/3c4d5e6f-demo", firstSeen: "2026-07-05", portal: "lever-api", title: "Senior UI Engineer", company: "Emberfield", status: "added", location: "Lisbon, Portugal" },
  { url: "https://boards.greenhouse.io/windrose/jobs/5099004", firstSeen: "2026-07-05", portal: "greenhouse-api", title: "Frontend Engineer, Maps", company: "Windrose Software", status: "added", location: "Munich, Germany" },
  { url: "https://boards.greenhouse.io/oakline/jobs/5088002", firstSeen: "2026-06-27", portal: "greenhouse-api", title: "Frontend Engineer, Commerce", company: "Oakline Digital", status: "skipped-title", location: "Remote US" },
  { url: "https://jobs.lever.co/tessellate/8c9d0e1f-demo", firstSeen: "2026-06-27", portal: "lever-api", title: "Creative Frontend Developer", company: "Tessellate Studio", status: "skipped-title", location: "Paris, France" },
];
