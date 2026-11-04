import { Buffer } from "node:buffer";
import process from "node:process";
import nodemailer from "nodemailer";

const endpointPath = "/api/demo-request";
const maxBodyBytes = 16 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class RequestError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (request.body !== undefined) {
    let parsedBody = request.body;

    try {
      if (Buffer.isBuffer(parsedBody)) {
        if (parsedBody.length > maxBodyBytes) {
          throw new RequestError(413, "Request body is too large.");
        }
        parsedBody = JSON.parse(parsedBody.toString("utf8"));
      } else if (typeof parsedBody === "string") {
        if (Buffer.byteLength(parsedBody, "utf8") > maxBodyBytes) {
          throw new RequestError(413, "Request body is too large.");
        }
        parsedBody = JSON.parse(parsedBody);
      } else if (parsedBody && typeof parsedBody === "object") {
        if (Buffer.byteLength(JSON.stringify(parsedBody), "utf8") > maxBodyBytes) {
          throw new RequestError(413, "Request body is too large.");
        }
      } else {
        throw new RequestError(400, "Request body must be valid JSON.");
      }

      return parsedBody;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(400, "Request body must be valid JSON.");
    }
  }

  const chunks = [];
  let bytesRead = 0;

  for await (const chunk of request) {
    bytesRead += chunk.length;
    if (bytesRead > maxBodyBytes) {
      throw new RequestError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Request body must be valid JSON.");
  }
}

function validateDemoRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError(400, "Please provide a valid demo request.");
  }

  const fields = {};
  const readText = (key, label, maxLength, required = true) => {
    const value = body[key];
    if (typeof value !== "string") {
      if (!required && value === undefined) return "";
      fields[key] = `${label} must be text.`;
      return "";
    }

    const trimmed = value.trim();
    if (required && !trimmed) fields[key] = `${label} is required.`;
    if (trimmed.length > maxLength) fields[key] = `${label} is too long.`;
    return trimmed;
  };

  const fullName = readText("fullName", "Full name", 120);
  const email = readText("email", "Work email", 254);
  const company = readText("company", "Hotel / Company name", 160);
  const phone = readText("phone", "Phone number", 40);
  const properties = readText("properties", "Number of properties", 16);
  const message = readText("message", "Message", 5000, false);

  if (email && !emailPattern.test(email)) {
    fields.email = "Please enter a valid work email.";
  }
  if (phone && /[\r\n]/.test(phone)) {
    fields.phone = "Please enter a valid phone number.";
  }
  if (properties && (!/^\d+$/.test(properties) || !Number.isSafeInteger(Number(properties)) || Number(properties) < 1)) {
    fields.properties = "Number of properties must be a positive whole number.";
  }

  if (Object.keys(fields).length) {
    throw new RequestError(400, "Please correct the highlighted fields.", fields);
  }

  return { fullName, email, company, phone, properties, message };
}

function smtpConfiguration(env) {
  const required = [
    "DEMO_RECIPIENT_EMAIL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error("SMTP configuration is incomplete.");
  }

  const recipient = env.DEMO_RECIPIENT_EMAIL.trim();
  if (!emailPattern.test(recipient)) {
    throw new Error("SMTP recipient configuration is invalid.");
  }

  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP port configuration is invalid.");
  }

  const secure = env.SMTP_SECURE === undefined
    ? port === 465
    : env.SMTP_SECURE === "true";
  if (env.SMTP_SECURE !== undefined && !["true", "false"].includes(env.SMTP_SECURE)) {
    throw new Error("SMTP security configuration is invalid.");
  }

  const from = env.SMTP_FROM.trim();
  if (/[\r\n]/.test(from)) {
    throw new Error("SMTP sender configuration is invalid.");
  }

  return {
    recipient,
    transport: {
      host: env.SMTP_HOST.trim(),
      port,
      secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    },
    from,
  };
}

export function createDemoRequestHandler({
  env = process.env,
  createTransport = (options) => nodemailer.createTransport(options),
  now = () => new Date(),
} = {}) {
  return async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");
    if (requestUrl.pathname !== endpointPath) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "Content-Type must be application/json." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const details = validateDemoRequest(body);
      const config = smtpConfiguration(env);
      const transport = createTransport(config.transport);
      const submittedAt = now().toISOString();
      const text = [
        "New EZinn Request a Demo submission",
        "",
        `Full Name: ${details.fullName}`,
        `Work Email: ${details.email}`,
        `Hotel / Company Name: ${details.company}`,
        `Phone Number: ${details.phone}`,
        `Number of Properties: ${details.properties}`,
        `Optional Message: ${details.message || "(not provided)"}`,
        `Submission Date and Time (UTC): ${submittedAt}`,
      ].join("\n");
      const info = await transport.sendMail({
        from: config.from,
        to: config.recipient,
        replyTo: details.email,
        subject: "New EZinn Request a Demo",
        text,
      });

      const acceptedRecipients = Array.isArray(info?.accepted) ? info.accepted : [];
      const recipientAccepted = acceptedRecipients.some((address) =>
        typeof address === "string" && address.toLowerCase() === config.recipient.toLowerCase()
      );
      if (!recipientAccepted) {
        throw new Error("The recipient did not accept the email.");
      }

      sendJson(response, 200, { message: "Demo request email accepted." });
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, {
          error: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        });
        return;
      }

      console.error("Demo request email delivery failed:", error?.code || error?.name || "unknown error");
      sendJson(response, 502, {
        error: "We couldn't send your request right now. Please try again.",
      });
    }
  };
}
