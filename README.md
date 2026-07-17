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
site/                   # everything that crosses the threshold (deployed)
  index.html            # the front door (ARG 1: the seven + the winged one)
  veil.css  favicon.svg
  _headers              # Content-Security-Policy + security headers
  js/
    wake.js             # boots the stage, schedules the feign then the wake
    glyphs.js           # vigenere + sha256, algorithm only — no answers
    stage.js            # the shared stage handed to every "whisper"
    whispers/*.js       # one isolated mechanic each (threshold.js = the gate)
  root/                 # the rabbit hole (ARG 2: an M365/Intune honeypot)
    index.html  ember.css  js/*.js  check-in.json  transmissions.json
  CNAME                 # the true name of this place
functions/api/vigil/    # Cloudflare Pages Functions: live presence ("vigil") + KV
functions/root/         # middleware: self-declared AI crawlers get a decoy variant
tests/smoke.spec.js     # proves the door works and leaks nothing (never deployed)
secret/                 # gitignored; the answer lives here, never in the repo
.github/workflows/      # what raises the dead on every push
```

### wake it locally

```bash
npm install
npm run dev          # wrangler pages dev — serves site/ + functions/ locally
```

### what happens on every push

`.github/workflows/deploy.yml`:

1. **ci** — `npm run validate` (HTML) + `npm test` (Playwright, via
   `wrangler pages dev`): the page loads, a hidden being answers, the true key
   unseals the sigil and constructs the mailbox, the vigil API serves a roster
   without leaking, and — if a `PUZZLE_ANSWER` secret is configured — nothing in
   any shipped *or* tracked file contains a final answer.
2. **deploy** — only on `main`, only if `ci` is green: runs argument-free
   `wrangler pages deploy` (so `wrangler.toml` alone decides directory, project,
   and the `PRESENCE` KV binding) to **Cloudflare Pages**, authed with
   `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. No puzzle answer ever ships.

```bash
npm run ci           # run the whole gate yourself
```

### the answer, kept outside

The leak guard never names the answer. It reads it from `PUZZLE_ANSWER` (a CI
secret) or a gitignored `secret/answer.txt`, then proves it appears nowhere in
the deployed files. Set one of those to arm the guard; leave both unset and that
single check politely skips.

### the true name (custom domain)

`site/CNAME` pins `comeandget.us`. The zone lives on Cloudflare: add the apex
(and `www`) under **Custom domains** in the `comeandget-us` Pages project and
Cloudflare auto-wires the records (apex CNAME-flattened to `*.pages.dev`) and
issues the certificate. HTTPS is enforced by Pages once the cert is live.

---

*come and get us.*
