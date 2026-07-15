# @harly/config

Shared, fail-fast runtime configuration for the web app, migrator, scheduler,
and self-hosting tooling. `HARLY_URL` is the canonical public origin;
`NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` remain temporary, deprecated
fallbacks.

Use `loadHarlyConfig()` at process startup and
`validateRuntimeFilesystem()` before serving traffic when local storage is
selected.
