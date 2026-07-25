"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, or } from "drizzle-orm";

import { db, schema } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  updateProfileSchema,
  usernameSchema,
  type UpdateProfileInput,
} from "./validators";

const PROFILE_COLUMNS = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  image: schema.user.image,
  jobTitle: schema.user.jobTitle,
  phone: schema.user.phone,
  location: schema.user.location,
  bio: schema.user.bio,
  linkedinUrl: schema.user.linkedinUrl,
  githubUrl: schema.user.githubUrl,
  websiteUrl: schema.user.websiteUrl,
  username: schema.user.username,
  timezone: schema.user.timezone,
  specialties: schema.user.specialties,
  languages: schema.user.languages,
  weeklyAvailability: schema.user.weeklyAvailability,
  capacityHoursPerWeek: schema.user.capacityHoursPerWeek,
} as const;

export type PersonProfile = Pick<
  typeof schema.user.$inferSelect,
  keyof typeof PROFILE_COLUMNS
>;

export async function getOwnProfileAction(): Promise<PersonProfile | null> {
  const context = await getWorkspaceContext();
  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(schema.user)
    .where(eq(schema.user.id, context.user.id))
    .limit(1);
  return row ?? null;
}

export async function updateOwnProfileAction(data: UpdateProfileInput) {
  const context = await getWorkspaceContext();
  const parsed = updateProfileSchema.parse(data);

  await db
    .update(schema.user)
    .set({
      name: parsed.name,
      image: parsed.image ?? null,
      jobTitle: parsed.jobTitle ?? null,
      phone: parsed.phone ?? null,
      location: parsed.location ?? null,
      bio: parsed.bio ?? null,
      linkedinUrl: parsed.linkedinUrl ?? null,
      githubUrl: parsed.githubUrl ?? null,
      websiteUrl: parsed.websiteUrl ?? null,
      timezone: parsed.timezone ?? null,
      specialties: parsed.specialties ?? [],
      languages: parsed.languages ?? [],
      weeklyAvailability: parsed.weeklyAvailability ?? null,
      capacityHoursPerWeek: parsed.capacityHoursPerWeek ?? null,
    })
    .where(eq(schema.user.id, context.user.id));

  revalidatePath("/account");
  revalidatePath("/people");
  return { success: true } as const;
}

async function isUsernameTaken(username: string, excludeUserId?: string) {
  const [ownerRow] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.username, username))
    .limit(1);
  if (ownerRow && ownerRow.id !== excludeUserId) return true;
  if (ownerRow && ownerRow.id === excludeUserId) return false;

  const [historyRow] = await db
    .select({ userId: schema.usernameHistory.userId })
    .from(schema.usernameHistory)
    .where(eq(schema.usernameHistory.oldUsername, username))
    .limit(1);
  if (historyRow && historyRow.userId !== excludeUserId) return true;

  return false;
}

export async function checkUsernameAvailableAction(username: string) {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return {
      available: false,
      error: parsed.error.issues[0]?.message ?? "Invalid username.",
    } as const;
  }

  const context = await getWorkspaceContext();
  const taken = await isUsernameTaken(parsed.data, context.user.id);
  if (taken) {
    return { available: false, error: "Username is already taken." } as const;
  }
  return { available: true } as const;
}

export async function changeUsernameAction(newUsername: string) {
  const context = await getWorkspaceContext();
  const parsed = usernameSchema.parse(newUsername);

  const [current] = await db
    .select({ username: schema.user.username })
    .from(schema.user)
    .where(eq(schema.user.id, context.user.id))
    .limit(1);

  if (current?.username === parsed) {
    return { success: true, username: parsed } as const;
  }

  const taken = await isUsernameTaken(parsed, context.user.id);
  if (taken) {
    return { success: false, error: "Username is already taken." } as const;
  }

  await db.transaction(async (tx) => {
    if (current?.username) {
      await tx.insert(schema.usernameHistory).values({
        oldUsername: current.username as string,
        userId: context.user.id,
      });
    }
    await tx
      .update(schema.user)
      .set({ username: parsed })
      .where(eq(schema.user.id, context.user.id));
  });

  revalidatePath("/account");
  revalidatePath("/people");
  return { success: true, username: parsed } as const;
}

export type ProfileByUsernameResult =
  | { kind: "found"; profile: PersonProfile }
  | { kind: "redirect"; username: string }
  | { kind: "not_found" };

export async function getProfileByUsernameAction(
  username: string,
): Promise<ProfileByUsernameResult> {
  await getWorkspaceContext();

  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(schema.user)
    .where(eq(schema.user.username, username))
    .limit(1);

  if (row) {
    return { kind: "found", profile: row };
  }

  const [historyRow] = await db
    .select({ userId: schema.usernameHistory.userId })
    .from(schema.usernameHistory)
    .where(eq(schema.usernameHistory.oldUsername, username))
    .limit(1);

  if (!historyRow) {
    return { kind: "not_found" };
  }

  const [owner] = await db
    .select({ username: schema.user.username })
    .from(schema.user)
    .where(eq(schema.user.id, historyRow.userId))
    .limit(1);

  if (!owner?.username) {
    return { kind: "not_found" };
  }

  return { kind: "redirect", username: owner.username };
}

export type PersonRow = {
  id: string;
  name: string;
  image: string | null;
  jobTitle: string | null;
  username: string | null;
  timezone: string | null;
  specialties: string[] | null;
  role: string;
};

export async function listPeopleAction(filters?: {
  query?: string;
  role?: string;
  specialty?: string;
}) {
  const context = await getWorkspaceContext();

  const conditions = [
    eq(schema.member.organizationId, context.organization.id),
  ];

  if (filters?.query) {
    const q = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(schema.user.name, q),
        ilike(schema.user.jobTitle, q),
        ilike(schema.user.username, q),
      )!,
    );
  }
  if (filters?.role) {
    conditions.push(eq(schema.member.role, filters.role));
  }

  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      image: schema.user.image,
      jobTitle: schema.user.jobTitle,
      username: schema.user.username,
      timezone: schema.user.timezone,
      specialties: schema.user.specialties,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(...conditions))
    .orderBy(schema.user.name);

  if (filters?.specialty) {
    return rows.filter((row) =>
      row.specialties?.includes(filters.specialty as string),
    );
  }

  return rows;
}

export type PersonJobRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  role: string;
};

/** Jobs where this person sits on the hiring team, scoped to the current org (existing job visibility). */
export async function listPersonJobsAction(
  userId: string,
): Promise<PersonJobRow[]> {
  const context = await getWorkspaceContext();

  return db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      slug: schema.jobs.slug,
      status: schema.jobs.status,
      role: schema.jobHiringTeam.role,
    })
    .from(schema.jobHiringTeam)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobHiringTeam.jobId))
    .where(
      and(
        eq(schema.jobHiringTeam.workspaceId, context.organization.id),
        eq(schema.jobHiringTeam.userId, userId),
      ),
    )
    .orderBy(schema.jobs.title);
}
