import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import test from "node:test";
import vercelDemoRequest, { createVercelDemoRequestHandler } from "./demo-request.js";

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

async function withVercelApi(handler, run) {
  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      handler(request, response);
      return;
    }

    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        handler(request, response);
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Request body must be valid JSON." }));
      }
    });
  });
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

test("Vercel function accepts the platform-parsed request body and sends via SMTP", async () => {
  let sentMessage;
  const handler = createVercelDemoRequestHandler({
    env: testEnv,
    now: () => new Date("2026-11-04T04:37:56.000Z"),
    createTransport: () => ({
      sendMail: async (message) => {
        sentMessage = message;
        return { accepted: ["sales@ezinn.example"] };
      },
    }),
  });

  await withVercelApi(handler, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    assert.equal(response.status, 200);
    assert.equal(sentMessage.to, testEnv.DEMO_RECIPIENT_EMAIL);
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

test("Vercel function returns validation failures without sending", async () => {
  let sendAttempts = 0;
  const handler = createVercelDemoRequestHandler({
    env: testEnv,
    createTransport: () => ({
      sendMail: async () => {
        sendAttempts += 1;
        return { accepted: [testEnv.DEMO_RECIPIENT_EMAIL] };
      },
    }),
  });

  await withVercelApi(handler, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validRequest, email: "invalid" }),
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(typeof result.fields.email, "string");
    assert.equal(sendAttempts, 0);
  });
});

test("Vercel function logs SMTP failure details while redacting credentials", async () => {
  const logEntries = [];
  const smtpError = Object.assign(
    new Error(`Authentication failed for ${testEnv.SMTP_USER}; password=${testEnv.SMTP_PASSWORD}`),
    {
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH PLAIN",
      response: `535 Authentication failed for ${testEnv.SMTP_USER}: ${testEnv.SMTP_PASSWORD}`,
    },
  );
  const handler = createVercelDemoRequestHandler({
    env: testEnv,
    createTransport: () => ({
      sendMail: async () => {
        throw smtpError;
      },
    }),
    logError: (...entry) => logEntries.push(entry),
  });

  await withVercelApi(handler, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    assert.equal(response.status, 502);
  });

  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][0], "Demo request email delivery failed:");
  const loggedDetails = logEntries[0][1];
  assert.equal(loggedDetails.code, "EAUTH");
  assert.equal(loggedDetails.responseCode, "535");
  assert.equal(loggedDetails.command, "AUTH PLAIN");
  assert.match(loggedDetails.message, /Authentication failed/);
  assert.match(loggedDetails.response, /535 Authentication failed/);
  const serializedLog = JSON.stringify(loggedDetails);
  assert.doesNotMatch(serializedLog, new RegExp(testEnv.SMTP_PASSWORD));
  assert.doesNotMatch(serializedLog, new RegExp(testEnv.SMTP_USER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(serializedLog, /\[REDACTED\]/);
});

test("Vercel function responds to requests through its default export", async () => {
  await withVercelApi(vercelDemoRequest, async (url) => {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  });
});
