"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

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

function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputClass = cn(
  "h-10 w-full rounded-lg border border-border",
  "bg-card px-3.5 text-sm text-foreground",
  "placeholder:text-muted-foreground",
  "outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
  "transition-colors",
);

const readonlyClass = cn(
  "flex h-10 w-full items-center rounded-lg border border-border",
  "bg-muted px-3.5 text-sm text-muted-foreground",
  "cursor-not-allowed select-none",
);

// Inline Phosphor SVG icons — no CDN dependency
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="M216 24H40a16 16 0 0 0-16 16v176a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V40a16 16 0 0 0-16-16m0 192H40V40h176zM96 112v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0m88 28v36a8 8 0 0 1-16 0v-36a20 20 0 0 0-40 0v36a8 8 0 0 1-16 0v-64a8 8 0 0 1 15.79-1.78A36 36 0 0 1 184 140m-84-56a12 12 0 1 1-12-12a12 12 0 0 1 12 12" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="M208.31 75.68A59.78 59.78 0 0 0 202.93 28a8 8 0 0 0-6.93-4a59.75 59.75 0 0 0-48 24h-24a59.75 59.75 0 0 0-48-24a8 8 0 0 0-6.93 4a59.78 59.78 0 0 0-5.38 47.68A58.14 58.14 0 0 0 56 104v8a56.06 56.06 0 0 0 48.44 55.47A39.8 39.8 0 0 0 96 192v8H72a24 24 0 0 1-24-24a40 40 0 0 0-40-40a8 8 0 0 0 0 16a24 24 0 0 1 24 24a40 40 0 0 0 40 40h24v16a8 8 0 0 0 16 0v-40a24 24 0 0 1 48 0v40a8 8 0 0 0 16 0v-40a39.8 39.8 0 0 0-8.44-24.53A56.06 56.06 0 0 0 216 112v-8a58.14 58.14 0 0 0-7.69-28.32M200 112a40 40 0 0 1-40 40h-48a40 40 0 0 1-40-40v-8a41.74 41.74 0 0 1 6.9-22.48a8 8 0 0 0 1.1-7.69a43.8 43.8 0 0 1 .79-33.58a43.88 43.88 0 0 1 32.32 20.06a8 8 0 0 0 6.71 3.69h32.35a8 8 0 0 0 6.74-3.69a43.87 43.87 0 0 1 32.32-20.06a43.8 43.8 0 0 1 .77 33.58a8.09 8.09 0 0 0 1 7.65a41.7 41.7 0 0 1 7 22.52Z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="M128 24a104 104 0 1 0 104 104A104.12 104.12 0 0 0 128 24m88 104a87.6 87.6 0 0 1-3.33 24h-38.51a157.4 157.4 0 0 0 0-48h38.51a87.6 87.6 0 0 1 3.33 24m-114 40h52a115.1 115.1 0 0 1-26 45a115.3 115.3 0 0 1-26-45m-3.9-16a140.8 140.8 0 0 1 0-48h59.88a140.8 140.8 0 0 1 0 48ZM40 128a87.6 87.6 0 0 1 3.33-24h38.51a157.4 157.4 0 0 0 0 48H43.33A87.6 87.6 0 0 1 40 128m114-40h-52a115.1 115.1 0 0 1 26-45a115.3 115.3 0 0 1 26 45m52.33 0h-35.62a135.3 135.3 0 0 0-22.3-45.6A88.29 88.29 0 0 1 206.37 88Zm-98.74-45.6A135.3 135.3 0 0 0 85.29 88H49.63a88.29 88.29 0 0 1 57.96-45.6M49.63 168h35.66a135.3 135.3 0 0 0 22.3 45.6A88.29 88.29 0 0 1 49.63 168m98.78 45.6a135.3 135.3 0 0 0 22.3-45.6h35.66a88.29 88.29 0 0 1-57.96 45.6" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="m222.37 158.46l-47.11-21.11l-.13-.06a16 16 0 0 0-15.17 1.4a8 8 0 0 0-.75.56L134.87 160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16 16 0 0 0 1.32-15.06v-.12L97.54 33.64a16 16 0 0 0-16.62-9.52A56.26 56.26 0 0 0 32 80c0 79.4 64.6 144 144 144a56.26 56.26 0 0 0 55.88-48.92a16 16 0 0 0-9.51-16.62M176 208A128.14 128.14 0 0 1 48 80a40.2 40.2 0 0 1 34.87-40a.6.6 0 0 0 0 .12l21 47l-20.67 24.74a6 6 0 0 0-.57.77a16 16 0 0 0-1 15.7c9.06 18.53 27.73 37.06 46.46 46.11a16 16 0 0 0 15.75-1.14a8 8 0 0 0 .74-.56L168.89 152l47 21.05h.11A40.21 40.21 0 0 1 176 208" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="M128 64a40 40 0 1 0 40 40a40 40 0 0 0-40-40m0 64a24 24 0 1 1 24-24a24 24 0 0 1-24 24m0-112a88.1 88.1 0 0 0-88 88c0 31.4 14.51 64.68 42 96.25a254.2 254.2 0 0 0 41.45 38.3a8 8 0 0 0 9.18 0a254.2 254.2 0 0 0 41.37-38.3c27.45-31.57 42-64.85 42-96.25a88.1 88.1 0 0 0-88-88m0 206c-16.53-13-72-60.75-72-118a72 72 0 0 1 144 0c0 57.23-55.47 105-72 118" />
    </svg>
  );
}

function IdentificationIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden>
      <path d="M230.92 212c-15.23-26.33-38.7-45.21-66.09-54.16a72 72 0 1 0-73.66 0c-27.39 8.94-50.86 27.82-66.09 54.16a8 8 0 1 0 13.85 8c18.84-32.56 52.14-52 89.07-52s70.23 19.44 89.07 52a8 8 0 1 0 13.85-8M72 96a56 56 0 1 1 56 56a56.06 56.06 0 0 1-56-56" />
    </svg>
  );
}

export function PortalProfileForm({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [form, setForm] = useState(profile);
  const [isPending, start] = useTransition();

  function set(key: keyof ProfileData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value || null }));
  }

  function save(e: React.SyntheticEvent<HTMLFormElement>) {
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
    <form onSubmit={save} className="space-y-6">
      {/* Basic info */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Basic info
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="firstName">
            <input
              id="firstName"
              className={inputClass}
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
            />
          </Field>
          <Field label="Last name" id="lastName">
            <input
              id="lastName"
              className={inputClass}
              value={form.lastName ?? ""}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Email" hint="Email cannot be changed here.">
          <div className={readonlyClass}>{form.email}</div>
        </Field>

        <Field label="Headline" id="headline">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <IdentificationIcon className="size-4 text-muted-foreground" />
            </div>
            <input
              id="headline"
              className={cn(inputClass, "pl-9")}
              value={form.headline ?? ""}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" id="phone">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <PhoneIcon className="size-4 text-muted-foreground" />
              </div>
              <input
                id="phone"
                type="tel"
                className={cn(inputClass, "pl-9")}
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>
          </Field>
          <Field label="Location" id="location">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <MapPinIcon className="size-4 text-muted-foreground" />
              </div>
              <input
                id="location"
                className={cn(inputClass, "pl-9")}
                value={form.location ?? ""}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, Country"
              />
            </div>
          </Field>
        </div>
      </fieldset>

      <div className="h-px bg-border" />

      {/* Online profiles */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Online profiles
        </legend>

        <Field label="LinkedIn" id="linkedin">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <LinkedInIcon className="size-4 text-[#0A66C2]" />
            </div>
            <input
              id="linkedin"
              type="url"
              className={cn(inputClass, "pl-9")}
              value={form.linkedinUrl ?? ""}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub" id="github">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <GitHubIcon className="size-4 text-foreground" />
              </div>
              <input
                id="github"
                type="url"
                className={cn(inputClass, "pl-9")}
                value={form.githubUrl ?? ""}
                onChange={(e) => set("githubUrl", e.target.value)}
                placeholder="https://github.com/yourhandle"
              />
            </div>
          </Field>
          <Field label="Website" id="website">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <GlobeIcon className="size-4 text-muted-foreground" />
              </div>
              <input
                id="website"
                type="url"
                className={cn(inputClass, "pl-9")}
                value={form.websiteUrl ?? ""}
                onChange={(e) => set("websiteUrl", e.target.value)}
                placeholder="https://yoursite.com"
              />
            </div>
          </Field>
        </div>
      </fieldset>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background",
            "transition-all duration-150 hover:bg-foreground/90",
            "active:scale-[0.97]",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          )}
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
