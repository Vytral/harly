import { getTranslations } from "@/i18n/server";

import { capExceededMessage, IMPORT_MAX_CANDIDATES } from "./shared";

/**
 * Keys for the English messages that the provider importers throw. The
 * importers keep their English text (their tests and logs read it); the
 * server actions swap in the recruiter's locale before returning an error.
 * Keys live under `server.candidates.importProviders`.
 */
const EXACT_MESSAGE_KEYS = new Map<string, string>([
  ["Greenhouse returned an unsafe pagination URL.", "greenhouse.unsafePagination"],
  ["Greenhouse rejected the API key or its Candidates permission is missing.", "greenhouse.unauthorized"],
  ["Greenhouse request failed.", "greenhouse.requestFailed"],
  ["Enter a valid Greenhouse Harvest API key.", "greenhouse.invalidKey"],
  ["Greenhouse returned an invalid candidate response.", "greenhouse.invalidResponse"],
  ["Lever rejected the API key or it lacks opportunities read access.", "lever.unauthorized"],
  ["Lever request failed.", "lever.requestFailed"],
  ["Enter a valid Lever API key.", "lever.invalidKey"],
  ["Lever returned an invalid opportunities response.", "lever.invalidResponse"],
  ["Lever returned a page without its next offset.", "lever.missingCursor"],
  ["Ashby rejected the API key or its candidatesRead permission is missing.", "ashby.unauthorized"],
  ["Ashby request failed.", "ashby.requestFailed"],
  ["Enter a valid Ashby API key.", "ashby.invalidKey"],
  ["Ashby returned an invalid candidate response.", "ashby.invalidResponse"],
  ["Ashby returned a page without its next cursor.", "ashby.missingCursor"],
  ["Enter the Workable subdomain from your account URL.", "workable.invalidSubdomain"],
  ["Workable rejected the token or its r_candidates scope is missing.", "workable.unauthorized"],
  ["Workable request failed.", "workable.requestFailed"],
  ["Workable returned an unsafe pagination URL.", "workable.unsafePagination"],
  ["Enter a valid Workable API token.", "workable.invalidToken"],
  ["Workable returned an invalid candidate response.", "workable.invalidResponse"],
  ["JOIN rejected the API token or it lacks application read access.", "join.unauthorized"],
  ["JOIN request failed.", "join.requestFailed"],
  ["Enter a valid JOIN API token.", "join.invalidToken"],
]);

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Returns the text for an importer error in the translator's language, or the message unchanged. */
export function translateProviderMessage(message: string, t: Translate): string {
  const key = EXACT_MESSAGE_KEYS.get(message);
  if (key) return t(`importProviders.${key}`);
  if (message === capExceededMessage()) {
    return t("importProviders.capCandidates", { limit: IMPORT_MAX_CANDIDATES });
  }
  if (message === capExceededMessage("opportunities")) {
    return t("importProviders.capOpportunities", { limit: IMPORT_MAX_CANDIDATES });
  }
  const greenhouseList = /^Greenhouse could not list candidates \(HTTP (\d+)\)\.$/.exec(message);
  if (greenhouseList) {
    return t("importProviders.greenhouse.listFailed", { status: greenhouseList[1] ?? "" });
  }
  const httpFailure = /^(Lever|Ashby|Workable|JOIN) request failed \(HTTP (\d+)\)\.$/.exec(message);
  if (httpFailure) {
    const provider = (httpFailure[1] ?? "").toLowerCase();
    return t(`importProviders.${provider}.httpFailed`, { status: httpFailure[2] ?? "" });
  }
  return message;
}

/** Server-action wrapper: resolves the importer message in the recruiter's locale. */
export async function providerErrorMessage(message: string): Promise<string> {
  const t = await getTranslations("server.candidates");
  return translateProviderMessage(message, (key, values) => t(key as never, values as never));
}
