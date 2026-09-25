export const meta = {
  name: 'site-improve',
  description: 'Analyze a change request for the Nepsis CH site, implement it, and loop a reviewer over every page, width and language until it passes',
  whenToUse: 'args: { request: "what to change", maxRounds?: 4 } — or { audit: true } to only review the current site',
  phases: [
    { title: 'Preflight', detail: 'toolchain, git state, baseline screenshots' },
    { title: 'Analyze', detail: 'fit check → clear instructions for all 4 locales' },
    { title: 'Act', detail: 'implement instructions / reviewer fixes, build' },
    { title: 'Review', detail: 'all pages × 6 widths × ro/fr/en/de' },
  ],
}

const A = args || {}
const AUDIT = !!A.audit
const REQUEST = (A.request || '').trim()
const MAX_ROUNDS = A.maxRounds || 4
if (!AUDIT && !REQUEST) throw new Error('Pass args.request (the change you want) or args.audit = true')

const HARNESS = 'node .claude/review/check-site.mjs'
const OUT = '.claude/review/out'

const SITE = `Project: the Nepsis Elveția website (the current working directory, an Astro 5 + Tailwind 4 static site).
- Locales: ro at the root (/), fr at /fr/, en at /en/, de at /de/. UI strings live in src/i18n/{ro,fr,en,de}.ts (fr/en/de are Partial — a missing key silently falls back to Romanian, which counts as a bug).
- Page text lives in src/content/pagini/<locale>/*.md; events/memories in src/content/evenimente and src/content/amintiri (untranslated entries fall back to ro by design).
- Components in src/components/, layout in src/layouts/Base.astro, pages in src/pages/[...lang]/, design tokens in src/styles/global.css.
- Readers are addressed INFORMALLY in every language: "tu" (ro), "tu" (fr), "you" (en), "du" (de).
- Legacy pages under public/*.html and public/congres2020/ are frozen — never edit them.
- The header nav switches from burger to horizontal at xl (1280px), and at 2xl (1536px) for German.
- Node is installed via nvm and is NOT on PATH in non-interactive shells: prefix every node/npm/npx command with \`source ~/.nvm/nvm.sh && \`.`

const CRITERIA = `Judge by objective, general web-development criteria:
- responsive: no horizontal scroll at 360–1440px, nothing clipped or overlapping, sensible reflow on phone;
- accessibility: WCAG AA contrast (4.5:1 text, 3:1 large text/UI), visible focus, tap targets ≥24px on phones (WCAG 2.2 AA; 44px preferred for primary buttons and nav), semantic HTML, alt text, correct <html lang>;
- readability: prose line length ≈ 45–75 characters, clear hierarchy, consistent spacing;
- consistency: reuse the existing tokens (brand-* palette, paper/ink, font-serif/font-sans) and existing component patterns rather than inventing new styles;
- performance: no heavy new dependencies, images via astro:assets or sized, no layout shift;
- language: every user-visible string exists in ro/fr/en/de, natural and idiomatic, informal register, same meaning as the Romanian.`

const ISSUE = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    page: { type: 'string' },
    locale: { type: 'string' },
    viewport: { type: 'string' },
    problem: { type: 'string' },
    fix_instruction: { type: 'string' },
  },
  required: ['severity', 'page', 'locale', 'viewport', 'problem', 'fix_instruction'],
}

const PREFLIGHT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blocker: { type: 'string', description: 'why the workflow cannot continue, empty if ok' },
    node_version: { type: 'string' },
    git_dirty: { type: 'boolean' },
    git_status: { type: 'string' },
    baseline_summary: { type: 'string', description: 'short digest of pre-existing problems from the baseline summary.md' },
  },
  required: ['ok', 'blocker', 'node_version', 'git_dirty', 'git_status', 'baseline_summary'],
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    fit: { type: 'string', enum: ['good', 'adapted'] },
    rationale: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'what was changed from the original request and why' },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          change: { type: 'string', description: 'precise description of what to do' },
          files_hint: { type: 'array', items: { type: 'string' } },
          locales: { type: 'array', items: { type: 'string' } },
          text: { type: 'object', description: 'exact new/changed strings per locale if any, e.g. {ro:"…",fr:"…",en:"…",de:"…"}' },
          acceptance: { type: 'string', description: 'how the reviewer can verify it' },
        },
        required: ['id', 'change', 'files_hint', 'locales', 'acceptance'],
      },
    },
    affected_pages: { type: 'array', items: { type: 'string' }, description: 'paths without locale prefix, e.g. "/", "/contact/"' },
  },
  required: ['fit', 'rationale', 'warnings', 'instructions', 'affected_pages'],
}

