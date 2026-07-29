/** Candidate resumes are private objects; workspace images/logos may be public. */
export function isPrivateResumeStorageKey(storageKey: string): boolean {
  return storageKey.includes("/resumes/") || storageKey.startsWith("resumes/");
}
