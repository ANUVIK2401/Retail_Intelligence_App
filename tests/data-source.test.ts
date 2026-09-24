import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorNotConfiguredError } from "../src/core/connectors/graph.ts";
import { connectors, dataSourceKind } from "../src/core/connectors/resolve.ts";

test("synthetic data is the default, and graph must be asked for by name", () => {
  assert.equal(dataSourceKind({}), "synthetic");
  assert.equal(dataSourceKind({ DATA_SOURCE: "Graph" }), "graph");
  assert.equal(dataSourceKind({ DATA_SOURCE: "anything-else" }), "synthetic");
  assert.equal(connectors({}).mail.kind, "mock");
});

test("the Graph stub fails loudly instead of falling back to fixtures", async () => {
  const graph = connectors({ DATA_SOURCE: "graph" });
  assert.equal(graph.kind, "graph");
  await assert.rejects(graph.mail.listMessages("p_ceo"), ConnectorNotConfiguredError);
  await assert.rejects(graph.calendar.getSchedule({ personIds: ["p_ceo"], from: "2030-01-01T00:00:00Z", to: "2030-01-02T00:00:00Z" }), ConnectorNotConfiguredError);
});

test("the Graph stub still refuses writes without an approval id, before anything else", async () => {
  const graph = connectors({ DATA_SOURCE: "graph" });
  await assert.rejects(graph.mail.sendDraft({ draftId: "d", approvalId: "" }), /without an approval id/);
  await assert.rejects(graph.mail.createReplyDraft({ messageId: "m", body: "b", approvalId: "" }), /without an approval id/);
});
