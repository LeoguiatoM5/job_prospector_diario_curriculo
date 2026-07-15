import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

import JobValidator from "../validators/JobValidator.js";

const GEEKHUNTER_HOSTS = new Set([
  "geekhunter.com",
  "www.geekhunter.com",
  "geekhunter.com.br",
  "www.geekhunter.com.br",
]);

class GeekHunterApplicationService {
  getConfiguration() {
    const resumePath = path.resolve(
      process.env.RESUME_PATH || "assets/Curriculo-Leonardo-Guiato.pdf",
    );

    return {
      name: process.env.GEEKHUNTER_CANDIDATE_NAME,
      email: process.env.GEEKHUNTER_CANDIDATE_EMAIL,
      phone: process.env.GEEKHUNTER_CANDIDATE_PHONE,
      linkedin: process.env.GEEKHUNTER_CANDIDATE_LINKEDIN,
      salaryClt: process.env.GEEKHUNTER_SALARY_CLT,
      salaryPj: process.env.GEEKHUNTER_SALARY_PJ,
      remoteOnly: process.env.GEEKHUNTER_REMOTE_ONLY === "true",
      consent: process.env.GEEKHUNTER_CONSENT === "true",
      resumePath,
    };
  }

  validateConfiguration(config) {
    const required = ["name", "email", "phone", "linkedin", "resumePath"];
    const missing = required.filter((field) => !config[field]);

    if (missing.length > 0) {
      throw new Error(`CONFIGURACAO_INCOMPLETA: ${missing.join(", ")}`);
    }

    if (!config.remoteOnly) throw new Error("REMOTE_ONLY_NAO_AUTORIZADO");
    if (!config.consent) throw new Error("CONSENTIMENTO_NAO_AUTORIZADO");
    if (!fs.existsSync(config.resumePath)) throw new Error("CURRICULO_NAO_ENCONTRADO");
    if (path.extname(config.resumePath).toLowerCase() !== ".pdf") {
      throw new Error("CURRICULO_DEVE_SER_PDF");
    }
    if (fs.statSync(config.resumePath).size > 3 * 1024 * 1024) {
      throw new Error("CURRICULO_MAIOR_QUE_3MB");
    }
  }

  validateUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || !GEEKHUNTER_HOSTS.has(url.hostname)) {
      throw new Error("URL_GEEKHUNTER_INVALIDA");
    }
    if (!url.pathname.includes("/jobs/")) throw new Error("URL_NAO_E_VAGA");
    return url.href;
  }

  async openBrowser() {
    const candidates = [
      process.env.CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
    ].filter(Boolean);
    const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!fs.existsSync(executablePath)) throw new Error("CHROME_NAO_ENCONTRADO");

    return chromium.launch({
      executablePath,
      headless: true,
      args: process.platform === "linux"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
    });
  }

  async inspect(url) {
    const normalizedUrl = this.validateUrl(url);
    const browser = await this.openBrowser();

    try {
      const page = await browser.newPage({ locale: "pt-BR" });
      await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const title = (await page.locator("h1").first().textContent())?.trim() ||
        (await page.title());
      const body = await page.locator("body").innerText();
      const validation = JobValidator.validate({
        cargo: title,
        descricao: body,
        modalidade: body,
        localizacao: body,
      });
      const unavailable = /vaga.+(?:encerrada|pausada|indisponível)/i.test(body);
      const form = page.locator('form:has(input[name="name"]):has(input[name="email"])').first();
      const hasApplicationForm = (await form.count()) > 0;
      const hasCaptcha = (await page.locator(
        'iframe[src*="recaptcha"], iframe[src*="turnstile"], [class*="captcha" i]',
      ).count()) > 0;
      const salaryFields = await form.locator('input[name^="salaryExpectation."]').evaluateAll(
        (elements) => elements.map((element) => element.getAttribute("name")),
      ).catch(() => []);

      return {
        url: page.url(),
        title,
        validation,
        unavailable,
        hasApplicationForm,
        hasCaptcha,
        salaryFields,
      };
    } finally {
      await browser.close();
    }
  }

  async findQaRemoteJobs() {
    const browser = await this.openBrowser();
    try {
      const page = await browser.newPage({ locale: "pt-BR" });
      await page.goto("https://www.geekhunter.com/pt/vagas", {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      const search = page.getByPlaceholder(
        "Buscar por cargo, competência, empresa, palavra-chave...",
      );
      await search.fill("QA");
      await page.waitForTimeout(2500);

      const cards = await page.locator('a[aria-label="Visualizar vaga"]').evaluateAll(
        (elements) => elements.map((element) => ({
          url: element.href,
          text: element.innerText,
          title: element.innerText.split("\n").map((item) => item.trim()).find(Boolean) || "",
        })),
      );
      const qaTitle = /(?:^|\b)(qa|quality assurance|analista de testes?|test engineer|sdet)(?:\b|$)/i;

      return [...new Map(cards
        .filter((card) => qaTitle.test(card.title))
        .filter((card) => /\bremoto\b|\bremote\b/i.test(card.text))
        .map((card) => [card.url, card])).values()];
    } finally {
      await browser.close();
    }
  }

  async apply(url, { dryRun = true } = {}) {
    const config = this.getConfiguration();
    this.validateConfiguration(config);
    const inspection = await this.inspect(url);

    if (!inspection.validation.valid) throw new Error("VAGA_FORA_DO_ESCOPO_QA_REMOTO_BRASIL");
    if (inspection.unavailable) throw new Error("VAGA_INDISPONIVEL");
    if (!inspection.hasApplicationForm) throw new Error("FORMULARIO_NAO_ENCONTRADO");
    if (inspection.hasCaptcha) throw new Error("PROTECAO_ANTIBOT_DETECTADA");

    if (dryRun) return { sent: false, dryRun: true, inspection };

    const browser = await this.openBrowser();
    try {
      const page = await browser.newPage({ locale: "pt-BR" });
      await page.goto(inspection.url, { waitUntil: "networkidle", timeout: 30000 });
      const form = page.locator('form:has(input[name="name"]):has(input[name="email"])').first();

      await form.locator('input[name="name"]').fill(config.name);
      await form.locator('input[name="email"]').fill(config.email);
      const confirmation = form.locator('input[name="confirmEmail"]');
      if (await confirmation.count()) await confirmation.fill(config.email);
      await form.locator('input[name="phone"]').fill(config.phone);
      await form.locator('input[name="linkedin"]').fill(config.linkedin);
      await form.locator('input[type="file"]').setInputFiles(config.resumePath);

      const clt = form.locator('input[name="salaryExpectation.CLT"]');
      if (await clt.count()) await clt.fill(config.salaryClt || "");
      const pj = form.locator('input[name="salaryExpectation.PJ"]');
      if (await pj.count()) await pj.fill(config.salaryPj || "");
      await form.locator('label:has-text("Li e aceito") input[type="checkbox"]').check({
        force: true,
      });

      // O primeiro submit abre perguntas eliminatórias quando existirem. Não as inventamos.
      const responsePromise = page.waitForResponse(
        (response) => {
          const hostname = new URL(response.url()).hostname;
          return response.request().method() === "POST" &&
            (hostname.endsWith("geekhunter.com") || hostname.endsWith("geekhunter.com.br"));
        },
        { timeout: 30000 },
      ).catch(() => null);
      await form.locator('button[type="submit"]').click();
      const submissionResponse = await responsePromise;
      await page.waitForTimeout(1500);
      const screeningDialog = page.locator('[role="dialog"]');
      if (await screeningDialog.count()) {
        return {
          sent: false,
          dryRun: false,
          requiresAnswers: true,
          inspection,
        };
      }

      const body = await page.locator("body").innerText();
      const success = /candidatura.+(?:enviada|realizada|sucesso)|application.+submitted/i.test(body) ||
        Boolean(submissionResponse?.ok());
      if (!success) throw new Error("CONFIRMACAO_DE_ENVIO_NAO_ENCONTRADA");
      return { sent: true, dryRun: false, inspection };
    } finally {
      await browser.close();
    }
  }
}

export default new GeekHunterApplicationService();
