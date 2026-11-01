# Third-party notices

Harly is released under the [MIT License](LICENSE). It depends on open-source
packages under their own licenses, listed in `pnpm-lock.yaml`. Almost all are
permissive (MIT, ISC, BSD, Apache-2.0). The ones below carry a weak-copyleft
license, so their terms are called out here. Harly does not modify any of them
and links to them only through their published packages.

| Package | License | How Harly uses it |
| --- | --- | --- |
| `dompurify` | MPL-2.0 or Apache-2.0 (your choice) | Sanitizes rich text and HTML before it is rendered. Used under Apache-2.0. |
| `lightningcss` | MPL-2.0 | CSS transform used by the Tailwind build. Build-time only. |
| `@resvg/resvg-js` | MPL-2.0 | Renders SVG to PNG (for example social images) as a native module. |
| `@img/sharp-libvips-*` | LGPL-3.0-or-later | The libvips build that `sharp` loads dynamically for image processing. |

## What the licenses ask of you

* **MPL-2.0** is file-level copyleft. It applies to changes made to the MPL
  licensed files themselves. Using the packages unmodified, as Harly does,
  places no obligation on the rest of the code. The source of each package is
  available from its registry page and repository.
* **LGPL-3.0** is satisfied for `@img/sharp-libvips-*` because the library is a
  separate, dynamically linked shared object that you can replace. If you
  redistribute a Harly container image, the library source is available from
  <https://github.com/lovell/sharp-libvips> and <https://github.com/libvips/libvips>,
  and you may substitute your own build of it.

## Generating the full list

```bash
pnpm licenses list --prod
```

The container image also carries operating system packages (Alpine Linux,
PostgreSQL, Caddy) under their own licenses.
