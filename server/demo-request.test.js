import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createDemoRequestHandler } from "./demo-request.js";

const validRequest = {
  fullName: "Avery Smith",
  email: "avery@example.com",
  company: "Harbor Hotel",
  phone: "+1 555 010 2000",
  properties: "5",
  message: "Please contact me next week.",
};

const testEnv = {
  DEMO_RECIPIENT_EMAIL: "sales@ezinn.example",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "smtp-user",
  SMTP_PASSWORD: "smtp-password",
  SMTP_FROM: "EZinn Demo Form <no-reply@ezinn.example>",
};

async function withApi(options, run) {
  const server = createServer(createDemoRequestHandler(options));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}/api/demo-request`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function postRequest(url, body = validRequest) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("valid demo request sends all submitted details and a server timestamp", async () => {
  let sentMessage;

  await withApi({
    env: testEnv,
    now: () => new Date("2026-11-04T04:37:56.000Z"),
    createTransport: () => ({
      sendMail: async (message) => {
        sentMessage = message;
        return { accepted: ["sales@ezinn.example"] };
      },
    }),
  }, async (url) => {
    const response = await postRequest(url);
    assert.equal(response.status, 200);
    assert.equal(sentMessage.to, testEnv.DEMO_RECIPIENT_EMAIL);
    assert.equal(sentMessage.replyTo, validRequest.email);
    for (const [label, value] of [
      ["Full Name", validRequest.fullName],
      ["Work Email", validRequest.email],
      ["Hotel / Company Name", validRequest.company],
      ["Phone Number", validRequest.phone],
      ["Number of Properties", validRequest.properties],
      ["Optional Message", validRequest.message],
      ["Submission Date and Time (UTC)", "2026-11-04T04:37:56.000Z"],
    ]) {
      assert.ok(sentMessage.text.includes(`${label}: ${value}`), `Missing email field ${label}`);
    }
  });
});

test("invalid form data returns validation errors without attempting email", async () => {
  let sendAttempts = 0;
  const invalidRequest = {
    ...validRequest,
    email: "not-an-email",
    properties: "0",
  };

  await withApi({
    env: testEnv,
    createTransport: () => ({
      sendMail: async () => {
        sendAttempts += 1;
        return { accepted: ["sales@ezinn.example"] };
      },
    }),
  }, async (url) => {
    const response = await postRequest(url, invalidRequest);
    const result = await response.json();
    assert.equal(response.status, 400);
    assert.equal(typeof result.fields.email, "string");
    assert.equal(typeof result.fields.properties, "string");
    assert.equal(sendAttempts, 0);
  });
});

test("delivery failures return an error and a later retry can succeed", async () => {
  let sendAttempts = 0;

  await withApi({
    env: testEnv,
    createTransport: () => ({
      sendMail: async () => {
        sendAttempts += 1;
        if (sendAttempts === 1) throw Object.assign(new Error("SMTP unavailable"), { code: "ECONNECTION" });
        return { accepted: ["sales@ezinn.example"] };
      },
    }),
  }, async (url) => {
    const failedResponse = await postRequest(url);
    const failure = await failedResponse.json();
    assert.equal(failedResponse.status, 502);
    assert.match(failure.error, /try again/i);

    const retryResponse = await postRequest(url);
    assert.equal(retryResponse.status, 200);
    assert.equal(sendAttempts, 2);
  });
});

test("missing SMTP configuration fails safely without accepting a request", async () => {
  await withApi({ env: {}, createTransport: () => assert.fail("transport must not be created") }, async (url) => {
    const response = await postRequest(url);
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.match(result.error, /try again/i);
    assert.doesNotMatch(JSON.stringify(result), /SMTP|password|credential/i);
  });
});
