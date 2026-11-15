# Handoff — pending work (read this when the owner says "continue")

**If the owner's message is just "continue", do the steps in §2 in order, without asking.** The owner's standing rules apply: merge green PRs and deploy without asking (`CLAUDE.md` → Shipping); never put secrets in git; report results plainly. When everything in §2 is done, delete this file and its pointer in `CLAUDE.md` in the same PR, and update `docs/deployment.md` §4/§5.

Last updated: 2026-11-15.

## 1. Where things stand

| | State |
|---|---|
| `main` | `22e9fd5` — includes gallery photos (PR #4), photo reading with Claude + continuous deployment (PR #5). All CI green. |
| Production | https://18-157-228-96.sslip.io — **still running the build from before PR #4** (meal text parsing with Claude works; gallery picker and photo reading are not live yet). |
| CD pipeline | `.github/workflows/deploy.yml` exists and runs after `ci` on every push to `main`. **It fails at "configure-aws-credentials"** with *"The web identity token provided could not be validated"* because the one-time AWS setup below was never applied. Runs 43648226088 and 43698821861 were cancelled for that reason. |
| AWS setup | `infra/aws/github-deploy.yaml` (CloudFormation: GitHub OIDC provider + role `foodtrack-github-deploy`, allowed only `ssm:SendCommand` on `i-0c7d5a650b99b55e4` with `AWS-RunShellScript`). **Not applied yet.** |
| Blocker | The AWS connector was signed out for the whole previous session (`needs you to sign in again`); connectors only load at session start. |

## 2. What to do

1. **Check AWS access.** With the AWS MCP tool (`run_script`): `sts GetCallerIdentity` (expect account `730335461967`), `iam ListOpenIDConnectProviders`, `iam GetRole foodtrack-github-deploy`.
   - If the AWS connector is still unavailable: tell the owner once, and offer the CloudShell one-liner (§4). Do not loop.
   - If the role already exists (the owner may have run §4), skip step 2.
2. **Apply the AWS setup** — CloudFormation `CreateStack` in `eu-central-1`, stack name `foodtrack-github-deploy`, `TemplateBody` = the contents of `infra/aws/github-deploy.yaml`, `Capabilities: [CAPABILITY_NAMED_IAM]`, parameter `CreateOidcProvider` = `false` if `ListOpenIDConnectProviders` already shows `token.actions.githubusercontent.com`, else `true`. Wait for `CREATE_COMPLETE` (poll `DescribeStacks`; each MCP call times out at 60 s, so poll in short calls).
3. **Deploy** — GitHub MCP `actions_run_trigger` → `run_workflow`, `workflow_id: deploy.yml`, `ref: main`. Then follow the run (`actions_list` → `list_workflow_runs` / `list_workflow_jobs`, `get_job_logs`). The "configure-aws-credentials" step should finish in seconds; the SSM step takes 5–30 min on this small box (it rebuilds the images). Success = the smoke test step passes (`/` and `/api/v1/health` → 200).
   - If it fails, read the job log, fix the root cause in the repo (PR → green → merge, which redeploys), never by weakening a check.
4. **Verify photo reading on production for real.** The box's `.env` already has `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL_TEXT`; with `config/llm.json` `vision.enabled: true` the text model also reads photos (no `.env` change needed). Via SSM `SendCommand` (`AWS-RunShellScript` runs under `sh` — wrap in `bash <<'EOS' … EOS`; send, then read the result in a separate call):
   - inside the api container, find the dist chunk containing `function createLLMRouter`, `boot()`, check `d.llm.describe().vision === true`, then call `d.llm.parsePhoto({ image, mime: 'image/jpeg', locale: 'he-IL' })` on a real food photo (e.g. download a public-domain food JPEG on the box with `curl`, or render one) and confirm it returns sensible items and is not `degraded`. The pattern is in `docs/deployment.md` → "Verify after a deploy".
   - Then the end-to-end path: `POST /api/v1/meals/parse-photo` needs a user token, so prefer the in-container router check above; do not create test data in the owner's account.
5. **Report to the owner**: deploy run link and result, what Claude saw in the test photo, and that every merge now deploys itself.
6. **Clean up**: delete this file and the `CLAUDE.md` pointer; update `docs/deployment.md` §4 (history) and §5 (follow-ups). PR → green → merge (that merge is itself the first fully automatic deploy — check it goes green).

## 3. Still open for the owner (remind, don't do)

- Rotate the Anthropic API key (it passed through chat and SSM command history).
- Copy `/root/foodtrack-recovery-card.txt` off the box, then delete it there.
- Attach an Elastic IP or a real domain (the `sslip.io` URL changes if the instance stops/starts).
- Off-box backups.

## 4. If AWS still isn't reachable from the session — the owner's one-minute path

AWS console → region **Frankfurt (eu-central-1)** → CloudShell (`>_`):

```bash
curl -fsSL https://raw.githubusercontent.com/ItayBenben/FoodTrack-/main/infra/aws/github-deploy.yaml -o t.yaml && \
aws cloudformation deploy --region eu-central-1 --stack-name foodtrack-github-deploy \
  --template-file t.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides CreateOidcProvider=true
```

After "Successfully created/updated stack", step 3 above works from GitHub alone — no AWS access needed in the session. Step 4 (live photo test) does need SSM; without AWS access, test through the app instead by asking the owner to add a meal photo and checking the server's response is not `vision: off`.
