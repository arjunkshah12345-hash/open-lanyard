# Open Lanyard

[Live badge](https://arjunkshah12345-hash.github.io/open-lanyard/) · [Use this template](https://github.com/arjunkshah12345-hash/open-lanyard/generate)

A hanging badge you can grab, pull, swing, and spin. Real 3D geometry, a flexible woven strap, metal hardware, and a physical simulation. A quiet full-screen scene with a small live editor.

The default edition is **SuperCompress / Arjun Shah**, in a light studio. The strap has progressive tension: the farther you pull, the more firmly it resists, with a restrained recoil on release.

An MIT-licensed, standalone template built with Three.js and Rapier. Fork it or click **Use this template** to make your own badge. No backend, account, API key, or external model downloads are needed.

## Run

Requires Node.js 22.12+ (or a newer supported Node release).

```bash
git clone https://github.com/arjunkshah12345-hash/open-lanyard.git
cd open-lanyard
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. This version uses WebGL and a JavaScript build tool; opening `index.html` directly or using the old Python server will not work.

## Make it yours

Edit [`config.js`](config.js), or click **Make it yours** in the preview. The live editor changes the printed name, role, brand, website, serial number, strap lettering, and artwork color. **Download your config** exports a ready-to-use replacement for `config.js`. Edits remain in memory until exported; the page does not store or transmit them. Replace `public/brand-mark.svg` and the header in `index.html` for your own studio identity.

All badge geometry, hardware, woven material, and artwork are generated locally. There are no remote model files or texture requests. DM Sans and Platypi are bundled locally through Fontsource. Their SIL Open Font Licenses are included in `public/licenses/` and the production build. The SuperCompress chevron is a vector reconstruction of the mark at [supercompress.dev](https://supercompress.dev).

| File | Edit here for… |
| --- | --- |
| `config.js` | Default identity and color |
| `src/artwork.js` | Front/back print and woven strap artwork |
| `src/scene.js` | Badge geometry, hardware, lights, camera, pointer interaction |
| `src/lighting.js` | Analytic ray-traced soft shadows |
| `src/physics.js` | Rope joints, weight, damping, and motion |
| `src/main.js` | Customization controls and export |
| `styles.css` | The surrounding scene and editor |

## Interact

- Grab the badge with a mouse, pen, or finger, move it, and release.
- The circular arrow spins the badge; the reset button returns it to its starting pose.
- The sun button changes the studio background.
- Focus the scene and use arrows to swing, **Space** to spin, and **R** to reset.
- **Escape** closes the editor. Reduced-motion preferences reduce inertia and disable spins.

The simulation uses a fixed 120 Hz step with interpolation. The render resolution is capped at 2× device pixel ratio, and physics/rendering pause in hidden tabs. Hardware-accelerated WebGL2 is required; unsupported browsers receive a visible explanation.

Lighting combines physically based metal/laminate materials and studio environment reflections with **ray-traced direct-light shadows**. The shadow shader traces area-light samples against a rounded badge proxy and strap segments at reduced resolution, then applies a separable Gaussian filter for smooth penumbrae. This is not a full multi-bounce path tracer; reflections use the studio environment map. Shadow samples are reduced on touch devices to keep dragging responsive.

## Build and deploy

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` folder to any static host. `base: './'` supports hosting under a subdirectory. Source, lockfile, and assets belong in Git; `node_modules/`, `dist/`, and browser test captures do not.

### GitHub Pages

This repository deploys to GitHub Pages after the production build and interaction tests pass on `main`. For your own fork/template:

1. Open **Settings → Pages** and select **GitHub Actions** as the build source.
2. Enable Actions if GitHub prompts you, then push to `main` or manually run **CI and Pages**.
3. Open the deployment URL shown in the workflow's `github-pages` environment.

The workflow uses read-only permissions for checks and grants Pages/OIDC permissions only to the deployment job. Pull requests run tests but cannot deploy. The relative asset base also works if you rename the repository. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Verify

`npm test` checks physics stability, drag/release, elastic pull, actual desktop and touch interactions, editing and exporting, narrow/landscape layouts, and reduced motion. It starts and stops its own test server and saves browser captures under ignored `test-artifacts/`.

The test uses a fresh headless browser profile. On macOS it can use the installed Chrome binary; elsewhere run `npx playwright install chromium` first, or set `CHROME_PATH` to a browser executable. Normal development needs no test browser download.

`npm run test:production` builds and tests the actual deployment output. CI runs this with a fresh Chromium installation; screenshots are local diagnostics, not published assets.

## Credits and license

Original badge model, procedural artwork, and implementation, with SuperCompress branding for the default edition. The hanging-badge interaction was inspired by [Vercel's 3D event badge](https://vercel.com/blog/building-an-interactive-3d-event-badge-with-react-three-fiber). The implementation uses [Three.js](https://threejs.org/) and [Rapier](https://rapier.rs/), with no copied reference-badge artwork or GLB models. The code license does not grant rights to third-party trademarks.

MIT — see [LICENSE](LICENSE). Fork, customize, and use it in your own projects.
