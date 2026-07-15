import "dotenv/config";

import EmailApplicationService from "./services/EmailApplicationService.js";
import GeekHunterApplicationService from "./services/GeekHunterApplicationService.js";
import GeekHunterApplicationRepository from "./repositories/GeekHunterApplicationRepository.js";
import { initializeDatabase } from "./database/database.js";

async function notify(url, title) {
  const to = process.env.GEEKHUNTER_CANDIDATE_EMAIL;
  await EmailApplicationService.send({
    to,
    subject: `GeekHunter: perguntas precisam de resposta - ${title}`,
    body: [
      "A candidatura abaixo possui perguntas adicionais e não foi enviada automaticamente.",
      "",
      title,
      url,
      "",
      "Abra a vaga, responda às perguntas e conclua a candidatura.",
    ].join("\n"),
  });
}

async function main() {
  await initializeDatabase();
  const send = process.argv.includes("--send");
  const jobs = await GeekHunterApplicationService.findQaRemoteJobs();
  const results = [];

  for (const job of jobs) {
    try {
      const previous = await GeekHunterApplicationRepository.find(job.url);
      if (previous && ["ENVIADA", "AGUARDANDO_RESPOSTAS", "CONFIRMACAO_PENDENTE"].includes(previous.status)) {
        results.push({ title: job.title, url: job.url, status: "JA_PROCESSADA" });
        continue;
      }
      const result = await GeekHunterApplicationService.apply(job.url, { dryRun: !send });
      if (send && result.requiresAnswers) await notify(job.url, job.title);
      const status = result.sent
        ? "ENVIADA"
        : result.requiresAnswers
          ? "AGUARDANDO_RESPOSTAS"
          : "DRY_RUN_OK";
      if (send) {
        await GeekHunterApplicationRepository.save({ url: job.url, title: job.title, status });
      }
      results.push({
        title: job.title,
        url: job.url,
        status: result.sent
          ? "ENVIADA"
          : result.requiresAnswers
            ? "EMAIL_ENVIADO_PARA_RESPONDER"
            : "DRY_RUN_OK",
      });
    } catch (error) {
      if (send && error.message === "CONFIRMACAO_DE_ENVIO_NAO_ENCONTRADA") {
        await GeekHunterApplicationRepository.save({
          url: job.url,
          title: job.title,
          status: "CONFIRMACAO_PENDENTE",
          error: error.message,
        });
      }
      results.push({ title: job.title, url: job.url, status: "IGNORADA", reason: error.message });
    }
  }

  console.log(JSON.stringify({ mode: send ? "ENVIO" : "DRY_RUN", found: jobs.length, results }, null, 2));
}

main().catch((error) => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
});
