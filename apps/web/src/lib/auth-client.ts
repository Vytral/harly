"use client";

import { signOut as authSignOut } from "@harly/auth/client";

import {
  browserLocalStorage,
  clearAllSearchRecents,
} from "@/features/search/recents";

export { authClient, signIn, useSession } from "@harly/auth/client";

/**
 * Signing out from the app clears per-browser search palette recents here. Other
 * ways a session ends (expiry, revoking another session, a redirect from the
 * proxy) do not pass through this function. The palette covers those on app
 * start, by removing recents that belong to any other user.
 */
export const signOut: typeof authSignOut = (...args) => {
  clearAllSearchRecents(browserLocalStorage());
  return authSignOut(...args);
};
