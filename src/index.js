import "dotenv/config";

import WebSearchCollector from "./collectors/WebSearchCollector.js";

import PageContentCollector from "./collectors/PageContentCollector.js";

import JobPostingExtractor from "./services/JobPostingExtractor.js";

import searchQueries from "./config/searchQueries.js";

import JobPipeline from "./pipeline/JobPipeline.js";

import JobRepository from "./repositories/JobRepository.js";

import { initializeDatabase } from "./database/database.js";

function removeDuplicateResults(results) {
  const uniqueResults = new Map();

  for (const result of results) {
    if (!result.link) {
      continue;
    }

    if (!uniqueResults.has(result.link)) {
      uniqueResults.set(result.link, result);
    }
  }

  return [...uniqueResults.values()];
}

async function start() {
  console.clear();

  console.log("==========================================");
  console.log(" QA JOB PROSPECTOR");
  console.log("==========================================");
  console.log("");

  await initializeDatabase();

  const searchResults = await WebSearchCollector.collect(searchQueries);

  const uniqueResults = removeDuplicateResults(searchResults);

  let jobPostings = 0;
  let validJobs = 0;
  let discardedJobs = 0;
  let identitiesFound = 0;
  let identitiesNotFound = 0;
  let channelsFound = 0;
  let channelsNotFound = 0;
  let registered = 0;
  let duplicated = 0;

  console.log("==========================================");
  console.log(" PROCESSAMENTO DE VAGAS");
  console.log("==========================================");
  console.log("");

  for (const result of uniqueResults) {
    const page = await PageContentCollector.collect(result);

    if (!page.success || !page.jobPosting) {
      continue;
    }

    jobPostings++;

    const job = JobPostingExtractor.extract(page);

    if (!job) {
      continue;
    }

    const pipelineResult = await JobPipeline.process(job, page);

    if (!pipelineResult.validation.valid) {
      discardedJobs++;
      continue;
    }

    validJobs++;

    console.log("==========================================");
    console.log(`Empresa : ${job.empresa}`);
    console.log(`Cargo   : ${job.cargo}`);
    console.log(`Vaga    : ${job.link}`);
    console.log("");

    const { identity, contact, persistence } = pipelineResult;

    if (!identity.found) {
      identitiesNotFound++;

      console.log("IDENTIDADE : NÃO LOCALIZADA");
      console.log(`MOTIVO     : ${identity.reason}`);
    } else {
      identitiesFound++;

      console.log("IDENTIDADE : LOCALIZADA");
      console.log(`Site       : ${identity.site}`);
      console.log(`Domínio    : ${identity.domain}`);
      console.log(`Fonte      : ${identity.source}`);
    }

    console.log("");

    console.log("------------------------------------------");
    console.log(" CANAL");
    console.log("------------------------------------------");
    console.log("");

    if (!contact?.found) {
      channelsNotFound++;
      console.log("CANAL   : NÃO LOCALIZADO");
      console.log(`MOTIVO  : ${contact?.reason || "IDENTIDADE_NAO_LOCALIZADA"}`);
    } else {
      channelsFound++;
      console.log("CANAL   : LOCALIZADO");
      console.log(`Tipo    : ${contact.type}`);
      console.log(`Valor   : ${contact.value}`);
      console.log(`Fonte   : ${contact.source}`);
      console.log(`Origem  : ${contact.sourceUrl}`);
    }

    console.log("");
    console.log("PERSISTÊNCIA:");

    if (persistence.created) {
      registered++;
      console.log("REGISTRADA");
    } else if (persistence.reason === "DUPLICADA") {
      duplicated++;
      console.log("DUPLICADA");
    } else {
      console.log(persistence.reason);
    }

    console.log("");
  }

  console.log("==========================================");
  console.log(" RESUMO");
  console.log("==========================================");
  console.log("");

  const totalInDatabase = await JobRepository.count();

  console.log(`Resultados web         : ${searchResults.length}`);
  console.log(`URLs únicas            : ${uniqueResults.length}`);
  console.log(`JobPosting encontrados : ${jobPostings}`);
  console.log(`Vagas válidas          : ${validJobs}`);
  console.log(`Vagas descartadas      : ${discardedJobs}`);
  console.log(`Identidades encontradas: ${identitiesFound}`);
  console.log(`Identidades não achadas: ${identitiesNotFound}`);
  console.log(`Canais encontrados     : ${channelsFound}`);
  console.log(`Canais não encontrados : ${channelsNotFound}`);
  console.log(`Registradas agora      : ${registered}`);
  console.log(`Duplicadas             : ${duplicated}`);
  console.log(`Total no SQLite        : ${totalInDatabase}`);
  console.log("");
}

start().catch((error) => {
  console.error("");
  console.error("ERRO NA EXECUÇÃO:");
  console.error(error);
});
