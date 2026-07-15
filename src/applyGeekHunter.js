import "dotenv/config";

import GeekHunterApplicationService from "./services/GeekHunterApplicationService.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const url = argument("--url");
  const send = process.argv.includes("--send");
  if (!url) throw new Error("URL_OBRIGATORIA. Use --url <vaga-geekhunter>.");

  const result = await GeekHunterApplicationService.apply(url, { dryRun: !send });
  console.log(JSON.stringify({
    modo: send ? "ENVIO" : "DRY_RUN",
    enviada: result.sent,
    vaga: result.inspection.title,
    url: result.inspection.url,
    criterios: result.inspection.validation,
    captcha: result.inspection.hasCaptcha,
    camposSalario: result.inspection.salaryFields,
  }, null, 2));
}

main().catch((error) => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
});
