"use client";

import type { ReactNode } from "react";
import { Banknote, ExternalLink, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/client/queries";
import type { Profile } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { EditableField } from "./editable-field";
import { ProfileDocuments } from "./profile-documents";
import { ProfileTextsPanel } from "./profile-texts";

/** A card shell for a profile section. Title/description optional so
 * self-titling sections (Documents, CV & voice) supply their own header. */
function Card({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-5 shadow-xs md:p-6",
        className,
      )}
    >
      {title ? (
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Small muted section label shared across the read-only groupings. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">{children}</span>
  );
}

function fitVariant(fit: string | null): "default" | "secondary" | "outline" {
  if (fit === "primary") return "default";
  if (fit === "secondary") return "secondary";
  return "outline";
}

/** Up to two initials from the candidate's name (fallback "•"). */
function initialsOf(name: string | null): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * The Profile tab: everything the system knows about the candidate. An identity
 * hero anchors the page; a two-column grid on desktop pairs the narrative with a
 * compact, editable details rail; the source documents and long-form CV/voice
 * texts run full width below. Simple scalar fields edit in place; the rich lists
 * (target roles, superpowers, proof points) are read-only. All styling reuses
 * the site's tokens (cards, borders, badges, type scale).
 */
export function ProfileView() {
  const { data, isLoading, isError, error } = useProfile();

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load your profile</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const { profile, documents, texts } = data;

  return (
    <div className="flex w-full flex-col gap-6">
      <ProfileHero profile={profile} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details rail — first on mobile (edit your info right after the hero),
            right column on desktop. min-w-0 keeps the grid track from being
            widened by any long content inside. */}
        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2 lg:col-span-1">
          <DetailsCard profile={profile} />
          <Card title="Compensation" description="Targets and flexibility.">
            <div className="flex flex-col gap-4">
              <EditableField label="Target range" field="compensation.target_range" value={profile.compensation.targetRange} />
              <EditableField label="Minimum" field="compensation.minimum" value={profile.compensation.minimum} />
              <EditableField label="Currency" field="compensation.currency" value={profile.compensation.currency} />
              <EditableField
                label="Location flexibility"
                field="compensation.location_flexibility"
                value={profile.compensation.locationFlexibility}
                multiline
              />
            </div>
          </Card>
          <Card title="Location & eligibility" description="Where you are and your work rights.">
            <div className="flex flex-col gap-4">
              <EditableField label="City" field="location.city" value={profile.location.city} />
              <EditableField label="Country" field="location.country" value={profile.location.country} />
              <EditableField label="Timezone" field="location.timezone" value={profile.location.timezone} />
              <EditableField
                label="Visa / work permit"
                field="location.visa_status"
                value={profile.location.visaStatus}
                multiline
              />
              <EditableField
                label="Cover-letter domain"
                field="cover_letter.primary_domain"
                value={profile.coverLetter.primaryDomain}
              />
            </div>
          </Card>
        </div>

        {/* Narrative + target roles — the main reading column on desktop. */}
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-2">
          <NarrativeCard profile={profile} />
          <TargetRolesCard profile={profile} />
        </div>
      </div>

      <Card>
        <ProfileDocuments documents={documents} />
      </Card>

      <Card>
        <ProfileTextsPanel texts={texts} />
      </Card>
    </div>
  );
}

