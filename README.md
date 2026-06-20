# comeandget.us

A single-page static cryptographic ARG. Glitched-hack aesthetic, cryptid /
mythological clue system, zero runtime dependencies. The page hides a layered
puzzle whose solution is an email address; the source is deliberately readable,
but reading it is a *tool*, not the answer.

> No spoilers live in this repo. The plaintext, the key, and the payoff address
> never appear in the source — only a ciphertext and the SHA-256 fingerprint of
> the key. The page decrypts live when a solver supplies the right key.

## Structure

```
site/                 # everything that ships to production
  index.html
  styles.css
  js/
    main.js           # boots the secret registry
    crypto.js         # vigenere + sha256 helpers (algorithm only)
    registry.js       # shared "stage" passed to every secret
    secrets/*.js      # one isolated module per hidden mechanic
  CNAME               # custom domain pin
tests/smoke.spec.js   # Playwright end-to-end checks (not shipped)
.github/workflows/    # CI/CD
```

Only `site/` is deployed — tests and tooling stay out of the public artifact.

## Develop

```bash
npm install
npm run dev        # serves site/ at http://localhost:4173
```

## CI/CD

`.github/workflows/deploy.yml` runs on every push and PR:

1. **ci** — `npm run validate` (HTML validation) + `npm test` (Playwright smoke
   test that the page loads, a hidden being reveals, and the true key unseals
   the sigil and constructs the mailbox).
2. **deploy** — only on push to `main`, after `ci` is green: uploads `site/` and
   publishes to GitHub Pages via the built-in `GITHUB_TOKEN`. No secrets stored.

```bash
npm run ci         # run the full gate locally
```

## Custom domain

`site/CNAME` pins `comeandget.us`. Point DNS at GitHub Pages:

| Type  | Host | Value |
|-------|------|-------|
| A     | @    | 185.199.108.153 |
| A     | @    | 185.199.109.153 |
| A     | @    | 185.199.110.153 |
| A     | @    | 185.199.111.153 |
| AAAA  | @    | 2606:50c0:8000::153 |
| AAAA  | @    | 2606:50c0:8001::153 |
| AAAA  | @    | 2606:50c0:8002::153 |
| AAAA  | @    | 2606:50c0:8003::153 |

Then enable **Enforce HTTPS** in the repo's Pages settings once the cert issues.
