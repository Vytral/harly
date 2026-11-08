"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Props that keep password managers and browser autofill away from a field.
 * Exported so non-Input controls can reuse them.
 */
export const NO_AUTOFILL_PROPS = {
  autoComplete: "off",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const

const subscribeNever = () => () => {}

/**
 * Masked input for API keys, tokens, client secrets and SMTP passwords.
 *
 * Chrome, Brave and Opera ignore `autocomplete="off"` on `type="password"`
 * and fill the saved login into it, putting the account email into the text
 * field before it. A key is not a login, so this renders a text input masked
 * with CSS (`-webkit-text-security`), which password managers do not treat as
 * a credential. Where that property is missing it falls back to a password
 * input marked `new-password`. Real passwords (sign in, change password) keep
 * using `type="password"` with the right `autocomplete` token.
 */
function SecretInput({
  className,
  name,
  id,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  // false on the server and during hydration, then the real answer.
  const nativeMask = React.useSyncExternalStore(
    subscribeNever,
    () => typeof CSS !== "undefined" && !CSS.supports("-webkit-text-security", "disc"),
    () => false
  )

  return (
    <Input
      {...NO_AUTOFILL_PROPS}
      {...props}
      id={id}
      name={name ?? `secret_${id ?? "field"}`}
      type={nativeMask ? "password" : "text"}
      {...(nativeMask ? { autoComplete: "new-password" } : null)}
      data-slot="secret-input"
      className={cn("[-webkit-text-security:disc]", nativeMask && "[-webkit-text-security:none]", className)}
    />
  )
}

export { SecretInput }
