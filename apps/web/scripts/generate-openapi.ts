import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const sourceUrl =
    process.env.HARLY_OPENAPI_URL ??
    "http://localhost:3000/api/v1/openapi.json";
  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(
      `OpenAPI download failed with HTTP ${response.status} from ${sourceUrl}. Is the dev server running?`,
    );
  }

  const document = (await response.json()) as {
    servers?: unknown[];
    [key: string]: unknown;
  };
  // The public docs describe every Harly installation, so never publish the
  // local dev URL from the instance that generated the snapshot.
  document.servers = [
    {
      url: "https://{instance}",
      variables: {
        instance: {
          default: "app.harly.dev",
          description: "Hostname of your Harly installation",
        },
      },
    },
  ];
  const outputPath = path.resolve("public/openapi.json");
  const docsOutputPath = path.resolve("../docs/openapi.json");
  const serialized = `${JSON.stringify(document, null, 2)}\n`;

  await Promise.all([
    fs.writeFile(outputPath, serialized, "utf8"),
    fs.writeFile(docsOutputPath, serialized, "utf8"),
  ]);

  console.log(`Downloaded ${sourceUrl}`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${docsOutputPath}`);
}

void main();