const ACT_SCHEMA = {
  type: 'object',
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    build_ok: { type: 'boolean' },
    notes: { type: 'string', description: 'anything you could not do, or deviations' },
  },
  required: ['files_changed', 'summary', 'build_ok', 'notes'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'update'] },
    instructions_met: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, met: { type: 'boolean' }, note: { type: 'string' } },
        required: ['id', 'met', 'note'],
      },
    },
    issues: { type: 'array', items: ISSUE },
    summary: { type: 'string' },
  },
  required: ['verdict', 'instructions_met', 'issues', 'summary'],
}

/* ---------------- Preflight ---------------- */
phase('Preflight')
const pre = await agent(
  `${SITE}

You are the PREFLIGHT step of a site-improvement workflow. Do only these checks, change no source files:
1. Run \`node --version\` and \`npm --version\`. If Node is missing or < 20, stop: ok=false, blocker="Node.js 20+ is not installed — install it (e.g. nvm install 22) and rerun".
2. If node_modules/ is missing, run \`npm install\`. If \`node -e "require.resolve('playwright-core')"\` fails, run \`npm install --no-save playwright-core\` (the system Google Chrome is used; do NOT download browsers).
3. Run \`git status --short\` and report it (git_dirty = any output).
${AUDIT
    ? '4. Skip the baseline run (audit mode); baseline_summary = "".'
    : `4. Run the BASELINE: \`${HARNESS} --out ${OUT}/baseline\` (takes a few minutes). If the build fails, ok=false with the error tail as blocker. Otherwise read ${OUT}/baseline/summary.md and give a compact digest of the pre-existing problems in baseline_summary (they are not the change author's fault).`}`,
  { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT_SCHEMA, effort: 'low' }
)
if (!pre) throw new Error('Preflight agent failed')
if (!pre.ok) return { stopped: 'preflight', blocker: pre.blocker, git_status: pre.git_status }
if (pre.git_dirty) log(`Working tree already has changes:\n${pre.git_status}`)

/* ---------------- Audit-only mode ---------------- */
if (AUDIT) {
  phase('Review')
  const audit = await agent(
    `${SITE}

${CRITERIA}

You are the REVIEWER in AUDIT mode: no change was made; list what the current site needs. Never edit project files.
1. Run \`${HARNESS} --out ${OUT}/audit\`, then read ${OUT}/audit/summary.md (and report.json for detail).
2. Look at screenshots (Read tool on the .jpg files): every page at 390 and 1440 in ro, plus home, evenimente, contact and devino-membru at 360/768/1024/1280 in all 4 locales, plus every menu-390.jpg.
3. Review language quality: compare src/i18n/{fr,en,de}.ts and src/content/pagini/{fr,en,de} to Romanian — missing keys, awkward or wrong translations, formal register ("vous"/"Sie"/"dumneavoastră") where informal is required.
Return verdict "update" if anything blocker/major exists, else "pass". instructions_met = []. Make every fix_instruction concrete (file + what to change).`,
    { label: 'audit', phase: 'Review', schema: REVIEW_SCHEMA, effort: 'high' }
  )
  return { mode: 'audit', git_status: pre.git_status, ...audit, screenshots: `${OUT}/audit` }
}

/* ---------------- Analyze ---------------- */
phase('Analyze')
const analysis = await agent(
  `${SITE}

${CRITERIA}

You are the ANALYZER. The user's change request is:
<<<
${REQUEST}
>>>

Pre-existing problems on the site (baseline, before any change):
${pre.baseline_summary || '(none reported)'}

Read the code and content that the request touches. Do not edit anything. Then:
1. Decide whether the request is a good fit aesthetically (matches the site's existing visual language and the criteria above) and functionally (works on every width, in every locale, does not break other pages).
2. If it is a poor fit, do NOT refuse: adapt it to the closest version that fits, set fit="adapted", and put each deviation in warnings (what the user asked, what you'll do instead, why).
3. Break it into precise, independently checkable instructions for an implementer who has not seen the request: which files, which components/classes/tokens to use, exact behaviour at phone/tablet/desktop widths.
4. For any user-visible text, write the exact strings for ro, fr, en and de yourself in the "text" field — natural, idiomatic, informal register (tu/tu/you/du), same meaning.
5. Give each instruction an acceptance test the reviewer can check from screenshots or the code.
6. List affected_pages (paths without the locale prefix).`,
  { label: 'analyze', phase: 'Analyze', schema: ANALYSIS_SCHEMA, effort: 'high' }
)
if (!analysis) throw new Error('Analyzer failed')
log(`Fit: ${analysis.fit} — ${analysis.instructions.length} instruction(s)${analysis.warnings.length ? `; warnings: ${analysis.warnings.join(' | ')}` : ''}`)

const instructionsText = JSON.stringify(analysis.instructions, null, 2)

/* ---------------- Act ⇄ Review loop ---------------- */
let fixes = null
let lastReview = null
const filesChanged = new Set()
let round = 0

