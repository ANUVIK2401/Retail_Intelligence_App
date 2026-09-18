import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody } from "../src/core/deployment/request.ts";

test("bounded JSON reader accepts small requests and rejects oversized streams", async () => {
  const small = new Request("https://demo.test/api/assistant", { method: "POST", body: JSON.stringify({ question: "hello" }) });
  assert.deepEqual(await readJsonBody(small, 100), { question: "hello" });
  const large = new Request("https://demo.test/api/assistant", { method: "POST", body: "a".repeat(101) });
  await assert.rejects(readJsonBody(large, 100), /too large/i);
});
