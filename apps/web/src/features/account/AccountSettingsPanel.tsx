"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CalendarDays,
  Camera,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Hash,
  LogOut,
  LockKeyhole,
  MapPin,
  Mail,
  PencilLine,
  Phone,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { authClient, signOut } from "@/lib/auth-client";
import { getImageFileValidationError } from "@/lib/storage-validation";
import { updateUserProfileAction } from "@/features/account/actions";
import { AvatarCropDialog } from "@/components/ui/AvatarCropDialog";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  jobTitle: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  createdAt?: Date;
};

function formatDate(date: Date | undefined) {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const compact = !description;

  return (
    <Card className={cn("gap-0 py-0 overflow-hidden", className)}>
      <CardHeader
        className={cn(
          "border-b bg-muted/20 px-6",
          compact ? "flex items-center justify-between py-3.5" : "pt-4 !pb-3.5",
        )}
      >
        <div className={cn(compact ? "flex items-center" : "space-y-1.5")}>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("px-6", compact ? "py-3" : "py-5")}>
        {children}
      </CardContent>
    </Card>
  );
}

function IconInput({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60">
        <Icon className="size-4" />
      </span>
      <Input className={cn("pl-10", className)} {...props} />
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  icon: Icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60">
          <Icon className="size-4" />
        </span>
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function SocialLinkField({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">
          <Icon className="size-4" />
        </span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 text-sm"
        />
      </div>
    </div>
  );
}

function splitPersonName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

async function uploadImage(file: File | Blob): Promise<string> {
  const filename = file instanceof File ? file.name : "avatar.jpg";
  const presign = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "image",
      filename,
      contentType: file.type || "image/jpeg",
      contentLength: file.size,
    }),
  });

  if (!presign.ok) throw new Error("Could not prepare the upload.");

  const data = (await presign.json()) as {
    uploadUrl: string;
    fileUrl: string;
    key: string;
  };

  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });

  if (!put.ok) throw new Error("Upload failed. Try again.");
  return data.fileUrl;
}

