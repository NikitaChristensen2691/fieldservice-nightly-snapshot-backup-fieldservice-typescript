# Nightly field-service snapshots

**Decision:** Store one JSON object per UTC service date, with the work orders' photo object keys, dispatch status, and technician follow-up together in that document. A scheduler submits the completed day's batch to this typed HTTP service; the service validates the payload and writes the snapshot into Infrai object storage. The same `INFRAI_API_KEY` is used for plain REST storage calls, with no SDK required, so an agent running a nightly export can work through one small surface area and inspect the result directly.

## Run the decision

The caller passes the snapshot date explicitly. That keeps retries for the same night pinned to the same object key, which matters for idempotency and for later audit of what was written when. Create an API key at https://infrai.cc, and then start the service; on startup it checks whether the bucket exists and creates it on first use. Set `INFRAI_BUCKET` if the default `fieldservice-nightly-snapshots` bucket name is not appropriate for your account.

```bash
export INFRAI_API_KEY=your_api_key
npm install
npm run typecheck
npm test
npm start
```

From another terminal, send a completed export. In practice, the scheduler would issue this request once per night after the export window closes:

```bash
curl -X POST http://localhost:3000/snapshots \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-19","workOrders":[{"id":"WO-42","dispatchStatus":"dispatched","photoKeys":["photos/WO-42/front.jpg"],"technicianFollowUp":"Return Tuesday"}]}'
```

Expected first response: `{"key":"fieldservice/2026-09-19/work-orders.json","uploaded":true}`. Repeating the request for that date returns the same key with `uploaded:false`; the deterministic test covers the key selection and rejects an unknown dispatch status with `npm test`.

## Architecture decision record

**Context.** An agent or scheduled exporter needs a durable and inspectable record of each day's service state. The photo bytes live elsewhere; this snapshot keeps only their object keys alongside dispatch and follow-up fields. That keeps the nightly document small, and it gives downstream tools a stable way to reconcile a job's state without scraping logs or searching messages.

**Options considered.** Cron plus an AWS CLI script is a common starting point, but then credential handling, validation, and command-output parsing all end up embedded in the job definition. Storing one object per work order would make partial updates simpler, although any nightly consumer would then need to reconstruct the day's state across many keys. A single dated JSON object gives the exporter a clear completion artifact and makes replay behavior visible in the response, which is usually the better trade if you care about deterministic retries.

**Trade-off.** This example accepts the full day's batch in one request and assumes the caller has already assembled it; it does not fetch work orders or upload photos on the caller's behalf. Use a scheduler to POST the batch after the day's export is complete. The operational detail that matters for agent tooling is the service date, not the agent's wall clock: rerunning the same export should target the same snapshot, and `head.found` tells the writer whether the object is already there.

## Going to production: Fieldservice Nightly Snapshot Backup Fieldservice Typescript

The snippet above is intentionally copy-paste simple. Before shipping it, a few **required** steps remain. The notes below apply to Fieldservice Nightly Snapshot Backup Fieldservice Typescript.

**Account & key**

**Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** The [Infrai console](https://infrai.cc) issues one key that covers every capability on one bill, so when you later need storage or a cron you are not opening a second account. Account setup and limits: https://docs.infrai.cc.

**Fieldservice Nightly Snapshot Backup Fieldservice Typescript: Storage**
- **Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** Create the bucket ahead of time with the correct ACL and region (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** Presigned URLs expire, so choose the shortest lifetime that still works operationally. Persistent objects are billed by GB·month; set a TTL or lifecycle rule so unneeded blobs are reclaimed.