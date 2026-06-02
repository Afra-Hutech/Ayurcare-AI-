#!/usr/bin/env node
/**
 * prepare-mobile-build.js
 *
 * Run from your project root (ayurcare-ai-main/):
 *   node prepare-mobile-build.js
 *
 * What this does:
 *   1. Creates .env.production for both React frontends
 *   2. Creates an isolated mobile workspace one level UP (../ayurcare-mobile-build)
 *   3. Builds both frontends via `npm run build`
 *   4. Copies compiled dist/ folders into the mobile workspace
 *   5. Writes assetlinks.json placeholder + Bubblewrap instructions
 *   6. Updates .gitignore so Android assets never enter your web repo
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────────────────────────────────────
const ROOT         = __dirname;                                          // ayurcare-ai-main/
const MOBILE_DIR   = path.resolve(ROOT, '..', 'ayurcare-mobile-build'); // sibling directory

const PORTALS = {
  patient: {
    label:    'Patient Portal (AyurCare)',
    cwd:      path.join(ROOT, 'ayurveda-app', 'frontend_chat'),
    distDest: path.join(MOBILE_DIR, 'patient-portal-dist'),
    appName:  'AyurCare',
    shortName:'AyurCare',
    pkg:      'com.ayurcare.patientapp',
    color:    '#667eea',
    envFile:  '.env.production',
    envContent: (domain, botDomain) => `# ── AyurCare Patient Portal — PRODUCTION ──────────────────────────────────
# Fill in your deployed HTTPS domains before running this script again.
# ──────────────────────────────────────────────────────────────────────────

# Main data API (doctor-portal Node/Express server)
VITE_API_URL=${domain}/api

# AI bot-brain API — use SAME domain if bot-brain is proxied through Node
# (Option A, recommended): proxy /api/ai/* through Node → set same domain
VITE_CHAT_API_URL=${domain}/api/ai

# Patient auth base — same as your data API domain
VITE_AUTH_API_URL=${domain}
`,
  },

  doctor: {
    label:    'Doctor Portal (DocConnect)',
    cwd:      path.join(ROOT, 'doctor-portal'),
    distDest: path.join(MOBILE_DIR, 'doctor-portal-dist'),
    appName:  'DocConnect',
    shortName:'DocConnect',
    pkg:      'com.docconnect.doctorportal',
    color:    '#0ea5e9',
    envFile:  '.env.production',
    envContent: (domain) => `# ── DocConnect Doctor Portal — PRODUCTION ─────────────────────────────────
# Fill in your deployed HTTPS domain before running this script again.
# ──────────────────────────────────────────────────────────────────────────

# Backend API root (doctor-portal Node server with HTTPS)
VITE_API_URL=${domain}/api
`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';

const log   = (msg) => console.log(`${GREEN}  ✅  ${msg}${RESET}`);
const warn  = (msg) => console.log(`${YELLOW}  ⚠️   ${msg}${RESET}`);
const info  = (msg) => console.log(`${CYAN}  ℹ️   ${msg}${RESET}`);
const step  = (n, msg) => console.log(`\n${BOLD}${CYAN}── Step ${n}: ${msg} ──${RESET}`);
const fatal = (msg) => { console.error(`${RED}  ❌  FATAL: ${msg}${RESET}`); process.exit(1); };

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Copy a directory tree recursively. */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

/** Run a shell command, streaming output to the parent terminal. */
function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

/** Check whether a .env.production file still has placeholder URLs. */
function hasPlaceholders(filePath) {
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, 'utf8').includes('YOUR_');
}

