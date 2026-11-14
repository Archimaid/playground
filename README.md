# Archimaid Playground

Write ArchiMate® diagrams as text and watch them render as you type, at [try.archimaid.org](https://try.archimaid.org). It uses the published [`archimaid`](https://www.npmjs.com/package/archimaid) package and runs entirely in the browser: diagrams are never sent to a server.

- Live preview, with the last valid diagram kept on screen while the source has errors
- Errors and warnings underlined in the editor and listed below it, with their line and column
- Examples from the installed `archimaid` package, so they always match the renderer
- Share links that carry the compressed diagram in the URL hash
- SVG download and a light or dark diagram theme

## Development

Requires Node.js 22.18 or later.

```bash
npm install
npm run dev
```

| Command                | What it does                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                                                                      |
| `npm run build`        | Type-check and build into `dist`                                                               |
| `npm test`             | Unit tests for share links, the notation switch and the SEO files                              |
| `npm run test:browser` | Build, then smoke-test the built page in Chromium (run `npx playwright install chromium` once) |
| `npm run lint`         | Check formatting with Prettier                                                                 |
| `npm run og`           | Build, then render `public/og.png`, the social preview, from the playground's starter diagram  |

To pick up a new `archimaid` release, update the dependency and run `npm run test:browser`; it renders every packaged example. Run `npm run og` as well when the release changes how diagrams look, and commit the new image.

## Deploy to Cloudflare

The playground deploys as a Cloudflare Worker that serves static files. `wrangler.jsonc` points Wrangler at `dist`. Connect the repository to a Worker named `archimaid-playground` with these build settings:

| Setting               | Value                      |
| --------------------- | -------------------------- |
| Path (root directory) | empty, the repository root |
| Build command         | `npm ci && npm run build`  |
| Deploy command        | `npx wrangler deploy`      |
| Environment variable  | `NODE_VERSION=24`          |

Then add `try.archimaid.org` as a custom domain.

## Trademark

Archimaid is an independent project and is not affiliated with or endorsed by The Open Group. ArchiMate is a registered trademark of The Open Group in the United States and other countries.

## License

[MIT](LICENSE)
