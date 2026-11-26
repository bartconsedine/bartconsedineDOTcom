import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { createInboundHandler } from "../src/private-apps/text-inbox/inbound.js";

const sid = "AC" + "a".repeat(32);
const message = "SM" + "b".repeat(32);
const to = "+12025550101";
const from = "+12025550102";
const publicUrl = "https://example.test/api/integrations/twilio/inbound?a=%2B";
const sig = "A".repeat(27) + "=";
function request(fields = {}, options = {}) {
  const body = options.body ?? new URLSearchParams({
    AccountSid: sid, MessageSid: message, To: to, From: from, Body: "  hello  ",
    NumMedia: "0", ...fields,
  }).toString();
  return new Request("https://proxy.example.test/api/integrations/twilio/inbound", {
    method: "POST", body, headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": sig, "x-forwarded-host": "wrong.example.test",
      ...options.headers,
    },
  });
}
function make(saveInbound, validateRequest = () => true) {
  return createInboundHandler({
    webhookUrl: publicUrl, accountSid: sid, destination: to, authToken: "synthetic",
    validateRequest, saveInbound,
  });
}

test("passes all parameters and the original configured URL to the SDK boundary", async () => {
  let validated = false;
  const route = make(async payload => {
    assert.equal(validated, true);
    assert.deepEqual(payload, {
      accountSid: sid, messageSid: message, sender: from, recipient: to, body: "  hello  ",
    });
    return "accepted";
  }, (token, signature, url, values) => {
    assert.equal(token, "synthetic");
    assert.equal(signature, sig);
    assert.equal(url, publicUrl);
    assert.equal(values.NewProviderField, "a+b");
    assert.equal(values.Body, "  hello  ");
    validated = true;
    return true;
  });
  const res = await route(request({ NewProviderField: "a+b" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await res.text(), /<Response\/>$/);
});

test("missing or invalid signature cannot reach persistence", async () => {
  let writes = 0;
  const route = make(async () => { writes++; }, () => false);
  assert.equal((await route(request())).status, 403);
  assert.equal((await route(request({}, { headers: { "x-twilio-signature": "" } }))).status, 403);
  assert.equal(writes, 0);
});

test("rejects unsupported or malformed requests before any write", async () => {
  let writes = 0;
  const route = make(async () => { writes++; return "accepted"; });
  const duplicate = (await request().text()) + "&MessageSid=" + message;
  assert.equal((await route(request({}, { body: duplicate }))).status, 400);
  assert.equal((await route(request({}, { body: "Body=%FF" }))).status, 400);
  assert.equal((await route(request({}, { body: "Body=" + "x".repeat(17_000) }))).status, 413);
  assert.equal((await route(request({ NumMedia: "1" }))).status, 400);
  assert.equal((await route(request({ To: from }))).status, 403);
  assert.equal((await route(request({ AccountSid: "AC" + "f".repeat(32) }))).status, 403);
  assert.equal((await route(request({}, { headers: { "content-type": "application/json" } }))).status, 415);
  assert.equal(writes, 0);
});

test("acknowledges only acceptance or an idempotent duplicate; no reply command", async () => {
  for (const [outcome, expected] of Object.entries({
    accepted: 200, duplicate: 200, not_bound: 403, conflict: 409, pending: 503,
  })) {
    const res = await make(async () => outcome)(request());
    assert.equal(res.status, expected);
    assert.doesNotMatch(await res.text(), /<Message/i);
  }
  assert.equal((await make(async () => { throw Error("db offline"); })(request())).status, 503);
});

test("passes repeated provider-extension values to the SDK without merging routing fields", async () => {
  const body = (await request().text()) + "&NewField=one&NewField=two";
  let checks = 0;
  const route = make(async () => "duplicate", (_token, _sig, _url, params) => {
    assert.deepEqual(params.NewField, ["one", "two"]);
    checks++;
    return true;
  });
  assert.equal((await route(request({}, { body }))).status, 200);
  assert.equal(checks, 1);
});

test("does not return TwiML before the store confirms the transaction", async () => {
  let finish;
  let entered;
  const beforeFinish = new Promise(resolve => { entered = resolve; });
  const result = new Promise(resolve => { finish = resolve; });
  const route = make(() => { entered(); return result; });
  let replied = false;
  const pending = route(request()).then(res => { replied = true; return res; });
  await beforeFinish;
  assert.equal(replied, false);
  finish("accepted");
  assert.equal((await pending).status, 200);
});

test("the pinned Twilio SDK accepts the exact signature and rejects tampering", async () => {
  const token = "synthetic-sdk-secret";
  const form = { AccountSid: sid, MessageSid: message, To: to, From: from,
    Body: "  café + test  ", NumMedia: "0", NewField: ["one", "two"] };
  const signature = twilio.getExpectedTwilioSignature(token, publicUrl, form);
  const body = new URLSearchParams(Object.entries(form).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map(item => [k, item]) : [[k, v]])).toString();
  let writes = 0;
  const route = createInboundHandler({
    webhookUrl: publicUrl, accountSid: sid, destination: to, authToken: token,
    saveInbound: async (record) => {
      assert.equal(record.body, form.Body);
      writes++;
      return "accepted";
    },
  });
  const headers = { "x-twilio-signature": signature };
  assert.equal((await route(request({}, { body, headers }))).status, 200);
  assert.equal((await route(request({}, { body: body + "&Changed=yes", headers }))).status, 403);
  assert.equal(writes, 1);
});
