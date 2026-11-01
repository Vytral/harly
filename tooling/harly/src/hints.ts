/**
 * Next steps for a failure, chosen from the message the command raised. A
 * failure that names its own remedy (port conflicts, DNS) renders it itself;
 * this covers the plain errors that would otherwise end the run with nothing
 * to do next. At most three lines, most useful first.
 */
export function errorHints(message: string, command: string): string[] {
  const text = message.toLowerCase();
  const hints: string[] = [];
  const add = (...lines: string[]) => hints.push(...lines);

  if (/no harly installation found|harly\.config\.json is missing|no saved installation/.test(text)) {
    add(
      `Pass the install directory: harly ${command} /path/to/harly`,
      "Not installed yet? Run harly init, or harly check to test this server first.",
    );
  } else if (/permission denied.*docker\.sock|docker\.sock.*permission denied/.test(text)) {
    add(
      "Your user cannot reach Docker. Add it to the docker group (sudo usermod -aG docker $USER, then log in again) or re-run with sudo.",
      "Run harly check to verify the rest of this server.",
    );
  } else if (/cannot connect to the docker daemon|is the docker daemon running|docker: command not found|spawnsync docker enoent|docker .*enoent/.test(text)) {
    add(
      "Docker is not running or not installed. Start it (sudo systemctl start docker) or install it: https://docs.docker.com/engine/install/",
      "Run harly check to verify Docker, Compose, disk and ports.",
    );
  } else if (/--yes is required/.test(text)) {
    add("This step needs a confirmation but there is no terminal. Re-run with --yes to accept it.");
  } else if (/release manifest|could not read the release/.test(text)) {
    add(
      "Check this server's connection to GitHub, then retry.",
      "To skip the lookup, name a version: harly update --to 0.2.0",
    );
  } else if (/timed out|readiness|did not become ready/.test(text)) {
    add(
      "Services can take a few minutes on first start. Check them with: harly status",
      "Inspect logs with: docker compose logs --tail=100 (from the install directory)",
      "Retry the start with: harly resume",
    );
  } else if (/eacces|eperm|operation not permitted/.test(text)) {
    add("A file or directory is not writable by this user. Check ownership of the install directory, or re-run with sufficient permissions.");
  } else if (/enospc|no space left/.test(text)) {
    add("The disk is full. Free some space (docker system prune removes unused images), then retry.");
  } else if (/is required|requires a value|missing/.test(text)) {
    add(`Run harly help${command === "menu" || command === "help" ? "" : ` ${command}`} to see the options this command needs.`);
  }
  return hints.slice(0, 3);
}