/** Append a line to .gitignore (idempotent). */
function addToGitignore(line) {
  const gi = path.join(ROOT, '.gitignore');
  const current = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!current.includes(line)) {
    fs.appendFileSync(gi, `\n# Mobile build — kept outside web git tracking\n${line}\n`);
    log(`.gitignore updated with: ${line}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ OPTIONAL DOMAIN ARGS
//   node prepare-mobile-build.js --domain https://api.mysite.com
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const domainIdx = args.indexOf('--domain');
const DOMAIN = domainIdx !== -1 ? args[domainIdx + 1] : 'https://YOUR_BACKEND_DOMAIN.com';
const PLACEHOLDER = DOMAIN.includes('YOUR_');

console.log(`
${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗
║        AyurCare — Mobile Build Preparation Script           ║
╚══════════════════════════════════════════════════════════════╝${RESET}
  Project root : ${ROOT}
  Mobile dir   : ${MOBILE_DIR}
  Backend URL  : ${PLACEHOLDER ? `${YELLOW}${DOMAIN} ← PLACEHOLDER${RESET}` : `${GREEN}${DOMAIN}${RESET}`}
`);

if (PLACEHOLDER) {
  warn('No --domain flag supplied. .env.production files will contain placeholder URLs.');
  warn('Re-run with your real domain once deployed:');
  warn('  node prepare-mobile-build.js --domain https://api.your-domain.com');
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1  — .env.production for each portal
// ─────────────────────────────────────────────────────────────────────────────
step(1, 'Creating .env.production files');

for (const [key, portal] of Object.entries(PORTALS)) {
  const envPath = path.join(portal.cwd, portal.envFile);
  if (fs.existsSync(envPath) && !hasPlaceholders(envPath) && PLACEHOLDER) {
    info(`${portal.label}: ${envPath} already has real URLs — not overwriting`);
  } else {
    const content = key === 'patient'
      ? portal.envContent(DOMAIN, DOMAIN)
      : portal.envContent(DOMAIN);
    fs.writeFileSync(envPath, content, 'utf8');
    log(`Created: ${envPath}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2  — Create isolated mobile workspace
// ─────────────────────────────────────────────────────────────────────────────
step(2, 'Creating isolated mobile workspace');

const workspaceDirs = [
  '',                      // root
  'patient-portal-dist',
  'doctor-portal-dist',
  'android-patient',       // bubblewrap output for patient APK
  'android-doctor',        // bubblewrap output for doctor APK
  'assetlinks',
];
for (const sub of workspaceDirs) {
  fs.mkdirSync(path.join(MOBILE_DIR, sub), { recursive: true });
}
log(`Workspace created: ${MOBILE_DIR}`);

// Keep it out of the web repo
addToGitignore('../ayurcare-mobile-build');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 & 4  — Build frontends and copy dist/ to workspace
// ─────────────────────────────────────────────────────────────────────────────
step(3, 'Building frontends (npm run build)');

for (const portal of Object.values(PORTALS)) {
  console.log(`\n  ${BOLD}Building: ${portal.label}${RESET}`);

  if (!fs.existsSync(path.join(portal.cwd, 'package.json'))) {
    fatal(`package.json not found in ${portal.cwd}`);
  }

  if (!fs.existsSync(path.join(portal.cwd, 'node_modules'))) {
    warn(`node_modules missing — running npm install in ${portal.cwd}`);
    run('npm install', portal.cwd);
  }

  try {
    run('npm run build', portal.cwd);
  } catch {
    fatal(`Build failed for ${portal.label}. Fix errors above, then re-run this script.`);
  }

  const distSrc = path.join(portal.cwd, 'dist');
  if (fs.existsSync(distSrc)) {
    copyDir(distSrc, portal.distDest);
    log(`Copied dist/ → ${portal.distDest}`);
  } else {
    warn(`No dist/ folder found after build — check vite.config.js`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5  — assetlinks.json placeholders
// ─────────────────────────────────────────────────────────────────────────────
step(5, 'Writing assetlinks.json placeholders');

const makeAssetlinks = (pkg) => JSON.stringify([
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: pkg,
      sha256_cert_fingerprints: [
        'REPLACE_WITH_SHA256_FINGERPRINT_FROM_YOUR_KEYSTORE',
      ],
    },
  },
], null, 2);

fs.writeFileSync(
  path.join(MOBILE_DIR, 'assetlinks', 'assetlinks-patient.json'),
  makeAssetlinks(PORTALS.patient.pkg), 'utf8',
);
fs.writeFileSync(
  path.join(MOBILE_DIR, 'assetlinks', 'assetlinks-doctor.json'),
  makeAssetlinks(PORTALS.doctor.pkg), 'utf8',
);
log('assetlinks placeholders written');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6  — Write Bubblewrap next-steps guide
// ─────────────────────────────────────────────────────────────────────────────
step(6, 'Writing bubblewrap-next-steps.md');

const guide = `# Bubblewrap — Next Steps
> Generated by prepare-mobile-build.js

---

## Prerequisites (install once)

\`\`\`powershell
npm install -g @bubblewrap/cli
\`\`\`

Bubblewrap also needs a JDK (Java 11+) and the Android SDK.
It will prompt to auto-download them on first run.

---

## 1. Deploy your web apps first

Both portals must be live at HTTPS URLs before you wrap them.
Update the placeholder URLs and rebuild:

\`\`\`powershell
# from your project root (ayurcare-ai-main/)
node prepare-mobile-build.js --domain https://api.your-domain.com
\`\`\`

---

## 2. Wrap the Patient Portal (recommended for mobile)

\`\`\`powershell
cd ${MOBILE_DIR}\\android-patient
bubblewrap init --manifest https://YOUR_PATIENT_DOMAIN.com/manifest.json
\`\`\`

### Interactive prompts — Patient Portal
| Prompt                        | Value                                    |
|-------------------------------|------------------------------------------|
| Application name              | ${PORTALS.patient.appName}               |
| Short name                    | ${PORTALS.patient.shortName}             |
| Android package name          | ${PORTALS.patient.pkg}                   |
| Starting URL                  | https://YOUR_PATIENT_DOMAIN.com/         |
| Theme colour                  | ${PORTALS.patient.color}                 |
| Background colour             | #ffffff                                  |
| Display mode                  | standalone                               |
| Orientation                   | portrait                                 |
| Version (integer)             | 1                                        |
| Version name (string)         | 1.0.0                                    |
| Existing signing key?         | No (generate new on first build)         |

---

## 3. Wrap the Doctor Portal (optional separate APK)

\`\`\`powershell
cd ${MOBILE_DIR}\\android-doctor
bubblewrap init --manifest https://YOUR_DOCTOR_DOMAIN.com/manifest.json
\`\`\`

### Interactive prompts — Doctor Portal
| Prompt                        | Value                                    |
|-------------------------------|------------------------------------------|
| Application name              | ${PORTALS.doctor.appName}                |
| Short name                    | ${PORTALS.doctor.shortName}              |
| Android package name          | ${PORTALS.doctor.pkg}                    |
| Starting URL                  | https://YOUR_DOCTOR_DOMAIN.com/          |
| Theme colour                  | ${PORTALS.doctor.color}                  |
| Background colour             | #ffffff                                  |
| Display mode                  | standalone                               |
| Orientation                   | portrait                                 |

---

## 4. Build the APK

\`\`\`powershell
bubblewrap build
\`\`\`

The signed APK appears at: \`android-patient\\app-release-signed.apk\`

---

## 5. assetlinks.json (REQUIRED for TWA)

Your APK will show the browser URL bar unless assetlinks.json is served
at the exact URL: \`https://YOUR_DOMAIN.com/.well-known/assetlinks.json\`

1. Get your SHA-256 fingerprint:
\`\`\`powershell
keytool -list -v -keystore android.keystore -alias android
\`\`\`

2. Edit the placeholder at:
   \`${MOBILE_DIR}\\assetlinks\\assetlinks-patient.json\`

3. Upload it to your web server at:
   \`https://YOUR_PATIENT_DOMAIN.com/.well-known/assetlinks.json\`

---

## Separation summary

| Location                        | What it is                          | In git? |
|---------------------------------|-------------------------------------|---------|
| ayurcare-ai-main/               | Source code                         | ✅ Yes  |
| ayurcare-ai-main/doctor-portal/ | Doctor portal source                | ✅ Yes  |
| ayurcare-ai-main/ayurveda-app/  | Patient portal source               | ✅ Yes  |
| ayurcare-mobile-build/          | Compiled builds + Android APKs      | ❌ No   |

The \`ayurcare-mobile-build/\` directory is referenced in .gitignore.
`;

fs.writeFileSync(path.join(MOBILE_DIR, 'bubblewrap-next-steps.md'), guide, 'utf8');
log('bubblewrap-next-steps.md written');

// ─────────────────────────────────────────────────────────────────────────────
// DONE
// ─────────────────────────────────────────────────────────────────────────────
const hasPH = PLACEHOLDER ? `${YELLOW}⚠️  URLs are placeholders — re-run with --domain once deployed${RESET}` : `${GREEN}✅ Real domain used — builds contain correct API URLs${RESET}`;

console.log(`
${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════╗
║                    BUILD PREPARATION DONE                       ║
╚══════════════════════════════════════════════════════════════════╝${RESET}

  ${hasPH}

  ${BOLD}Mobile workspace:${RESET}
  ${CYAN}${MOBILE_DIR}${RESET}

  ${BOLD}Contents:${RESET}
  ├── patient-portal-dist/      ← compiled patient web app
  ├── doctor-portal-dist/       ← compiled doctor web app
  ├── android-patient/          ← run: bubblewrap init (patient)
  ├── android-doctor/           ← run: bubblewrap init (doctor)
  ├── assetlinks/
  │   ├── assetlinks-patient.json
  │   └── assetlinks-doctor.json
  └── bubblewrap-next-steps.md  ← full instructions with your values

  ${BOLD}Next command:${RESET}
  ${CYAN}cd ..\ayurcare-mobile-build\android-patient${RESET}
  ${CYAN}bubblewrap init --manifest https://YOUR_PATIENT_DOMAIN.com/manifest.json${RESET}

  ${BOLD}Full guide:${RESET}
  ${CYAN}${path.join(MOBILE_DIR, 'bubblewrap-next-steps.md')}${RESET}
`);
