import {
  OUTREACH_SCHEMA_VERSION,
  type OutreachDoc,
} from "@/lib/domain";

/**
 * Seeded fictional outreach contacts across several demo apps and every stage
 * of the machine (identified → replied), so the stepper, card indicators, and
 * table glyphs all render out of the box. All people are invented.
 *
 * App #1 must keep at least one contact (outreach-route demo test).
 */
export function buildDemoOutreach(): OutreachDoc {
  return {
    version: OUTREACH_SCHEMA_VERSION,
    applications: {
      "1": [
        {
          id: "c_demo0001",
          kind: "recruiter",
          name: "Maya Lindqvist",
          linkedin: "https://www.linkedin.com/in/maya-lindqvist-demo",
          companyRole: "Technical Recruiter",
          stage: "messaged",
          stageDates: {
            identified: "2026-06-03",
            requested: "2026-06-04",
            accepted: "2026-06-06",
            messaged: "2026-06-07",
          },
          notes: "Warm reply on the intro thread.",
        },
        {
          id: "c_demo0002",
          kind: "hiring-manager",
          name: "Jonas Reber",
          companyRole: "Engineering Manager, Web Platform",
          stage: "identified",
          stageDates: { identified: "2026-06-05" },
        },
      ],
      "4": [
        {
          id: "c_demo0003",
          kind: "founder",
          name: "Priya Natarajan",
          linkedin: "https://www.linkedin.com/in/priya-natarajan-demo",
          stage: "replied",
          stageDates: {
            identified: "2026-06-10",
            requested: "2026-06-10",
            accepted: "2026-06-11",
            messaged: "2026-06-12",
            replied: "2026-06-14",
          },
          notes: "Asked for the portfolio link — sent it.",
        },
      ],
      "12": [
        {
          id: "c_demo0004",
          kind: "peer",
          name: "Tomás Ferreira",
          linkedin: "https://www.linkedin.com/in/tomas-ferreira-demo",
          companyRole: "Product Engineer",
          stage: "accepted",
          stageDates: {
            identified: "2026-06-27",
            requested: "2026-06-27",
            accepted: "2026-06-29",
          },
          notes: "Connected — draft the console-UI question before messaging.",
        },
      ],
      "17": [
        {
          id: "c_demo0005",
          kind: "recruiter",
          name: "Aoife Brennan",
          companyRole: "Talent Partner",
          stage: "requested",
          stageDates: { identified: "2026-06-30", requested: "2026-07-01" },
        },
      ],
      "26": [
        {
          id: "c_demo0006",
          kind: "hiring-manager",
          name: "Sofia Marchetti",
          linkedin: "https://www.linkedin.com/in/sofia-marchetti-demo",
          companyRole: "Head of Design Engineering",
          stage: "messaged",
          stageDates: {
            identified: "2026-07-03",
            requested: "2026-07-03",
            accepted: "2026-07-04",
            messaged: "2026-07-05",
          },
          notes: "Mentioned the motion playground — she starred it.",
        },
      ],
    },
  };
}
