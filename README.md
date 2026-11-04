# SugboStart

A local business registration demo built from all eight supplied HTML references. It uses vanilla JavaScript modules, Vite, and compiled Tailwind CSS. The supplied profile photo, Public Sans fonts, and SVG icons are bundled locally. Desktop screens use a sidebar and a two-column application layout.

## Run

Requires Node.js 20.19+ or 22.12+.

    npm install
    npm run dev

Open http://127.0.0.1:5173/. The default screen is the signup/login welcome page, introduced by a brief branded startup animation once per browser session. Reduced-motion preferences are respected. The roadmap is available at /roadmap.html after starting a demo session.

## Screens

| Route | Reference |
| --- | --- |
| /roadmap.html | 1 — Compliance roadmap |
| /clearances.html | 2 — LGU clearance pipeline |
| /vault.html | 3 — Document vault |
| / (also /welcome.html) | 4 — Welcome, signup and login |
| /login.html | 5 — Sign in |
| /register.html | 6 — Registration |
| /verify.html | 7 — Identity verification |
| /apply.html | 8 — Clearance application |

## Working interactions

- Dashboard tabs, account menu, welcome, registration, and explicitly labeled demo login. Protected pages require a local demo session.
- Form validation with an error summary, password visibility, demo autofill, OTP paste/advance/backspace, and a resend cooldown. A full sample profile carries through the app.
- Demo identity verification: use **729123**, then select **Use demo identity** in the scan dialog.
- Flat sample fees: express delivery (PHP450) or pick-up (PHP300). These are demonstration amounts, not official assessments or capitalization tiers.
- Draft saving, reload restoration, a real review step, and a unique local submission reference. Submitted applications and attachments are locked until demo data is cleared.
- PDF/JPEG/PNG attachments with content-signature checks, a 10 MB limit, IndexedDB persistence, preview/download/removal. Progress reflects actual files; the vault starts empty.
- Blank, single-page placeholder PDF downloads with document-specific filenames, credential QR codes, and public sample-record lookup.
- Copy identifiers, future sample calendar reminders with alarms, and a compliance ZIP containing actual attachments and five blank placeholder PDFs. Exports show loading states.
- Dialog keyboard support, notifications visible inside dialogs, guide-language toggle, and map link.
- Profile → Clear demo data removes this browser's saved drafts and uploads.

## Scope

This is a frontend demonstration with sample business records. Authentication, PhilSys/eGovPH, biometric verification, payments, SMS, and LGU submission are not connected. No actual permits are issued or verified. Generated document PDFs are intentionally blank for now; their filenames and the surrounding interface identify them as demo placeholders. Uploaded originals retain their contents.

Passwords are never stored. Profiles, drafts, and submission metadata stay in localStorage; uploads stay in IndexedDB. The demo session and pending verification profile use sessionStorage. Remembered login identifiers expire after 30 days. Use sample information.

The source references contain conflicting identifiers and fees. The application uses BN-2024-98124 as a fictional sample reference and PHP300 as the flat sample base fee. Displayed timelines and calendar dates are planning examples, not independently verified guidance or statutory deadlines.

Fonts, SVG icons, the supplied photo, Tailwind CSS, and application dependencies are bundled locally for production. The photo is at public/images/profile-photo.jpg and fills static picture placeholders. Uploaded documents and generated QR codes retain their own contents. No font or image CDN is required.

## Verify and build

    npm test
    npx playwright install chromium
    npm run test:e2e
    npm run build
    npm run preview

Unit tests cover validation, fees, upload signatures, calendar boundaries, distinct sample content, and session behavior. Browser tests cover account and application flows, persistence, actual downloads, layouts, and axe accessibility checks. Set PLAYWRIGHT_BASE_URL to test a deployed subdirectory.

## Implementation

- Vite multi-page app, JavaScript modules, compiled Tailwind CSS.
- Root HTML pages are the canonical editable sources; references/ retains the original designs only.
- src/shell.js supplies the shared header, navigation, demo notice, dialog, and toast container.
- src/session.js handles the local demo session and allowlisted profile; src/startup.js handles the once-per-session animation.
- src/domain.js contains pure validation and fee calculation.
- src/auth.js, application.js, uploads.js, documents.js handle feature behavior.
- src/ui.js provides safe DOM construction, dialogs, and local storage helpers.
- src/style.css contains responsive and accessibility refinements; src/icons.js provides inline SVG icons.

prepare.mjs is a retired, non-writing compatibility stub and cannot overwrite page edits. Controls use stable IDs and data-action attributes; preserve those when changing text. Routes and Vite's relative base support hosting the production build in a subdirectory.

The source ZIP excludes node_modules, dist, browser test artifacts, and temporary scripts. Run npm install after extracting it; npm run build generates the production output.

## GitHub Pages deployment

The intended public site is https://gworgiesarmago-ux.github.io/gov-demo/. Enable **GitHub Actions** as the publishing source in the repository's **Settings → Pages** before the first deployment.

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and can also be started manually from the **Actions** tab. It installs the locked dependencies with Node.js 24, runs the unit tests, builds the app, and publishes only `dist` after the build succeeds. Vite's relative asset paths preserve navigation and images under `/gov-demo/`.

The repository source and deployed demo are public. Deployment does not include local browser profiles, drafts, or uploaded documents; those remain in each visitor's browser. Local deployment credentials, dependencies, generated builds, and browser test artifacts are excluded from source control by `.gitignore`.

## Vercel deployment

vercel.json configures the Vite build and dist output directory, preserving the app's .html URLs. .vercelignore excludes dependencies, build output, tests, and the original design references from source uploads. No server environment variables are required.

    npx vercel login
    npx vercel deploy --prod --yes --project gov-demo --create-if-missing

The production address depends on availability in the connected account. Public visitors receive a fresh local demo; your browser's saved profile and attachments are not part of the deployment.

Temporary hosting can publish without signing in, using a Vercel-generated address that expires unless claimed. For this Windows setup, build locally and deploy a separate folder containing only the dist files with `npx vercel deploy --temporary --yes`. The prepared static copy is in the sibling gov-demo folder. Redeploy from that same folder to update the temporary project before it expires. Do not publish or archive its .vercel folder, which contains local deployment credentials.

