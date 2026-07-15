import type { ProfileDocument, ProfileTexts } from "@/lib/domain";

/**
 * Demo candidate profile — an invented persona used when DEMO_MODE=true. The
 * YAML mirrors the real `config/profile.yml` dialect so it flows through the
 * REAL `parseProfile` (one code path for demo + FS), and single-field edits go
 * through the REAL `setYamlScalar`, so demo and FS never drift.
 */
export const DEMO_PROFILE_YAML = `# Career-Ops Profile Configuration (demo persona — all invented)

candidate:
  full_name: "Robin Vale"
  email: "robin.vale.demo@example.com"
  phone: "+33 6 00 00 00 00"
  location: "Lyon, France"
  linkedin: "linkedin.com/in/robin-vale-demo"
  portfolio_url: "https://robinvale.example"
  github: "https://github.com/robinvale-demo"
  photo: ""

target_roles:
  primary:
    - "Frontend Engineer (React / Next.js)"
    - "Product Engineer (TypeScript / Node.js)"
    - "Design Engineer (UI / Motion)"
  archetypes:
    - name: "Frontend Engineer (React/Next.js)"
      level: "Mid"
      fit: "primary"
    - name: "Design Engineer (UI/Motion)"
      level: "Mid"
      fit: "primary"
    - name: "Product Engineer (TypeScript/Node.js)"
      level: "Junior/Mid"
      fit: "secondary"
      note: "Growing into the backend within the TS/Node ecosystem."

narrative:
  headline: "Frontend Engineer — UI, Motion & Product"
  exit_story: "Frontend engineer with agency and product experience, focused on the perceived quality of interfaces: motion design, micro-interactions, and end-to-end polish."
  superpowers:
    - "UI polish & motion design — turning a generic UI into a memorable experience"
    - "Full TypeScript ecosystem: React, Next.js, React Native"
    - "End-to-end autonomy — from design to production"
    - "Web performance: Core Web Vitals, LCP and re-render optimization"
  proof_points:
    - name: "Portfolio"
      url: "https://robinvale.example"
      hero_metric: "Personal portfolio showcasing shipped projects"
    - name: "Motion system (open source)"
      url: "https://github.com/robinvale-demo/motion"
      hero_metric: "Reusable transition layer, 1.2k stars"

compensation:
  target_range: "45-55K€ gross annual (CDI)"
  currency: "EUR"
  minimum: "45K€ CDI / 400€ daily rate (freelance)"
  location_flexibility: "Fully flexible: remote, hybrid, on-site, relocation possible"

location:
  country: "France"
  city: "Lyon"
  timezone: "CET (Europe/Paris)"
  visa_status: "EU citizen, EU work permit"

cv:
  output_format: "html"

cover_letter:
  notice_period_days: 0
  primary_domain: "frontend web/mobile, product engineering"
`;

/** A couple of illustrative source documents (bytes aren't served in demo). */
export const DEMO_PROFILE_DOCUMENTS: ProfileDocument[] = [
  {
    name: "Internship report — Northwind 2024.pdf",
    ext: "pdf",
    kind: "pdf",
    sizeBytes: 482_310,
    modifiedMs: Date.UTC(2025, 5, 12),
  },
  {
    name: "Project references.pdf",
    ext: "pdf",
    kind: "pdf",
    sizeBytes: 221_004,
    modifiedMs: Date.UTC(2025, 2, 3),
  },
];

export const DEMO_PROFILE_TEXTS: ProfileTexts = {
  cv: [
    "# Robin Vale",
    "",
    "**Frontend Engineer — UI, Motion & Product**",
    "",
    "- Portfolio: [robinvale.example](https://robinvale.example)",
    "- Email: robin.vale.demo@example.com",
    "",
    "## Profile",
    "",
    "Frontend engineer focused on interface craft: motion design, micro-interactions,",
    "and end-to-end product polish across the TypeScript ecosystem.",
    "",
    "## Experience",
    "",
    "### Freelance — React Native habit tracker (2026 — present)",
    "- Full UI/UX & product direction on a highly gamified mobile app.",
    "",
    "### Agency — Frontend Engineer (2025)",
    "- International e-commerce platform in Angular/TypeScript; Core Web Vitals work.",
  ].join("\n"),
  articleDigest: [
    "# Article digest (demo)",
    "",
    "Factual proof points extracted from the source documents. This digest is the",
    "authorized source used for CV / cover letters / interview prep.",
    "",
    "- **Northwind internship (2024):** built React/TypeScript dashboards over REST",
    "  APIs; introduced OnPush change detection, measurable LCP improvement.",
    "- **Project references:** open-source motion system adopted by three teams.",
  ].join("\n"),
  voiceDna: [
    "# Voice DNA (demo)",
    "",
    "- Direct, concrete, no filler. Lead with the outcome.",
    "- Prefer plain verbs over buzzwords. Show craft, don't claim it.",
    "- French and English both used; keep register professional but warm.",
  ].join("\n"),
  writingSamples: [
    {
      name: "cover-letter-sample.md",
      markdown: [
        "# Cover letter sample",
        "",
        "I care about the details users feel but rarely name — the timing of a",
        "transition, the weight of a shadow, the way a list settles into place.",
      ].join("\n"),
    },
  ],
};
