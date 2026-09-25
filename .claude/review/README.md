# site-improve workflow

A loop of three agents for changing the site safely:

1. **Analyzer**: decides whether the request fits, aesthetically and functionally (by general web criteria: responsive design, WCAG AA, readability, consistency with the existing tokens, performance). If it doesn't fit, the Analyzer adapts it and adds a warning. It then writes precise instructions, including exact strings for ro, fr, en and de in the informal register (tu/tu/you/du).
2. **Action**: implements the instructions (or the Reviewer's fixes) and runs `npm run build`.
3. **Reviewer**: runs `check-site.mjs`, looks at the screenshots, and checks the translations. It either **passes** the change, which ends the loop, or asks for an **update** with concrete fixes, which go back to Action. After `maxRounds` (4 by default) the loop stops and reports what's still open.

Changes stay uncommitted. Review them with `git diff`.

## Running it

In Claude Code, from `nepsis/`:

- `run the site-improve workflow: <what you want changed>`
- `run the site-improve workflow in audit mode`: only reviews the current site and lists what needs fixing

## Requirements

- Node.js 20+ (`nvm install 22`)
- Google Chrome (already installed at `/usr/bin/google-chrome`)
- `npm install`, then `npm install --no-save playwright-core`. Preflight does both automatically.

## The harness on its own

```bash
npm run review                                   # everything → .claude/review/out/latest/
node .claude/review/check-site.mjs --out .claude/review/out/x --pages /,/contact/ --locales ro,de --no-build
```

It checks 41 pages (11 routes × 4 languages; 404 only in ro) at 360, 390, 768, 1024, 1280 and 1440px, and writes:

- `summary.md`, readable by a person, with these checks:
  - horizontal overflow, plus the elements that cause it
  - HTTP errors, console errors, broken images
  - wrong `<html lang>`
  - UI text left in Romanian on fr/en/de pages
  - tap targets smaller than 24px (WCAG 2.2 AA)
  - whether the mobile menu opens
  - i18n keys missing between languages
- `report.json`, with all the details
- `<locale>/<page>/<width>.jpg`: full-page screenshots, plus `menu-390.jpg` showing the open menu
