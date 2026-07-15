import fs from "node:fs";
import path from "node:path";

import { google } from "googleapis";

class EmailApplicationService {
  isBlockedRecipient(to) {
    return String(to || "").toLowerCase().includes("ciant");
  }

  validateRecipient(to) {
    if (this.isBlockedRecipient(to)) {
      throw new Error("DESTINATARIO_BLOQUEADO: CIANT");
    }
  }

  validateConfiguration() {
    const requiredVariables = [
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
      "GMAIL_FROM",
    ];

    const missingVariables = requiredVariables.filter(
      (variableName) => !process.env[variableName]?.trim(),
    );

    if (missingVariables.length > 0) {
      throw new Error(
        `GMAIL_API_NAO_CONFIGURADA: ${missingVariables.join(", ")}`,
      );
    }

    return {
      clientId: process.env.GMAIL_CLIENT_ID.trim(),
      clientSecret: process.env.GMAIL_CLIENT_SECRET.trim(),
      refreshToken: process.env.GMAIL_REFRESH_TOKEN.trim(),
      from: process.env.GMAIL_FROM.trim(),
    };
  }

  createOAuthClient(config) {
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
    );

    oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
    });

    return oauth2Client;
  }

  createGmailClient(config) {
    return google.gmail({
      version: "v1",
      auth: this.createOAuthClient(config),
    });
  }

  encodeHeader(value) {
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
  }

  encodeBase64Lines(value) {
    const encoded = Buffer.from(value).toString("base64");

    return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
  }

  buildMimeMessage({ from, to, subject, body, resumePath }) {
    const boundary = [
      "qa-job-prospector",
      Date.now(),
      Math.random().toString(16).slice(2),
    ].join("-");

    const bodyBase64 = this.encodeBase64Lines(Buffer.from(body, "utf8"));
    const parts = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${this.encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      bodyBase64,
    ];

    if (resumePath) {
      const filename = path.basename(resumePath);
      const resumeBase64 = this.encodeBase64Lines(fs.readFileSync(resumePath));
      parts.push(
        "",
        `--${boundary}`,
        `Content-Type: application/pdf; name="${filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${filename}"`,
        "",
        resumeBase64,
      );
    }

    parts.push("", `--${boundary}--`, "");
    const mimeMessage = parts.join("\r\n");

    return Buffer.from(mimeMessage, "utf8").toString("base64url");
  }

  async verify() {
    const config = this.validateConfiguration();
    const oauth2Client = this.createOAuthClient(config);

    await oauth2Client.getAccessToken();

    return {
      verified: true,
      user: config.from,
    };
  }

  async send({ to, subject, body, resumePath }) {
    this.validateRecipient(to);

    const config = this.validateConfiguration();

    if (resumePath && !fs.existsSync(resumePath)) {
      throw new Error(`CURRICULO_NAO_ENCONTRADO: ${resumePath}`);
    }

    const gmail = this.createGmailClient(config);

    const raw = this.buildMimeMessage({
      from: config.from,
      to,
      subject,
      body,
      resumePath,
    });

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
      },
    });

    const messageId = response.data.id || null;

    if (!messageId) {
      throw new Error("GMAIL_API_NAO_RETORNOU_MESSAGE_ID");
    }

    return {
      messageId,
      accepted: [to],
      rejected: [],
    };
  }
}

export default new EmailApplicationService();
