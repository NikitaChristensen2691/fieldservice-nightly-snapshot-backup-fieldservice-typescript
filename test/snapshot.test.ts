import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotInput, snapshotKey } from "../src/nightly_snapshot.js";

test("a nightly dispatch snapshot has a stable object key and retains follow-up", () => {
  const input = snapshotInput.parse({
    date: "2026-09-19",
    workOrders: [{ id: "WO-42", dispatchStatus: "dispatched", photoKeys: ["photos/WO-42/front.jpg"], technicianFollowUp: "Return Tuesday" }],
  });
  assert.equal(snapshotKey(input), "fieldservice/2026-09-19/work-orders.json");
  assert.equal(input.workOrders[0].technicianFollowUp, "Return Tuesday");
  assert.equal(snapshotKey(input), snapshotKey({ ...input, workOrders: [...input.workOrders] }));
  assert.equal(snapshotInput.safeParse({ ...input, workOrders: [{ ...input.workOrders[0], dispatchStatus: "unknown" }] }).success, false);
});
