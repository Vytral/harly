"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [organizationClient(), twoFactorClient(), magicLinkClient()],
});

export const { signIn, signOut, useSession, getSession } = authClient;
