"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTemplateActions, useTemplateAssist } from "@/lib/client/queries";
import type { TemplateAssistResult } from "@/lib/domain";

/**
 * "New template" — two paths:
 * - **From a prompt**: the agent proposes a template (grounded in the
 *   profile); the proposal is PREVIEWED and editable, and only "Create"
 *   persists it (diff-to-approve spirit — nothing is written before approval).
 * - **Blank**: title + type + body, straight to v1.
 *
 * `trigger` swaps the default (secondary, sm — matches page-level actions like
 * /discovery "Add offer") for a custom button, e.g. the empty-state CTA.
 */
export function NewTemplateDialog({ trigger }: { trigger?: ReactNode }) {
  const router = useRouter();
  const { create } = useTemplateActions();
  const assist = useTemplateAssist();

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<TemplateAssistResult | null>(null);
  const [blank, setBlank] = useState({ title: "", type: "", body: "" });

  const creating = create.isPending;

  function reset() {
    setPrompt("");
    setProposal(null);
    setBlank({ title: "", type: "", body: "" });
    assist.reset();
  }

  function createAndOpen(input: {
    title: string;
    type: string | null;
    body: string;
    source: "manual" | "generated";
    note?: string;
  }) {
    create.mutate(input, {
      onSuccess: (detail) => {
        setOpen(false);
        reset();
        router.push(`/templates/${detail.template.slug}`);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="secondary">
            <Plus className="size-3.5" aria-hidden />
            New template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Generate a draft from a prompt (grounded in your profile) or start
            from a blank page. Nothing is saved until you create it.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="prompt">
          <TabsList>
            <TabsTrigger value="prompt">From a prompt</TabsTrigger>
            <TabsTrigger value="blank">Blank</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="flex flex-col gap-3 pt-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Un template de base pour contacter un recruteur IT sur LinkedIn"
              rows={3}
              disabled={assist.isPending}
            />
            <div className="flex items-center justify-end gap-2">
              {assist.isPending ? (
                <p className="text-xs text-muted-foreground">
                  Asking the agent…
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={prompt.trim().length === 0 || assist.isPending}
                onClick={() =>
                  assist.mutate(
                    { prompt: prompt.trim() },
                    { onSuccess: setProposal },
                  )
                }
              >
                {assist.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}
                {proposal ? "Regenerate" : "Generate"}
              </Button>
            </div>

            {proposal ? (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Template title"
                    value={proposal.title}
                    onChange={(e) =>
                      setProposal({ ...proposal, title: e.target.value })
                    }
                  />
                  <Input
                    aria-label="Template type"
                    className="sm:w-36"
                    placeholder="type (email, linkedin…)"
                    value={proposal.type ?? ""}
                    onChange={(e) =>
                      setProposal({ ...proposal, type: e.target.value || null })
                    }
                  />
                </div>
                <Textarea
                  aria-label="Template body"
                  className="min-h-48 font-mono text-data"
                  value={proposal.body}
                  onChange={(e) =>
                    setProposal({ ...proposal, body: e.target.value })
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setProposal(null)}
                    disabled={creating}
                  >
                    Discard
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      creating ||
                      proposal.title.trim().length === 0 ||
                      proposal.body.trim().length === 0
                    }
                    onClick={() =>
                      createAndOpen({
                        title: proposal.title.trim(),
                        type: proposal.type,
                        body: proposal.body,
                        source: "generated",
                        note: `from prompt: ${prompt.trim().slice(0, 400)}`,
                      })
                    }
                  >
                    {creating ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    Create template
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="blank" className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Template title"
                placeholder="Title"
                value={blank.title}
                onChange={(e) => setBlank({ ...blank, title: e.target.value })}
              />
              <Input
                aria-label="Template type"
                className="sm:w-36"
                placeholder="type (email, linkedin…)"
                value={blank.type}
                onChange={(e) => setBlank({ ...blank, type: e.target.value })}
              />
            </div>
            <Textarea
              aria-label="Template body"
              className="min-h-48 font-mono text-data"
              placeholder="The template text…"
              value={blank.body}
              onChange={(e) => setBlank({ ...blank, body: e.target.value })}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={
                  creating ||
                  blank.title.trim().length === 0 ||
                  blank.body.trim().length === 0
                }
                onClick={() =>
                  createAndOpen({
                    title: blank.title.trim(),
                    type: blank.type.trim() || null,
                    body: blank.body,
                    source: "manual",
                  })
                }
              >
                {creating ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Create template
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
