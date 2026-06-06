# Setup — Claim-Integrity Agent (Hackathon Day)

Do this once before 8:30am. Pick your OS section.

---

## macOS (MacBook Pro)

### 1. Install prerequisites

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20+
brew install node

# Verify
node --version   # should be v20+
git --version
```

### 2. Clone the repo

```bash
git clone https://github.com/onepang04/openai-x-sea-hackathon-group-14.git
cd openai-x-sea-hackathon-group-14
```

### 3. Install Codex CLI

```bash
npm install -g @openai/codex

# Verify
codex --version
```

### 4. Authenticate with ChatGPT Pro

```bash
codex auth login
# Opens a browser — sign in with your ChatGPT Pro account
# This uses your Pro subscription, NOT your API credits
```

### 5. Set your API key for the app's OpenAI calls

The API key is for Signal 1 (vision) + narrator — not for Codex itself.

```bash
# Add to ~/.zshrc so it persists across terminals
echo 'export OPENAI_API_KEY=sk-...' >> ~/.zshrc
source ~/.zshrc
```

### 6. Copy the Codex config

```bash
mkdir -p ~/.codex && cp .codex/config.toml ~/.codex/config.toml
```

### 7. Smoke test — verify a vision call works

```bash
npm install openai   # temporary, in any folder
node -e "
const OpenAI = require('openai');
const client = new OpenAI();
client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Say hello.' }]
}).then(r => console.log(r.choices[0].message.content));
"
```

### 8. Launch Codex

```bash
codex
```

---

## Windows (ASUS)

### 1. Install prerequisites

- Node.js 20+ — download from https://nodejs.org (LTS installer)
- Git — download from https://git-scm.com
- Verify in PowerShell:

```powershell
node --version   # should be v20+
git --version
```

### 2. Clone the repo

```powershell
git clone https://github.com/onepang04/openai-x-sea-hackathon-group-14.git
cd openai-x-sea-hackathon-group-14
```

### 3. Install Codex CLI

```powershell
npm install -g @openai/codex

# Verify
codex --version
```

### 4. Authenticate with ChatGPT Pro

```powershell
codex auth login
# Opens a browser — sign in with your ChatGPT Pro account
# This uses your Pro subscription, NOT your API credits
```

### 5. Set your API key for the app's OpenAI calls

```powershell
# Set for current session
$env:OPENAI_API_KEY = "sk-..."

# Set permanently (user-level)
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-...", "User")
```

### 6. Copy the Codex config

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex"
Copy-Item ".codex\config.toml" "$env:USERPROFILE\.codex\config.toml"
```

### 7. Smoke test — verify a vision call works

```powershell
node -e "const OpenAI = require('openai'); const client = new OpenAI(); client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Say hello.' }] }).then(r => console.log(r.choices[0].message.content));"
```

### 8. Launch Codex

```powershell
codex
```

---

## Both machines — after setup

**First message every Codex session:**
```
Read AGENTS.md and claim-integrity-agent-spec.md. Summarise the architecture, scope,
and build sequence. Do not edit files.
```

**Drop images before 8:30am** — see `data/IMAGES_MANIFEST.md` for the 7 filenames:
```
images/claims/C001_mug_chip.jpg
images/claims/C002_phone_fake_crack.jpg
images/claims/shared_fake_01.jpg
images/claims/C005_shirt_fake_tear.jpg
images/claims/C006_glass_real_shatter.jpg
images/claims/C007_phone_logistics.jpg
images/claims/C008_mug_logistics.jpg
```

---

## Day-of rhythm

```
Hr 0–1   B: scaffold. A: Signal 1 standalone. C: UI against mocked score. D: data drop-in.
Hr 1–4   A: tune Signal 1 (critical path). B: Signals 2+3 + aggregator. C: claim list + verdict card.
Hr 4–6   B+A: plug real Signal 1 in. D: frontend↔backend integration.
Hr 6–8   D: end-to-end across all 8 scenarios. A/B/C fix what surfaces.
Hr 8–9   D+C: demo polish. Backup video.
Hr 9–10  Whole team: rehearse 90-second demo 3×. Record backup.
```

See `codex-build-plan.md` for full phase-by-phase Codex prompts.
