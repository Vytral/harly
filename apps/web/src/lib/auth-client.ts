"use client";

import { signOut as authSignOut } from "@harly/auth/client";

import {
  browserLocalStorage,
  clearAllSearchRecents,
} from "@/features/search/recents";

export { authClient, signIn, useSession } from "@harly/auth/client";

/**
 * Every sign-out path goes through here so per-browser conveniences such as
 * search palette recents never outlive the session they were created in.
 */
export const signOut: typeof authSignOut = (...args) => {
  clearAllSearchRecents(browserLocalStorage());
  return authSignOut(...args);
};