export function AccountSettingsPanel({
  user,
  securitySlot,
}: {
  user: AccountUser;
  securitySlot?: React.ReactNode;
}) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const initialName = splitPersonName(user.name);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [image, setImage] = useState(user.image ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [location, setLocation] = useState(user.location ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(user.linkedinUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(user.githubUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(user.websiteUrl ?? "");
  const [savingProfile, startProfile] = useTransition();
  const [profileDirty, setProfileDirty] = useState(false);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const userAgent = useSyncExternalStore(
    () => () => {},
    () => navigator.userAgent.slice(0, 60),
    () => "Unknown browser",
  );

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, startEmail] = useTransition();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, startPassword] = useTransition();

  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSavePassword =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  const [signingOut, startSignOut] = useTransition();

  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const displayName = fullName || user.name;

  function markDirty() {
    if (!profileDirty) setProfileDirty(true);
  }

  function saveProfile() {
    startProfile(async () => {
      const result = await updateUserProfileAction({
        name: displayName,
        image: image.trim() || null,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
        location: location.trim() || null,
        bio: bio.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error ?? "Could not update profile.");
        return;
      }

      await authClient.updateUser({
        name: displayName,
        image: image.trim() || undefined,
      });

      toast.success("Profile updated.");
      setProfileDirty(false);
      router.refresh();
    });
  }

  function handleAvatarFileSelect(file: File | null) {
    if (!file) return;
    const error = getImageFileValidationError(file);
    if (error) {
      toast.error(error);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    setCropOpen(true);
  }

  function handleCropComplete(blob: Blob) {
    setCropOpen(false);
    startProfile(async () => {
      try {
        const url = await uploadImage(blob);
        setImage(url);
        const result = await updateUserProfileAction({
          name: displayName,
          image: url,
          jobTitle: jobTitle.trim() || null,
          phone: phone.trim() || null,
          location: location.trim() || null,
          bio: bio.trim() || null,
        });

        if (!result.success) {
          toast.error(result.error ?? "Could not update avatar.");
          return;
        }

        await authClient.updateUser({
          name: displayName,
          image: url,
        });

        toast.success("Avatar updated.");
        router.refresh();
      } catch {
        toast.error("Upload failed.");
      } finally {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
      }
    });
  }

  function removeAvatar() {
    setImage("");
    startProfile(async () => {
      const result = await updateUserProfileAction({
        name: displayName,
        image: null,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
        location: location.trim() || null,
        bio: bio.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error ?? "Could not remove avatar.");
        return;
      }

      await authClient.updateUser({ name: displayName, image: undefined });
      toast.success("Avatar removed.");
      router.refresh();
    });
  }

  function saveEmail() {
    const email = newEmail.trim();
    if (!email) return;
    startEmail(async () => {
      const result = await authClient.changeEmail({ newEmail: email });
      if (result.error) {
        toast.error(result.error.message ?? "Could not change email.");
      } else {
        toast.success("Email updated.");
        setNewEmail("");
        router.refresh();
      }
    });
  }

  function savePassword() {
    if (!canSavePassword) {
      toast.error("Enter your current password and a matching new one (8+ chars).");
      return;
    }
    startPassword(async () => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Could not change password.");
      } else {
        toast.success("Password changed.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }

  function handleSignOut() {
    startSignOut(async () => {
      await signOut();
      window.location.href = "/login";
    });
  }

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(user.id);
      toast.success("Account ID copied.");
    } catch {
      // silent
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* ─── Profile header ─── */}
      <div className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:items-center sm:gap-6">
        <div className="group relative shrink-0">
          <UserAvatar
            name={displayName}
            src={image || null}
            size="xl"
            className="size-20 text-2xl ring-2 ring-border/50 ring-offset-2 ring-offset-background"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={savingProfile}
            aria-label="Change avatar"
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white/0 transition-all duration-150 ease-out hover:bg-black/40 hover:text-white/90 focus-visible:bg-black/40 focus-visible:text-white/90 focus-visible:outline-none active:scale-[0.97]"
          >
            <Camera className="size-5" strokeWidth={1.8} />
          </button>
          {image && (
            <button
              type="button"
              onClick={removeAvatar}
              aria-label="Remove avatar"
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <span className="text-xs leading-none">×</span>
            </button>
          )}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="sr-only"
            onChange={(e) => {
              handleAvatarFileSelect(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {displayName}
            </h2>
            {user.jobTitle ? (
              <Badge variant="secondary" className="w-fit shrink-0">
                {user.jobTitle}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-start">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              Member since {formatDate(user.createdAt)}
            </span>
            <button
              type="button"
              onClick={copyUserId}
              className="group flex items-center gap-1.5 transition hover:text-foreground"
            >
              <Hash className="size-3.5" />
              <span>{user.id.slice(0, 12)}…</span>
              <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
        </TabsList>

        {/* ─── PROFILE TAB ─── */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <SectionCard
            title="Personal info"
            description="Your name and how others see you on the platform."
          >
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-first-name">First name</Label>
                  <Input
                    id="acc-first-name"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); markDirty(); }}
                    placeholder="Ada"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-last-name">Last name</Label>
                  <Input
                    id="acc-last-name"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); markDirty(); }}
                    placeholder="Lovelace"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-job-title">Job title</Label>
                  <IconInput
                    icon={UserRound}
                    id="acc-job-title"
                    value={jobTitle}
                    onChange={(e) => { setJobTitle(e.target.value); markDirty(); }}
                    placeholder="e.g. Engineering Manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-phone">Phone</Label>
                  <IconInput
                    icon={Phone}
                    id="acc-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-location">Location</Label>
                  <IconInput
                    icon={MapPin}
                    id="acc-location"
                    value={location}
                    onChange={(e) => { setLocation(e.target.value); markDirty(); }}
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Bio" description="A short description shown on your profile and hiring team views.">
            <Textarea
              id="acc-bio"
              value={bio}
              onChange={(e) => { setBio(e.target.value); markDirty(); }}
              placeholder="Tell your team a bit about yourself…"
              className="min-h-[100px] resize-y"
            />
          </SectionCard>

          <SectionCard title="Links" description="Connected profiles and personal links.">
            <div className="space-y-4">
              <SocialLinkField
                icon={LinkedinLogo}
                label="LinkedIn"
                placeholder="https://linkedin.com/in/username"
                value={linkedinUrl}
                onChange={(v) => { setLinkedinUrl(v); markDirty(); }}
              />
              <SocialLinkField
                icon={GithubIcon}
                label="GitHub"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(v) => { setGithubUrl(v); markDirty(); }}
              />
              <SocialLinkField
                icon={Globe}
                label="Website"
                placeholder="https://yoursite.com"
                value={websiteUrl}
                onChange={(v) => { setWebsiteUrl(v); markDirty(); }}
              />
            </div>
          </SectionCard>

          {profileDirty ? (
            <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-xl border border-pine/30 bg-card px-5 py-3.5 shadow-[0_8px_24px_-12px_rgba(31,41,38,0.25)]">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const resetName = splitPersonName(user.name);
                    setFirstName(resetName.firstName);
                    setLastName(resetName.lastName);
                    setImage(user.image ?? "");
                    setJobTitle(user.jobTitle ?? "");
                    setPhone(user.phone ?? "");
                    setLocation(user.location ?? "");
                    setBio(user.bio ?? "");
                    setLinkedinUrl(user.linkedinUrl ?? "");
                    setGithubUrl(user.githubUrl ?? "");
                    setWebsiteUrl(user.websiteUrl ?? "");
                    setProfileDirty(false);
                  }}
                  disabled={savingProfile}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
                  <PencilLine className="size-4" />
                  {savingProfile ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* ─── SECURITY TAB ─── */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <SectionCard
            title="Email address"
            description="Your primary email used for sign-in and notifications."
            action={
              <Button
                variant="outline"
                onClick={saveEmail}
                disabled={savingEmail || !newEmail.trim()}
              >
                {savingEmail ? "Updating…" : "Update email"}
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <AtSign className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{user.email}</span>
                <Badge variant="secondary" className="shrink-0">
                  Current
                </Badge>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-email">New email</Label>
                <IconInput
                  icon={Mail}
                  id="acc-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Password"
            description="Changing your password signs out every other session."
            action={
              <Button
                variant="outline"
                onClick={savePassword}
                disabled={savingPassword || !canSavePassword}
              >
                {savingPassword ? "Saving…" : "Change password"}
              </Button>
            }
          >
            <div className="space-y-4">
              <PasswordField
                id="acc-current"
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                icon={LockKeyhole}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PasswordField
                  id="acc-new"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  icon={LockKeyhole}
                />
                <PasswordField
                  id="acc-confirm"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  icon={LockKeyhole}
                />
              </div>
              <p
                className={cn(
                  "text-xs",
                  passwordsMismatch ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {passwordsMismatch
                  ? "New password and confirmation don't match."
                  : "Use 8+ characters."}
              </p>
            </div>
          </SectionCard>

          {securitySlot}
        </TabsContent>

        {/* ─── SESSION TAB ─── */}
        <TabsContent value="session" className="mt-6 space-y-6">
          <SectionCard title="Active sessions">
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Current browser</p>
                  <p className="text-xs text-muted-foreground">
                    {userAgent}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  This device
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Signing out will end this session. Use &ldquo;Sign out everywhere&rdquo; from settings to revoke all sessions.
              </p>
            </div>
          </SectionCard>

          <Card className="overflow-hidden border-destructive/20 gap-0 py-0">
            <CardHeader className="border-b border-destructive/10 bg-destructive/[0.03] px-6 py-3">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <LogOut className="size-4" />
                Danger zone
              </CardTitle>
              <CardDescription>
                End your current session on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  You&apos;ll need to sign in again to access your account.
                </p>
                <Button
                  variant="outline"
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  <LogOut className="size-4" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AvatarCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        imageSrc={cropSrc}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}
