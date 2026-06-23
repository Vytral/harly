"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  headline: string | null;
};

export function PortalProfileForm({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [form, setForm] = useState(profile);
  const [isPending, start] = useTransition();

  function set(key: keyof ProfileData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value || null }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const { updatePortalProfileAction } = await import("@/features/portal/profile-actions");
      const result = await updatePortalProfileAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={form.email} readOnly className="bg-muted/50" />
        <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="headline">Headline</Label>
        <Input
          id="headline"
          value={form.headline ?? ""}
          onChange={(e) => set("headline", e.target.value)}
          placeholder="e.g. Senior Software Engineer"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+1 555 000 0000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={form.location ?? ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="City, Country"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedin">LinkedIn URL</Label>
        <Input
          id="linkedin"
          type="url"
          value={form.linkedinUrl ?? ""}
          onChange={(e) => set("linkedinUrl", e.target.value)}
          placeholder="https://linkedin.com/in/yourprofile"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="github">GitHub URL</Label>
          <Input
            id="github"
            type="url"
            value={form.githubUrl ?? ""}
            onChange={(e) => set("githubUrl", e.target.value)}
            placeholder="https://github.com/yourhandle"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="url"
            value={form.websiteUrl ?? ""}
            onChange={(e) => set("websiteUrl", e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
