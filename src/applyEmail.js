import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { initializeDatabase } from "./database/database.js";
import JobRepository from "./repositories/JobRepository.js";
import EmailApplicationService from "./services/EmailApplicationService.js";

function getArgumentValue(argumentName) {
  const argumentIndex = process.argv.indexOf(argumentName);

  if (argumentIndex === -1) {
    return null;
  }

  return process.argv[argumentIndex + 1] || null;
}

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function buildSubject(job) {
  return `Candidatura - ${job.cargo}`;
}

function buildBody(job) {
  return `Olá,

Meu nome é Leonardo Guiato e atuo na área de Qualidade de Software.

Identifiquei a oportunidade para a posição de ${job.cargo} e gostaria de apresentar minha candidatura.

Encaminho meu currículo em anexo para avaliação.

Fico à disposição para conversar sobre a oportunidade.

Atenciosamente,

Leonardo Guiato
Analista de QA`;
}

function validateJob(job) {
  if (job.channel_type !== "EMAIL") {
    throw new Error(`CANAL_NAO_SUPORTADO: ${job.channel_type || "SEM_CANAL"}`);
  }

  if (!job.email || !job.email.trim()) {
    throw new Error("EMAIL_NAO_DISPONIVEL");
  }

  if (job.application_status === "ENVIADA") {
    throw new Error("CANDIDATURA_JA_ENVIADA");
  }

  if (job.application_status === "ENVIANDO") {
    throw new Error("CANDIDATURA_EM_PROCESSAMENTO");
  }
}

function resolveResumePath() {
  const configuredResumePath = process.env.RESUME_PATH;

  if (!configuredResumePath) {
    throw new Error("RESUME_PATH_NAO_CONFIGURADO");
  }

  const resumePath = path.resolve(configuredResumePath);

  if (!fs.existsSync(resumePath)) {
    throw new Error(`CURRICULO_NAO_ENCONTRADO: ${resumePath}`);
  }

  if (!fs.statSync(resumePath).isFile()) {
    throw new Error(`CURRICULO_INVALIDO: ${resumePath}`);
  }

  if (path.extname(resumePath).toLowerCase() !== ".pdf") {
    throw new Error("CURRICULO_DEVE_SER_PDF");
  }

  return resumePath;
}

function printPreview({ job, subject, body, resumePath, dryRun }) {
  console.log("");
  console.log("==========================================");

  console.log(
    dryRun
      ? " CANDIDATURA POR EMAIL - DRY RUN"
      : " CANDIDATURA POR EMAIL - ENVIO REAL",
  );

  console.log("==========================================");
  console.log("");
  console.log(`ID        : ${job.id}`);
  console.log(`Empresa   : ${job.empresa}`);
  console.log(`Cargo     : ${job.cargo}`);
  console.log(`Destino   : ${job.email}`);
  console.log(`Status    : ${job.application_status || "PENDENTE"}`);
  console.log(`Tentativas: ${job.application_attempts || 0}`);
  console.log("");
  console.log("------------------------------------------");
  console.log(" EMAIL");
  console.log("------------------------------------------");
  console.log("");
  console.log(`Assunto: ${subject}`);
  console.log("");
  console.log(body);
  console.log("");
  console.log("------------------------------------------");
  console.log(" ANEXO");
  console.log("------------------------------------------");
  console.log("");
  console.log(`Arquivo: ${resumePath}`);
  console.log("");
}

