import assert from "node:assert/strict";
import { createStore, keyFor } from "../src/server/store.mjs";

const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN = "test-token";

let remote = {
  version: 3,
  updatedAt: "2026-07-15T00:00:00.000Z",
  researchQuestions: {}
};

const blobGet = async () => ({ stream: new Blob([JSON.stringify(remote)]).stream() });
const blobPut = async (_path, value) => { remote = JSON.parse(value); };
const options = { root: new URL("..", import.meta.url).pathname, persistent: "blob", blobGet, blobPut };
const instanceA = createStore(options);
const instanceB = createStore(options);

try {
  // Warm B with the empty document before A writes, reproducing two Vercel
  // function instances handling save and reload independently.
  await instanceB.get();
  const questions = Array.from({ length: 18 }, (_, index) => ({ id: `q-${index + 1}`, text: `现场问题 ${index + 1}`, lens: "pending" }));
  await instanceA.update(state => { state.researchQuestions[keyFor("member-jin", "co-xinyuan-logistics")] = questions; });
  const refreshed = await instanceB.get();
  assert.equal(refreshed.researchQuestions[keyFor("member-jin", "co-xinyuan-logistics")].length, 18);
  console.log("store: cross-instance Blob question persistence passed");
} finally {
  if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
}
