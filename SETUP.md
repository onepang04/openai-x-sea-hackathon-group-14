# Setup - Claim-Integrity Agent

Do this once before the hackathon build window.

## macOS

### 1. Install prerequisites

```bash
# Install Homebrew if needed:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node

node --version   # should be v20+
git --version
```

### 2. Clone the repo

```bash
git clone https://github.com/onepang04/openai-x-sea-hackathon-group-14.git
cd openai-x-sea-hackathon-group-14
```

### 3. Install and authenticate Codex

```bash
npm install -g @openai/codex
codex --version
codex login
```

Sign in with a ChatGPT account that has Codex access. The current recommended
Codex model for ChatGPT sign-in is `gpt-5.5`; the repo includes
`.codex/config.toml` with that model.

### 4. Configure model/API environment

The app uses OpenAI for Signal 1 vision and SEA-LION for reviewer narration.
Codex auth is separate from these app API keys.

```bash
cp .env.example .env
```

Fill in:

```bash
OPENAI_API_KEY=sk-...
OPENAI_VISION_MODEL=<verify-current-openai-vision-model>
SEA_LION_API_KEY=...
SEA_LION_MODEL=<verify-via-sea-lion-v1-models>
```

Do not commit real keys. The backend should read model IDs from env vars, not
hardcoded defaults.

### 5. Copy the Codex config if desired

Codex can read the project config after you trust the repo. To also make it your
user-level default:

```bash
mkdir -p ~/.codex
cp .codex/config.toml ~/.codex/config.toml
```

### 6. Smoke test the OpenAI SDK

Run this after setting `OPENAI_API_KEY` and `OPENAI_VISION_MODEL`:

```bash
npm install openai
node -e "
const OpenAI = require('openai');
const client = new OpenAI();
const model = process.env.OPENAI_VISION_MODEL;
if (!model) throw new Error('Set OPENAI_VISION_MODEL first');
client.chat.completions.create({
  model,
  messages: [{ role: 'user', content: 'Say hello.' }]
}).then(r => console.log(r.choices[0].message.content));
"
```

### 7. Launch Codex

```bash
codex
```

Paste `codex-master-prompt.md` as the first build prompt when you are ready to
start staged implementation.

## Windows

Install Node.js 20+ from https://nodejs.org and Git from https://git-scm.com,
then run in PowerShell:

```powershell
node --version
git --version
npm install -g @openai/codex
codex --version
codex login
```

Set app environment variables:

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:OPENAI_VISION_MODEL = "<verify-current-openai-vision-model>"
$env:SEA_LION_API_KEY = "..."
$env:SEA_LION_MODEL = "<verify-via-sea-lion-v1-models>"
```

Set them permanently if this will be the demo machine:

```powershell
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-...", "User")
[System.Environment]::SetEnvironmentVariable("OPENAI_VISION_MODEL", "<verify-current-openai-vision-model>", "User")
[System.Environment]::SetEnvironmentVariable("SEA_LION_API_KEY", "...", "User")
[System.Environment]::SetEnvironmentVariable("SEA_LION_MODEL", "<verify-via-sea-lion-v1-models>", "User")
```

## Data assets

The JSON files are committed under `data/`:

- `data/accounts.json`
- `data/claims.json`
- `data/orders.json`
- `data/products.json`

Drop the image files before the demo:

Claim images in `data/images/claims/`:

- `ssl2_broken.jpg`
- `shirt_torn.jpg`
- `backpack_torn.jpg`
- `frame_shattered.jpg`
- `calcifer_broken.jpg`

Reference images in `data/images/reference/`:

- `ssl2_intact.jpg`
- `shirt_intact.jpg`
- `backpack_intact.jpg`
- `calcifer_intact.jpg`

See `data/IMAGES_MANIFEST.md` for the scenario roles and exact matching rules.

## Day-of rhythm

Use the staged sequence in `codex-master-prompt.md` and commit after each stage:

0 scaffold -> 1 types/data -> 2 deterministic spine -> 3 vision/narrator ->
4 API -> 5 UI -> 6 polish.

`codex-build-plan.md` has the operator runbook and eval rhythm.
