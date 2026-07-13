import path from "node:path";
import nodemailer from "nodemailer";

class EmailApplicationService {
  validateConfiguration() {
    const requiredVariables = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
    ];

    const missingVariables = requiredVariables.filter(
      (variableName) => !process.env[variableName]?.trim(),
    );

    if (missingVariables.length > 0) {
      throw new Error(`SMTP_NAO_CONFIGURADO: ${missingVariables.join(", ")}`);
    }

    const port = Number(process.env.SMTP_PORT);

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error("SMTP_PORT_INVALIDA");
    }

    const secureValue = process.env.SMTP_SECURE.trim().toLowerCase();

    if (!["true", "false"].includes(secureValue)) {
      throw new Error("SMTP_SECURE_INVALIDO. Use true ou false.");
    }

    return {
      host: process.env.SMTP_HOST.trim(),
      port,
      secure: secureValue === "true",
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM.trim(),
    };
  }

  createTransporter(config) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  async verify() {
    const config = this.validateConfiguration();
    const transporter = this.createTransporter(config);

    await transporter.verify();

    return {
      verified: true,
      user: config.user,
    };
  }

  async send({ to, subject, body, resumePath }) {
    const config = this.validateConfiguration();
    const transporter = this.createTransporter(config);

    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text: body,
      attachments: [
        {
          filename: path.basename(resumePath),
          path: resumePath,
          contentType: "application/pdf",
        },
      ],
    });

    return {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  }
}

export default new EmailApplicationService();
