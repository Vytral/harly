export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  const {
    formatConfigError,
    loadHarlyConfig,
    validateRuntimeFilesystem,
  } = await import("@harly/config");
  try {
    const config = loadHarlyConfig();
    await validateRuntimeFilesystem(config);
  } catch (error) {
    throw new Error(`Invalid Harly runtime configuration:\n${formatConfigError(error)}`);
  }
}
