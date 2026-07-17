# career-ops-web

> A premium web dashboard for the [career-ops](https://github.com/santifer/career-ops)
> AI job-search pipeline — a Kanban board, evaluation-report viewer, follow-up
> calendar, analytics, discovery inbox, and LinkedIn outreach tracker that read
> and write the **same plain files the CLI uses, through the same code paths**.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)
![Tests](https://img.shields.io/badge/tests-223%20unit%20%2B%2047%20e2e-brightgreen)
![a11y](https://img.shields.io/badge/WCAG-AA-success)

**🔗 Live demo:** <https://career-ops-web-plum.vercel.app/> · **📦 Companion CLI:** [career-ops](https://github.com/santifer/career-ops)

<!-- Add 2–3 screenshots or a short GIF here — the board, a report, the analytics view.
     Drop images in docs/screenshots/ and reference them:
     ![Board](docs/screenshots/board.png) -->

---

## Highlights

- **Privacy by construction, not by discipline.** A build-time gate makes it
  *impossible* to deploy real data; a hashed-blocklist CI guard catches any
  verbatim leak in committed files. The public demo runs on entirely fictional
  fixtures — no real data exists in the repo. ([details](#privacy-model))
- **The demo runs the real code.** The 8 fictional evaluation reports are parsed
  by the *actual* production parser and analytics is *derived* from fixtures at
  request time — zero hand-written numbers, so the demo can never drift from the
  real app's behaviour.
- **Embedded AI agent with hard guardrails.** A conversational assistant (Claude
  Agent SDK) operates on your repo with confirmed, diff-previewed mutations and
  guardrails that refuse `git push`, `rm -rf`, `sudo` and out-of-repo writes
  even in autonomous mode. ([details](#embedded-assistant-local-only))
- **Safety-first write-back.** Every edit is a single locked, backed-up,
  atomically-renamed, verify-gated cell write — golden-file tests assert the
  tracker is byte-identical except the one changed cell.
- **Accessible & polished.** Dark theme by default, WCAG AA in both themes,
  fully keyboard-operable including drag-and-drop, axe-core-scanned on every
  screen.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript strict**,
**Tailwind v4**, **shadcn/ui**, **dnd-kit**, **TanStack Query**, and **Recharts**.

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

## Embedded assistant (local only)

A conversational agent — powered by the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) — lives in a
floating bubble on every page and full-screen at `/assistant`. It operates
directly on your career-ops repo (`cwd = CAREER_OPS_PATH`): ask about your
pipeline, have it edit `config/profile.yml`, run CLI modes, or commit locally.

- **Strictly local.** Enabled only with a real `CAREER_OPS_PATH`, never in
  `DEMO_MODE` or on a Vercel build (`ASSISTANT_ENABLED=false` force-disables
  it). Auth reuses your Claude Code login (`claude login`), or
  `ANTHROPIC_API_KEY` if set — no key is ever entered in the app.
- **Every mutation is confirmed.** Write/Edit show a diff card, Bash shows the
  command; approve once or for the whole conversation. An optional
  **autonomous mode** (per conversation, clear banner) skips confirmations.
- **Hard guardrails, even in autonomous mode:** file writes are confined to
  the repo; `git push`, `sudo`, `rm -rf`, piping downloads into a shell and
  out-of-repo redirects are refused before they run (`lib/assistant/guardrails.ts`,
  unit-tested). `git commit` is allowed — with confirmation. `READ_ONLY=true`
  removes all mutating tools.
- **Transparent & persistent.** Every tool call lands in a collapsible action
  journal; conversations are stored in the gitignored `.assistant/` folder
  with resume, rename and delete. After an approved edit the dashboard
  refreshes itself (query invalidation).
- **Tunable.** Model (Opus 4.8 default), reasoning effort and the default
  autonomy for new chats are adjustable from the ⚙ settings popover.

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
