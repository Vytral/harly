/** Map stable Better Auth codes to user-facing messages. Unknown codes use a
 * contextual fallback; server-supplied descriptions are not shown directly. */
export function authErrorKey(code: string | undefined, fallback: string): string {
  switch (code) {
    case "INVALID_EMAIL": return "invalidEmail";
    case "INVALID_PASSWORD": return "invalidPassword";
    case "INVALID_EMAIL_OR_PASSWORD": return "invalidCredentials";
    case "PASSWORD_TOO_SHORT": return "passwordTooShort";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return "accountExists";
    case "INVALID_TOKEN": return "invalidToken";
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE": return "invalidCode";
    default: return fallback;
  }
}
