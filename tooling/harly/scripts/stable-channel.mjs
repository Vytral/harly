const stableVersionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

function parseStableVersion(version) {
  const match = stableVersionPattern.exec(version);
  return match ? match.slice(1).map(BigInt) : null;
}

function compareStableVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  if (!leftParts || !rightParts) return 0;

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

export function decideStableChannel(releaseVersion, publishedReleaseTags) {
  const normalizedCandidate = releaseVersion.replace(/^v/, "");
  if (!parseStableVersion(normalizedCandidate)) {
    throw new Error(`Invalid stable release version: ${releaseVersion}`);
  }

  const stableVersions = publishedReleaseTags
    .map((tag) => {
      const version = tag.trim().replace(/^v/, "");
      return parseStableVersion(version) ? version : null;
    })
    .filter(Boolean);
  stableVersions.push(normalizedCandidate);
  stableVersions.sort(compareStableVersions);

  const highest = stableVersions.at(-1);
  return { owns: normalizedCandidate === highest, highest };
}

if (process.argv[1]?.endsWith("/stable-channel.mjs")) {
  const releaseVersion = process.argv[2];
  if (!releaseVersion) throw new Error("A release version argument is required.");

  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  const decision = decideStableChannel(releaseVersion, input.split(/\r?\n/));
  process.stdout.write(`${decision.owns}\t${decision.highest}`);
}
