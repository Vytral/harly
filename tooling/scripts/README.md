# Scripts

Repository maintenance scripts. They use only Node.js built-ins.

| Script | Purpose |
| --- | --- |
| `changelog-section.mjs` | Prints one version's section from a changelog. The release workflows use it as the GitHub Release body; see [RELEASING.md](../../RELEASING.md). |

Run the tests with `node --test tooling/scripts/*.test.mjs`. CI runs them too,
and they fail when the released app or CLI version has no changelog section.
