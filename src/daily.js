import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const srcDirectory = path.dirname(currentFilePath);
const projectDirectory = path.resolve(srcDirectory, "..");

function runNode(scriptPath, args, stageName) {
  return new Promise((resolve, reject) => {
    console.log("");
    console.log("==========================================");
    console.log(` ${stageName}`);
    console.log("==========================================");
    console.log("");

    const absoluteScriptPath = path.join(projectDirectory, scriptPath);

    const childProcess = spawn(
      process.execPath,
      [absoluteScriptPath, ...args],
      {
        cwd: projectDirectory,
        env: process.env,
        stdio: "inherit",
      },
    );

    childProcess.on("error", (error) => {
      reject(new Error(`${stageName}_NAO_INICIADA: ${error.message}`));
    });

    childProcess.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`${stageName}_FALHOU_COM_CODIGO_${exitCode}`));

        return;
      }

      resolve();
    });
  });
}

async function start() {
  const startedAt = new Date();

  console.log("");
  console.log("==========================================");
  console.log(" QA JOB PROSPECTOR - EXECUÇÃO DIÁRIA");
  console.log("==========================================");
  console.log("");
  console.log(`Início: ${startedAt.toLocaleString("pt-BR")}`);

  await runNode("src/index.js", [], "ETAPA 1 - PROSPECÇÃO DE VAGAS");

  await runNode(
    "src/applyEmail.js",
    ["--all-pending", "--send"],
    "ETAPA 2 - CANDIDATURAS POR EMAIL",
  );

  const finishedAt = new Date();

  console.log("");
  console.log("==========================================");
  console.log(" EXECUÇÃO DIÁRIA FINALIZADA");
  console.log("==========================================");
  console.log("");
  console.log(`Início : ${startedAt.toLocaleString("pt-BR")}`);
  console.log(`Fim    : ${finishedAt.toLocaleString("pt-BR")}`);
  console.log("");
}

start().catch((error) => {
  console.error("");
  console.error("==========================================");
  console.error(" ERRO NA EXECUÇÃO DIÁRIA");
  console.error("==========================================");
  console.error("");
  console.error(error.message);
  console.error("");

  process.exitCode = 1;
});
