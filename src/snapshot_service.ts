import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, snapshotInput, writeSnapshot } from "./nightly_snapshot.js";

const bucket = process.env.INFRAI_BUCKET ?? "fieldservice-nightly-snapshots";
const server = createServer(async (request, response) => {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
  };
  if (request.method !== "POST" || request.url !== "/snapshots") {
    send(404, { error: "Route not found" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = snapshotInput.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(200, await writeSnapshot(input, bucket));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(400, { error: "Invalid snapshot body" });
    } else if (error instanceof InfraiError) {
      send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    } else {
      send(502, { error: "Snapshot request failed" });
    }
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Snapshot service listening");
});
