---
name: retell-calls
description: Make outbound AI phone calls using Retell API with ESG lead qualification
---

# Retell Calls — 100X ESG Lead Qualification

Make outbound AI-powered phone calls using Retell with the 100X ESG qualifier agent.

## Quick Call (All Variables)

```bash
export RETELL_API_KEY=...
export RETELL_FROM_NUMBER=...
export RETELL_AGENT_ID=...

python3 skills/retell-calls/call.py \
  --to "+919818522929" \
  --name "Sanat" \
  --company "Climitra" \
  --esg-context "true" \
  --esg-hook "focused on climate tech and carbon tracking solutions"
```

## Scripts

### 1. Simple Call (manual variables)
```bash
export RETELL_API_KEY=...
export RETELL_FROM_NUMBER=...
export RETELL_AGENT_ID=...

python3 skills/retell-calls/call.py \
  --to "+919818522929" \
  --name "Sanat" \
  --company "Climitra" \
  --esg-context "false"
```

### 2. Enriched Call (JIT ESG research) ⭐
```bash
export RETELL_API_KEY=...
export RETELL_FROM_NUMBER=...
export RETELL_AGENT_ID=...

python3 skills/retell-calls/enrich_and_call.py \
  --to "+919818522929" \
  --name "Sanat" \
  --company "Climitra" \
  --domain "climitra.com" \
  --industry "climate tech"
```

## Dynamic Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `contact_name` | First name | "Sanat" |
| `company_name` | Company | "Climitra" |
| `esg_context_found` | true/false | "true" |
| `esg_hook_fact` | Personalized hook | "focused on Scope 3 tracking" |
| `discovered_pain` | Set during call | (auto-collected) |

## Agent Workflow

```
QUALIFIER → DISCOVERY → PITCHER → CLOSER
    ↓           ↓          ↓
  (busy)    (objection)  (end)
    ↓           ↓
 CALLBACK  OBJECTION_HANDLER
```

### Opening Scripts

**IF `esg_context_found` = "true":**
> "Hey {{contact_name}}! This is Akshin from 100X Engineering. I was actually looking at {{esg_hook_fact}}—impressive work. Quick question: are you still manually aggregating the data for those reports, or have you automated the data ingestion side?"

**IF `esg_context_found` = "false":**
> "Hey {{contact_name}}! This is Akshin from 100X Engineering. We build ESG compliance tools—automated carbon accounting and document processing that keeps data on-prem. With CSRD deadlines coming up, is automating your ESG data collection something you're exploring?"

## Config

| Setting | Value |
|---------|-------|
| From Number | `RETELL_FROM_NUMBER` (required) |
| Agent ID | `RETELL_AGENT_ID` (required) |
| Agent Name | Your Retell agent |
| Voice | 11labs-Nico |
| Model | GPT-5.2 |

## Get Transcript

```bash
curl -s -H "Authorization: Bearer $RETELL_API_KEY" \
  "https://api.retellai.com/v2/get-call/CALL_ID" | jq '.transcript'
```

## Webhook — Auto-Update CRM After Calls

Retell can send webhooks when calls start, end, or are analyzed. The `webhook_handler.py` 
script receives these events and automatically updates `crm/leads/leads.csv`.

### Quick Start

```bash
# 1. Install Flask
pip install flask

# 2. Run the webhook handler
python3 skills/retell-calls/webhook_handler.py
```

### Local Testing with ngrok

```bash
# In another terminal:
ngrok http 5050

# Copy the https URL (e.g., https://abc123.ngrok.io)
# Add /webhook/retell to it for the full webhook URL
```

### Configure Webhook in Retell

**Option A: Account-Level (all agents)**
1. Go to [Retell Dashboard](https://app.retellai.com) → Settings → Webhooks
2. Set webhook URL: `https://your-ngrok-url.ngrok.io/webhook/retell`

**Option B: Agent-Level (specific agent)**
1. When creating/updating agent, set `webhook_url` field
2. Or via API:
```bash
curl -X PATCH "https://api.retellai.com/v2/update-agent/agent_YOUR_AGENT_ID" \
  -H "Authorization: Bearer $RETELL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook_url": "https://your-ngrok-url.ngrok.io/webhook/retell"}'
```

### Webhook Events

| Event | When | What We Do |
|-------|------|------------|
| `call_started` | Call connects | Log only |
| `call_ended` | Call ends (any reason) | Update CRM with outcome, duration |
| `call_analyzed` | AI analysis ready | Update with summary, sentiment |

### CRM Update Logic

The handler matches leads by **company name** or **contact name** and updates:

- **stage**: Qualified / Interested / Contacted / Not Interested / Voicemail / No Answer
- **score**: +15 for Qualified, +10 for Interested, -20 for Not Interested
- **notes**: Appends call summary, collected pain points, phone number
- **last_touch**: Today's date
- **next_touch**: +3 days for positive outcomes

### Collected Variables

If your Retell agent collects variables during the call (via conversation flow), 
they'll be extracted from `collected_dynamic_variables` and added to CRM notes:

```json
{
  "discovered_pain": "manual ESG data collection",
  "interest_level": "high",
  "budget_timeline": "Q2 2026"
}
```

### Call Logs

Full webhook payloads are saved to `skills/retell-calls/call_logs/` for debugging.

### Production Deployment

For production, deploy the webhook handler to:
- **Vercel**: Wrap in serverless function
- **Railway/Render**: Deploy as Flask app
- **AWS Lambda**: Use Zappa or Chalice

Remember to:
1. Set `RETELL_API_KEY` for signature verification
2. Use HTTPS endpoint
3. Allowlist Retell's IP: `100.20.5.228`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RETELL_API_KEY` | Yes (prod) | For webhook signature verification |
| `WEBHOOK_PORT` | No | Default: 5050 |

## Requirements

- `RETELL_API_KEY` — for calls + webhook verification
- `BRAVE_API_KEY` — for JIT enrichment (optional)
- `XAI_API_KEY` — for Grok fallback search (optional)
- `flask` — for webhook handler