/** Identity hero: monogram + editable name/headline + key-fact chips. */
function ProfileHero({ profile }: { profile: Profile }) {
  const c = profile.candidate;
  // Only short, single-line facts belong in the hero as chips. Long-form values
  // (e.g. visa status) live in the editable "Location & eligibility" card.
  const chips: Array<{ icon: LucideIcon; value: string | null }> = [
    { icon: MapPin, value: c.location ?? profile.location.city },
    { icon: Banknote, value: profile.compensation.targetRange },
  ];
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center self-start rounded-xl bg-foreground font-mono text-xl font-semibold text-background"
        >
          {initialsOf(c.fullName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <EditableField
              label="Full name"
              field="candidate.full_name"
              value={c.fullName}
              hideLabel
              valueClassName="text-2xl font-semibold tracking-tight"
              placeholder="Your name"
            />
            <EditableField
              label="Headline"
              field="narrative.headline"
              value={profile.narrative.headline}
              hideLabel
              valueClassName="text-sm text-muted-foreground"
              placeholder="Your headline"
            />
          </div>
          {chips.some((chip) => chip.value) ? (
            <div className="flex flex-wrap gap-1.5">
              {chips
                .filter((chip) => chip.value)
                .map((chip, i) => {
                  const Icon = chip.icon;
                  return (
                    <Badge key={i} variant="outline" className="gap-1.5 font-normal">
                      <Icon className="text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{chip.value}</span>
                    </Badge>
                  );
                })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Editable contact details — the compact rail card. */
function DetailsCard({ profile }: { profile: Profile }) {
  const c = profile.candidate;
  const linkHref = (v: string) => (v.startsWith("http") ? v : `https://${v}`);
  return (
    <Card title="Contact">
      <div className="flex flex-col gap-4">
        <EditableField label="Email" field="candidate.email" type="email" value={c.email} href={(v) => `mailto:${v}`} />
        <EditableField label="Phone" field="candidate.phone" type="tel" value={c.phone} href={(v) => `tel:${v.replace(/\s+/g, "")}`} />
        <EditableField label="Location" field="candidate.location" value={c.location} />
        <EditableField label="Portfolio" field="candidate.portfolio_url" type="url" value={c.portfolioUrl} href={linkHref} />
        <EditableField label="LinkedIn" field="candidate.linkedin" type="url" value={c.linkedin} href={linkHref} />
        <EditableField label="GitHub" field="candidate.github" type="url" value={c.github} href={linkHref} />
      </div>
    </Card>
  );
}

function NarrativeCard({ profile }: { profile: Profile }) {
  const n = profile.narrative;
  return (
    <Card title="Narrative" description="How the system pitches you.">
      <div className="flex flex-col gap-6">
        <EditableField
          label="Exit story"
          field="narrative.exit_story"
          value={n.exitStory}
          multiline
        />

        {n.superpowers.length > 0 ? (
          <div className="flex flex-col gap-2">
            <GroupLabel>Superpowers</GroupLabel>
            <ul className="flex flex-col gap-1.5">
              {n.superpowers.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {n.proofPoints.length > 0 ? (
          <div className="flex flex-col gap-2">
            <GroupLabel>Proof points</GroupLabel>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {n.proofPoints.map((p, i) => (
                <li key={i} className="rounded-lg border p-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${p.name}`}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                  {p.heroMetric ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.heroMetric}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TargetRolesCard({ profile }: { profile: Profile }) {
  const t = profile.targetRoles;
  if (t.primary.length === 0 && t.archetypes.length === 0) return null;
  return (
    <Card
      title="Target roles"
      description="What you're aiming for (edited in the data repo)."
    >
      <div className="flex flex-col gap-6">
        {t.primary.length > 0 ? (
          <div className="flex flex-col gap-2">
            <GroupLabel>Primary</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {t.primary.map((role, i) => (
                <Badge key={i} variant="secondary" className="font-normal">
                  <span className="min-w-0 truncate">{role}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {t.archetypes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <GroupLabel>Archetypes</GroupLabel>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {t.archetypes.map((a, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-1.5 rounded-lg border p-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 break-words text-sm font-medium">
                      {a.name}
                    </span>
                    {a.fit ? (
                      <Badge variant={fitVariant(a.fit)} className="ml-auto shrink-0 font-normal">
                        {a.fit}
                      </Badge>
                    ) : null}
                  </div>
                  {a.level ? (
                    <span className="text-xs text-muted-foreground">{a.level}</span>
                  ) : null}
                  {a.note ? (
                    <p className="text-xs text-muted-foreground">{a.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