while (round < MAX_ROUNDS) {
  round++

  phase('Act')
  const act = await agent(
    `${SITE}

You are the ACTION agent (round ${round}). Implement exactly the following, nothing more.

Original instructions from the analyzer:
${instructionsText}

${fixes
      ? `The reviewer checked your previous round and requires these fixes (they take priority; keep what already works):
${JSON.stringify(fixes, null, 2)}`
      : 'This is the first round: implement all instructions.'}

Rules:
- Match the surrounding code: existing Tailwind tokens and component patterns, comment style (the codebase comments in Romanian).
- Every user-visible string goes into ALL of src/i18n/{ro,fr,en,de}.ts (or the matching src/content/pagini/<locale>/ files) — use the analyzer's exact strings where given.
- Do not edit public/*.html, public/congres2020/, deploy workflows, or .claude/review/.
- Do not commit, do not create branches.
- Finish by running \`npm run build\`; it must succeed (fix your own errors). You may spot-check with \`${HARNESS} --out ${OUT}/act-${round} --pages <path> --locales ro,de\`.
- Do not declare the work finished or good — a separate reviewer will judge it. Just report what you changed.`,
    { label: `act:${round}`, phase: 'Act', schema: ACT_SCHEMA }
  )
  if (!act) { log(`Action agent failed in round ${round}`); break }
  act.files_changed.forEach((f) => filesChanged.add(f))
  log(`Round ${round}: changed ${act.files_changed.length} file(s), build ${act.build_ok ? 'ok' : 'FAILED'}`)

  phase('Review')
  const review = await agent(
    `${SITE}

${CRITERIA}

You are the REVIEWER (round ${round}). You never edit project files. Be strict but fair: judge the change, not pre-existing problems.

User request: <<<${REQUEST}>>>
Analyzer instructions (the contract):
${instructionsText}
Action agent says it changed: ${JSON.stringify([...filesChanged])}
Its notes: ${act.notes || '-'}

Steps:
1. \`git diff\` (and \`git status --short\` for new files) to see the actual change.
2. Run \`${HARNESS} --out ${OUT}/round-${round}\`. Read ${OUT}/round-${round}/summary.md and compare with ${OUT}/baseline/summary.md — only problems that are NEW or related to the request can block.
3. Look at screenshots with the Read tool (.jpg files under ${OUT}/round-${round}/<locale>/<page>/<width>.jpg; page "home" = "/"):
   - affected pages ${JSON.stringify(analysis.affected_pages)} at 360, 768, 1024, 1280 and 1440 in ro, fr, en and de;
   - every other page at 390 in ro and de (German is longest);
   - menu-390.jpg for every locale.
   Compare with the same file under ${OUT}/baseline/ when something looks off.
4. Check each instruction's acceptance test → instructions_met.
5. Language: read every changed/added string in all four locales — grammar, natural phrasing, same meaning as ro, informal register (tu/tu/you/du), nothing left in Romanian on fr/en/de.
Severity: blocker = broken build/page/layout or missing locale; major = visible defect at some width/locale, unmet instruction, wrong or formal translation; minor = polish.
verdict = "pass" only if every instruction is met and there are no blocker/major issues. Every fix_instruction must be concrete enough for an implementer (file, element, exact change, exact string).`,
    { label: `review:${round}`, phase: 'Review', schema: REVIEW_SCHEMA, effort: 'high' }
  )
  if (!review) { log(`Reviewer failed in round ${round}`); break }
  lastReview = review

  const blocking = review.issues.filter((i) => i.severity !== 'minor')
  const unmet = review.instructions_met.filter((i) => !i.met)
  log(`Round ${round}: ${review.verdict.toUpperCase()} — ${blocking.length} blocking, ${review.issues.length - blocking.length} minor, ${unmet.length} unmet instruction(s)`)

  if (review.verdict === 'pass' || (blocking.length === 0 && unmet.length === 0)) break
  fixes = {
    issues: blocking,
    unmet_instructions: unmet,
  }
}

const passed = !!lastReview && lastReview.issues.every((i) => i.severity === 'minor') && lastReview.instructions_met.every((i) => i.met)

return {
  request: REQUEST,
  fit: analysis.fit,
  warnings: analysis.warnings,
  rationale: analysis.rationale,
  rounds: round,
  final_verdict: passed ? 'pass' : `not passed after ${round} round(s)`,
  files_changed: [...filesChanged],
  review_summary: lastReview?.summary,
  outstanding_issues: lastReview?.issues || [],
  unmet_instructions: (lastReview?.instructions_met || []).filter((i) => !i.met),
  screenshots: `${OUT}/round-${round}`,
  baseline: `${OUT}/baseline`,
  note: 'Changes are uncommitted — review with git diff and commit yourself.',
}
