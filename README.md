# career-ops-web

A premium web dashboard for the [career-ops](https://github.com/santifer/career-ops)
AI job-search pipeline: Kanban board over your application tracker, evaluation
report viewer, follow-up calendar, analytics, discovery inbox, and LinkedIn
outreach tracking — all reading and writing the same plain files the career-ops
CLI uses, through the same code paths.

Built with Next.js (App Router), TypeScript strict, Tailwind v4, shadcn/ui,
dnd-kit, TanStack Query, and Recharts. Dark theme by default, WCAG AA in both
themes, fully keyboard-operable (including drag and drop).

## Two ways to run it

### 1. Run locally against your career-ops repo (private daily tool)

Requirements: Node ≥ 20, pnpm, and a [career-ops](https://github.com/santifer/career-ops)
data repo somewhere on the same machine.

```bash
pnpm install
cp .env.example .env.local
# edit .env.local:
#   CAREER_OPS_PATH=/absolute/path/to/your/career-ops
pnpm dev
```

Open http://localhost:3000. The dashboard reads `data/applications.md`,
`reports/*.md`, `data/follow-ups.md`, `data/pipeline.md`,
`data/scan-history.tsv`, and `output/*.pdf` from your repo — and shells the
repo's own scripts (`analyze-patterns.mjs`, `followup-cadence.mjs`, …) for
every derived number, so the dashboard can never contradict the CLI.

**What it writes (and nothing else):** the tracker's Status and Notes cells
(single-cell, locked, verified writes), append-only follow-up pins/logs, and
`data/outreach.yml`. Set `READ_ONLY=true` to disable all mutations.

### 2. Deploy your own demo (public portfolio piece)

The public demo serves an entirely fictional fixture dataset from `fixtures/`
— ~30 invented applications, 8 full evaluation reports, dynamic follow-ups,
outreach contacts, and generated placeholder PDFs. It is fully interactive:
drags, notes, reschedules, and outreach edits work in-memory per server
instance and reset on restart. **No real data is involved at any point.**

Steps (Vercel):

1. Fork/push this repo to your Git provider.
2. Create a Vercel project from it (framework preset: Next.js — zero config,
   no `vercel.json` needed).
3. Set ONE environment variable: `DEMO_MODE=true`.
4. Deploy. That's it.

Or from the CLI: `vercel --prod` after `vercel env add DEMO_MODE` (value
`true`, all environments).

There is no step where your data could leak, structurally:

## Privacy model

- **Build-time gate** — `next.config.ts` refuses to build when `VERCEL` is set
  and `DEMO_MODE` isn't: deploying real data is impossible, not just
  discouraged. CI proves the gate trips on every run.
- **Fixtures are the only data in this repo.** Everything under `fixtures/` is
  fictional (invented companies, people, URLs, salaries); a test proves zero
  overlap with the real tracker when the private repo is available locally.
- **CI privacy guard** — `scripts/privacy-guard.mjs` hashes every token in
  every committed file and compares against `scripts/privacy-blocklist.json`,
  which contains only sha256 hashes of sensitive tokens (identity + private
  tracker companies), generated locally by
  `scripts/generate-privacy-blocklist.mjs`. The blocklist leaks nothing; the
  guard still catches verbatim leaks. Regenerate it whenever your tracker
  gains new companies:
  `CAREER_OPS_PATH=… node scripts/generate-privacy-blocklist.mjs`.
- `.env.local`, real-data test snapshots (`tests/fixtures/real/`), and copied
  parser modules are gitignored.

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Dev server (real repo via `CAREER_OPS_PATH`, or `DEMO_MODE=true`) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` / `pnpm lint` | TS strict / ESLint |
| `pnpm test` | Vitest unit + golden tests (repo-dependent suites skip without `CAREER_OPS_PATH`) |
| `pnpm e2e` | Playwright demo-mode e2e + axe-core WCAG scans (dark & light) |
| `pnpm privacy-guard` | Scan committed files against the hashed blocklist |

## Testing

- **Write-back safety first:** golden-file tests assert byte-identical
  trackers except the one edited cell; every write is locked (same lock-dir
  protocol as the CLI), backed up, atomically renamed, and gated by
  `verify-pipeline.mjs`.
- **223 unit tests** (Vitest) + **47 e2e tests** (Playwright, demo mode):
  board rendering, mouse + keyboard drag, mobile action sheet, notes save,
  follow-up reschedule/log, URL filters, detail drawer, outreach stepper, and
  axe-core WCAG 2.x A/AA scans of every screen in both themes.
- CI (GitHub Actions) runs: privacy guard → typecheck → lint → unit tests →
  deploy-guard trip test → demo build → e2e.
