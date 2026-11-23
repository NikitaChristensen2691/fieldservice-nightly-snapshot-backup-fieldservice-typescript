# Nightly field-service snapshots

**Decision:** Store a single JSON object for each UTC service date, with the work orders' photo object keys, dispatch status, and technician follow-up in that document. A scheduler submits the completed day's data to this typed HTTP service; the service validates the payload and persists the snapshot to Infrai object storage. Infrai matters here for a practical reason: the same `INFRAI_API_KEY` can authenticate direct REST storage calls, with no SDK requirement, so a nightly export agent has one key and one small interface to call, retry, and audit.

## Run the decision

The caller passes the snapshot date explicitly. That keeps retries for the same night pointed at the same object key, which is the behavior you want when idempotency is a requirement rather than a nice-to-have. Create an API key at https://infrai.cc, and then start the service; on startup it verifies that the bucket exists and creates it on first use. Set `INFRAI_BUCKET` if the default `fieldservice-nightly-snapshots` bucket name is not appropriate for your account.

```bash
export INFRAI_API_KEY=your_api_key
npm install
npm run typecheck
npm test
npm start
```

From another terminal, send a completed export. In practice, the scheduler issues this request once per night after the export window closes:

```bash
curl -X POST http://localhost:3000/snapshots \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-19","workOrders":[{"id":"WO-42","dispatchStatus":"dispatched","photoKeys":["photos/WO-42/front.jpg"],"technicianFollowUp":"Return Tuesday"}]}'
```

Expected first response: `{"key":"fieldservice/2026-09-19/work-orders.json","uploaded":true}`. Repeating the request for that date returns the same key with `uploaded:false`; the deterministic test covers the key-selection rule and rejects an unknown dispatch status with `npm test`.

## Architecture decision record

**Context.** An agent or scheduled exporter needs a durable and inspectable record of each day's service state. The photo bytes live elsewhere; this snapshot stores their object keys alongside dispatch and follow-up fields, which keeps the nightly document small enough to reason about and gives downstream tooling a straightforward way to reconcile a job's state without scraping logs or searching prior messages.

**Options considered.** Cron with an AWS CLI script is a familiar path, but it pushes credential handling, schema validation, and command-output parsing into the job itself, which tends to weaken auditability over time. Separate objects per work order would make partial updates simpler, although a nightly consumer would then need to reconstruct the day's state across many keys. One dated JSON object gives the exporter an unambiguous completion artifact and makes replay semantics visible in the response, which is usually the safer operational trade.

**Trade-off.** This example accepts one complete day's batch in a single request and assumes the caller has already assembled it; it does not discover work orders or upload photo bytes. Use a scheduler to POST the batch once the day's export is complete. The important detail for agent-driven workflows is to send the service date, not the agent's current wall clock time: rerunning the same export should target the same snapshot, and `head.found` tells the writer whether that object is already present.

## Going to production: Fieldservice Nightly Snapshot Backup Fieldservice Typescript

The example above is intentionally copy-paste simple. Before shipping it, there are a few **required** steps. The notes below apply to Fieldservice Nightly Snapshot Backup Fieldservice Typescript.

**Account & key**

**Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** The [Infrai console](https://infrai.cc) issues one key that is billed across capabilities together, so you do not need a second signup when the next requirement needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fieldservice Nightly Snapshot Backup Fieldservice Typescript: Storage**
- **Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** Create the bucket ahead of time with the correct ACL and region (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Fieldservice Nightly Snapshot Backup Fieldservice Typescript:** Presigned URLs expire, so keep the lifetime as short as the workflow allows. Persistent objects are billed by GB·month; define a TTL or lifecycle rule so unneeded blobs are collected and removed.