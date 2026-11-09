# Localization

The English source catalogs are `apps/web/messages/en.json` and `packages/emails/messages/en.json`. The application uses `es.json`, `pt-BR.json`, `de.json`, `fr.json`, and `nl-NL.json` from the same directory for translations. Catalogs contain nested JSON messages grouped by namespace.

## Connect Crowdin

1. Create a file-based Crowdin project with English as its source language. Add Spanish, Portuguese (Brazil), German, French, and Dutch as target languages.
2. Install the GitHub integration in Crowdin and connect the repository in source and translation files mode. Select the branch to synchronize. The root `crowdin.yml` supplies the file paths and maps Brazilian Portuguese and Dutch to Harly's filenames.
3. Import any existing target translations into Crowdin. Check the import results and review their translation status, especially where a catalog contains English fallback text.
4. Run a test synchronization. Check that Crowdin exports each catalog to the expected filename and preserves its nested keys and ICU messages. Review the first pull request before enabling regular synchronization.
5. Invite translators and reviewers. Set the ICU syntax check to error in Crowdin's QA settings and agree on terminology and approval requirements.

Crowdin and its GitHub integration must be configured outside this repository. Do not commit API tokens. For local CLI use, provide credentials through Crowdin's supported environment variables or a separate local credentials file. See Crowdin's [GitHub integration guide](https://support.crowdin.com/github-integration/), [configuration reference](https://support.crowdin.com/developer/configuration-file/), and [QA settings](https://support.crowdin.com/project-settings/qa-checks/).

## Writing and reviewing messages

Add source messages in English and keep keys stable when their meaning has not changed. Use complete messages instead of joining fragments so translators can change word order. Preserve placeholders, rich text tags, and ICU syntax; translate the surrounding text and plural forms. Add context in Crowdin when a short label is ambiguous. Review translations in the interface for meaning, truncation, and plural behavior, then run the repository checks before merging a translation pull request.

When adding a language, update the application locale configuration and the Crowdin project. Add a mapping in `crowdin.yml` if its exported filename differs from Crowdin's two-letter code. Check the generated path before merging.

## Release status

The web app interface is migrated to translation messages and translated into Spanish, Brazilian Portuguese, German, French, and Dutch. Run `pnpm --filter web check:i18n` and `pnpm --filter web check:i18n:references` before merging; CI runs both.

People pick a language in three places: the language menu on the sign-in screens, the footer of onboarding, and the account page. The choice is stored in a browser cookie. On a first visit with no cookie, Harly uses the browser's `Accept-Language`, then English. The document `lang` attribute follows the active language. Saving the choice to the user's profile, and a workspace default language, are not implemented yet.

Known gaps to migrate next, because their text comes from shared helpers rather than components:

- Label maps and helper functions in `lib` and `features/*/shared` files (status, stage, interview type and mode, DSAR, automation catalog and templates, permission groups, integration registry).
- Error strings returned by server actions, which components show as received.
- Relative times produced by `date-fns` (for example "2 hours ago"), which still render in English.
- E-sign consent text and the legal page templates.

Do not advertise the target languages as complete until these are done and a native speaker has reviewed each language.
