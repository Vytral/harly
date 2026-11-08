/** True when the operator opted in to local / LAN model servers (HARLY_ALLOW_LOCAL_LLM=1). */
export function isLocalLlmAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HARLY_ALLOW_LOCAL_LLM === "1";
}
