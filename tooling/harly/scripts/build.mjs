import { chmod, mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
const output = new URL("../dist/index.js", import.meta.url);
await writeFile(output, "#!/usr/bin/env node\nimport '@harly/create/dist/index.js';\n");
await chmod(output, 0o755);
