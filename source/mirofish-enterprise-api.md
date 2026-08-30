# MiroFish API

The public API is the same `/api/mirofish/*` HTTP surface used by the MiroFish web application. API-created projects appear in the web history, and web-created projects can be continued through the API.

## Authentication

Create a key at `/api-keys`, copy it once, and send it on every request:

```http
Authorization: Bearer mf_live_...
```

New keys are stored as SHA-256 digests. Legacy `sk-...` keys remain valid until they are revoked. Keys can be scoped to project, simulation, report, interaction, and webhook access.

Every response to an authenticated API request includes `X-Request-Id`. State-changing calls accept `Idempotency-Key`; reuse the same key when retrying the same request.

The MVP does not apply a request-per-minute limit. A safety cap of three concurrently active simulations per account remains in place.

Bearer API calls use an independent prepaid API credit balance. They do not require a web subscription and do not consume web Credits or the web simulation count. Web sessions continue to use the existing subscription, Credits, and simulation-count rules without change.

## API credits

API credits belong to the account, are shared by all API keys on that account, and never expire. The first accepted start of a simulation costs 100 API credits. Project creation checks that the account can afford one start but does not deduct credits. Reads, report generation, report chat, and webhooks are not charged in the MVP.

View and top up the balance at `/api-billing`. Available one-time packs are:

- $5 for 1,000 API credits
- $50 for 10,000 API credits
- $500 for 105,000 API credits
- $1,250 for 275,000 API credits

Billing and observability endpoints:

- `GET /api/mirofish/api-billing/balance`
- `GET /api/mirofish/api-billing/transactions?page=1&limit=50`
- `GET /api/mirofish/api-usage?from=<ISO>&to=<ISO>`
- `GET /api/mirofish/api-logs?page=1&limit=50`

Insufficient balance returns HTTP `402` with `error_code: API_INSUFFICIENT_CREDITS`, `required_credits`, `balance`, and `top_up_url`. A successful charged start returns `X-MiroFish-Credits-Charged` and `X-MiroFish-Credits-Remaining`. Repeating the same simulation start never charges it twice. An immediate or terminal simulation failure is refunded idempotently.

## Page-equivalent workflow

### 1. Open an upload session

Calculate each file's SHA-256 before requesting a presigned upload URL.

```bash
curl -X POST https://mirofish.my/api/mirofish/uploads/init \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: upload-init-001" \
  -d '{
    "clientSubmissionId":"submission-001",
    "files":[{
      "fileId":"brief-1",
      "name":"market-brief.pdf",
      "size":123456,
      "contentType":"application/pdf",
      "sha256":"64-lowercase-or-uppercase-hex-characters"
    }]
  }'
```

Upload the exact bytes with `PUT` to each returned `uploadUrl`, including the returned headers. Then verify the uploads:

```bash
curl -X POST https://mirofish.my/api/mirofish/uploads/complete \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: upload-complete-001" \
  -d '{"clientSubmissionId":"submission-001","uploadIds":["upload_..."]}'
```

PDF, Markdown, and text files are accepted, with a combined limit of 50MB per project.

For a publicly downloadable source file, the equivalent shortcut is `POST /api/mirofish/projects/import-url` with `prompt`, `clientSubmissionId`, and `url`; it uses the same project creation and quota path after importing the file.

### 2. Create the project and wait for its graph

```bash
curl -X POST https://mirofish.my/api/mirofish/projects \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: project-001" \
  -d '{
    "prompt":"Simulate how the target market may react to this launch.",
    "clientSubmissionId":"submission-001",
    "uploadIds":["upload_..."]
  }'
```

Poll `GET /api/mirofish/projects/{projectId}` until the project reaches `graph_ready` or `simulation_idle`. Read the full ontology and graph from:

- `GET /api/mirofish/projects/{projectId}/ontology`
- `GET /api/mirofish/graphs/{graphId}?projectId={projectId}`

### 3. Start and inspect the simulation

Starting a simulation uses the same simulation handler as the web button, with the API-only prepaid billing branch described above:

```bash
curl -X POST https://mirofish.my/api/mirofish/simulations/{simulationId}/start \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Idempotency-Key: simulation-start-001"
```

Poll `GET /api/mirofish/simulations/{simulationId}`. Product-level intermediate results are available from:

- `GET /api/mirofish/simulations/{simulationId}/profiles?platform=reddit`
- `GET /api/mirofish/simulations/{simulationId}/actions?limit=100&offset=0`
- `GET /api/mirofish/simulations/{simulationId}/posts?platform=twitter&limit=50&offset=0`
- `GET /api/mirofish/simulations/{simulationId}/timeline?start_round=0`
- `GET /api/mirofish/simulations/{simulationId}/comments?limit=50&offset=0`
- `GET /api/mirofish/simulations/{simulationId}/agent-stats`

### 4. Generate and retrieve the report

```bash
curl -X POST https://mirofish.my/api/mirofish/reports/{reportId} \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: report-generate-001" \
  -d '{"forceRegenerate":false}'
```

Use these reads while the report is generated:

- `GET /api/mirofish/reports/{reportId}`
- `GET /api/mirofish/reports/{reportId}/sections`
- `GET /api/mirofish/reports/{reportId}/agent-log?from_line=0`

The Agent log omits credentials, internal prompts, hidden reasoning, authorization headers, and provider tokens.

After the report is complete, `POST /api/mirofish/reports/{reportId}/chat` accepts the same `report-agent` and `world-character` modes used by the web application.

## Webhooks

Register an HTTPS endpoint:

```bash
curl -X POST https://mirofish.my/api/mirofish/webhooks \
  -H "Authorization: Bearer $MIROFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: webhook-endpoint-001" \
  -d '{
    "url":"https://api.example.com/webhooks/mirofish",
    "events":["project.graph_ready","simulation.completed","report.completed"]
  }'
```

The response contains a `whsec_...` secret once. Each delivery includes:

```http
X-MiroFish-Event-Id: <uuid>
X-MiroFish-Event-Type: report.completed
X-MiroFish-Signature: t=<unix-seconds>,v1=<hex-hmac>
```

Verify `v1` as HMAC-SHA256 of `<timestamp>.<raw-request-body>`, reject old timestamps, and deduplicate using `X-MiroFish-Event-Id`.

Webhook management endpoints:

- `GET /api/mirofish/webhooks`
- `PATCH /api/mirofish/webhooks/{endpointId}`
- `DELETE /api/mirofish/webhooks/{endpointId}`
- `GET /api/mirofish/webhooks/deliveries`
- `POST /api/mirofish/webhooks/deliveries/{deliveryId}/replay`

Delivery timeout is 10 seconds. Failed deliveries retry after approximately 1 minute, 5 minutes, 30 minutes, 2 hours, and 12 hours.

## JavaScript example

```js
const apiKey = process.env.MIROFISH_API_KEY;
const response = await fetch("https://mirofish.my/api/mirofish/projects/PROJECT_ID", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!response.ok) throw new Error(await response.text());
const { project } = await response.json();
console.log(project.status);
```

## Python example

```python
import os
import requests

response = requests.get(
    "https://mirofish.my/api/mirofish/projects/PROJECT_ID",
    headers={"Authorization": f"Bearer {os.environ['MIROFISH_API_KEY']}"},
    timeout=30,
)
response.raise_for_status()
print(response.json()["project"]["status"])
```

The machine-readable contract is available at `GET /api/mirofish/openapi` and is maintained in `docs/mirofish-api.openapi.yaml`.

## Deployment requirements

Apply `src/db/migrations/0016_add_mirofish_api_access.sql` before enabling API keys or webhooks. The Next.js service and the webhook reconciler must receive the same environment values:

- `MIROFISH_INTERNAL_API_TOKEN`: existing private token used by the reconciler route.
- `ENCRYPTION_KEY`: 32-byte base64 or 64-character hexadecimal key used to encrypt webhook signing secrets.
- `MIROFISH_API_CONCURRENT_SIMULATIONS`: optional per-account API concurrency cap; defaults to `3`.
- `MIROFISH_API_USAGE_RETENTION_DAYS`: optional audit retention; defaults to `90`.
- `MIROFISH_API_SIMULATION_START_COST`: API credits charged for the first simulation start; defaults to `100`.
- `WAFFO_PRODUCTS`: must map all four `mirofish-api-credits-*` internal product IDs to their Waffo one-time product IDs.

The Kubernetes reconciler runs every minute, discovers completed resources through the same backend adapter used by page polling, refunds failed API simulations, sends pending webhook deliveries, retries failures, and removes expired idempotency and usage records.