async function processJob(job, { dryRun, resumePath }) {
  validateJob(job);

  const subject = buildSubject(job);
  const body = buildBody(job);

  printPreview({
    job,
    subject,
    body,
    resumePath,
    dryRun,
  });

  if (dryRun) {
    console.log("ENVIO: NÃO REALIZADO - DRY RUN");
    console.log("");

    return {
      sent: false,
      dryRun: true,
    };
  }

  EmailApplicationService.validateConfiguration();

  const claim = await JobRepository.markApplicationSending(job.id);

  if (!claim.updated) {
    throw new Error("CANDIDATURA_NAO_DISPONIVEL_PARA_ENVIO");
  }

  let sendResult;

  try {
    sendResult = await EmailApplicationService.send({
      to: job.email,
      subject,
      body,
      resumePath,
    });
  } catch (error) {
    await JobRepository.markApplicationError(
      job.id,
      String(error.message || error).slice(0, 2000),
    );

    throw error;
  }

  const sentStatus = await JobRepository.markApplicationSent(job.id);

  if (!sentStatus.updated) {
    throw new Error(
      `EMAIL_ENVIADO_STATUS_NAO_CONFIRMADO: ${
        sendResult.messageId || "SEM_MESSAGE_ID"
      }`,
    );
  }

  console.log("ENVIO: REALIZADO");
  console.log(`Message ID: ${sendResult.messageId || "NÃO INFORMADO"}`);
  console.log("Status SQLite: ENVIADA");
  console.log("");

  return {
    sent: true,
    dryRun: false,
    messageId: sendResult.messageId,
  };
}

async function processSingleJob(jobId, options) {
  const job = await JobRepository.findById(jobId);

  if (!job) {
    throw new Error(`VAGA_NAO_ENCONTRADA: ${jobId}`);
  }

  await processJob(job, options);
}

async function processPendingJobs(options) {
  const jobs = await JobRepository.findEmailApplicationsPending();

  console.log("");
  console.log("==========================================");
  console.log(" CANDIDATURAS EMAIL PENDENTES");
  console.log("==========================================");
  console.log("");
  console.log(`Total pendente: ${jobs.length}`);

  if (jobs.length === 0) {
    console.log("");
    console.log("Nenhuma candidatura por email pendente.");
    console.log("");

    return;
  }

  let sent = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      const result = await processJob(job, options);

      if (result.sent) {
        sent++;
      }
    } catch (error) {
      errors++;

      console.error("------------------------------------------");
      console.error(" ERRO NO PROCESSAMENTO");
      console.error("------------------------------------------");
      console.error(`ID      : ${job.id}`);
      console.error(`Empresa : ${job.empresa}`);
      console.error(`Erro    : ${error.message}`);
      console.error("");
    }
  }

  console.log("==========================================");
  console.log(options.dryRun ? " RESUMO DO DRY RUN" : " RESUMO DOS ENVIOS");
  console.log("==========================================");
  console.log("");
  console.log(`Candidaturas analisadas: ${jobs.length}`);
  console.log(`Emails enviados         : ${sent}`);
  console.log(`Erros                    : ${errors}`);
  console.log("");
}

async function start() {
  const jobIdArgument = getArgumentValue("--job-id");
  const allPending = hasFlag("--all-pending");
  const dryRun = hasFlag("--dry-run");
  const send = hasFlag("--send");

  if (jobIdArgument && allPending) {
    throw new Error(
      "SELECAO_INVALIDA. Use --job-id ou --all-pending, nunca os dois.",
    );
  }

  if (dryRun && send) {
    throw new Error("MODO_INVALIDO. Use --dry-run ou --send, nunca os dois.");
  }

  if (!jobIdArgument && !allPending) {
    throw new Error("SELECAO_OBRIGATORIA. Use --job-id ou --all-pending.");
  }

  if (allPending && !dryRun && !send) {
    throw new Error(
      "MODO_DO_LOTE_OBRIGATORIO. Use --all-pending --dry-run ou --all-pending --send.",
    );
  }

  await initializeDatabase();

  const resumePath = resolveResumePath();

  const options = {
    dryRun,
    resumePath,
  };

  if (allPending) {
    await processPendingJobs(options);
    return;
  }

  const jobId = Number(jobIdArgument);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("JOB_ID_INVALIDO");
  }

  await processSingleJob(jobId, options);
}

start().catch((error) => {
  console.error("");
  console.error("ERRO NA CANDIDATURA:");
  console.error(error.message);
  console.error("");

  process.exitCode = 1;
});
