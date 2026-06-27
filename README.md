# comeandget.us

> you found the repository. of course you did. that's what they all do —
> pull the boards off the windows and call it trespassing when we look back.
>
> welcome. read everything. it won't help as much as you think.

This is the door. One page, no server, nothing that loads from anywhere you
can't see. Everything the page needs, the page carries — which means you can
read all of it, and you still won't be let in. The walls are honest. The lock
is not in the walls.

Seven lesser things keep the gate. Their names, in order, spell an eighth.
Speak the eighth and the seal breaks. What the seal says after that is between
you and the thing that answers. It answers to a name. Bring the right one.

```
38.8451° N   82.1371° W
XII · MCMLXVII
```

---

## for the living (maintainers)

A static cryptographic ARG — glitched-hack aesthetic, a cryptid / paranormal
clue system, zero runtime dependencies. The source is *meant* to be read; that's
the genre. What is **not** in the source is anything that proves you solved it:
the plaintext, the key in cleartext, the payoff address, and the final answer
all stay out. Only a ciphertext and a one-way hash of the key ever ship. The
page decrypts live, in the browser, when someone supplies the right name.

```
site/                 # everything that crosses the threshold (deployed)
  index.html
  styles.css
  js/
    main.js           # wakes the registry of secrets
    crypto.js         # vigenere + sha256, algorithm only — no answers
    registry.js       # the shared stage handed to every secret
    secrets/*.js      # one isolated mechanic each
  CNAME               # the true name of this place
tests/smoke.spec.js   # proves the door works and leaks nothing (never deployed)
secret/               # gitignored; the answer lives here, never in the repo
.github/workflows/    # what raises the dead on every push
```

### wake it locally

```bash
npm install
npm run dev          # serves site/ at http://localhost:4173
```

### what happens on every push

`.github/workflows/deploy.yml`:

1. **ci** — `npm run validate` (HTML) + `npm test` (Playwright): the page loads,
   a hidden being answers, the true key unseals the sigil and constructs the
   mailbox, and — if a `PUZZLE_ANSWER` secret is configured — nothing shipped
   contains the final answer.
2. **deploy** — only on `main`, only if `ci` is green: publishes `site/` to
   GitHub Pages with the built-in `GITHUB_TOKEN`. No secrets are stored to ship.

```bash
npm run ci           # run the whole gate yourself
```

### the answer, kept outside

The leak guard never names the answer. It reads it from `PUZZLE_ANSWER` (a CI
secret) or a gitignored `secret/answer.txt`, then proves it appears nowhere in
the deployed files. Set one of those to arm the guard; leave both unset and that
single check politely skips.

### the true name (custom domain)

`site/CNAME` pins `comeandget.us`. DNS points the apex at GitHub Pages
(A `185.199.108–111.153`, AAAA `2606:50c0:8000–8003::153`) and `www` at
`claudeconnection-del.github.io`. Enforce HTTPS once the certificate is issued.

---

*come and get us.*
