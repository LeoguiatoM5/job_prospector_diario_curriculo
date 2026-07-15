# Job Prospector

Automação em Node.js para localizar vagas disponíveis para pessoas no Brasil conforme a busca que o usuário deseja, identificar canais públicos de candidatura e, quando houver um e-mail de recrutamento, enviar o currículo por SMTP.

> **Atenção:** o envio de candidaturas é real. Antes de usar `--send` ou `npm run daily`, revise o destinatário, o currículo, o texto da mensagem e todas as variáveis SMTP. Comece sempre pelo modo `--dry-run`.

## Como funciona

O projeto executa o seguinte fluxo:

1. Pesquisa vagas recentes usando a API da LangSearch.
2. Acessa as páginas encontradas e extrai dados estruturados `JobPosting` (JSON-LD).
3. Valida a regra de negócio:

   ```text
   EXEMPLO : QA + REMOTO + BRASIL = VAGA VÁLIDA
   ```

4. Tenta identificar o site oficial da empresa.
5. Procura um e-mail público de recrutamento ou outro canal de candidatura.
6. Salva as vagas válidas em um banco SQLite, sem duplicar links já registrados.
7. Opcionalmente, envia o currículo em PDF para as vagas que possuem um e-mail público.

## Tecnologias

- Node.js 20+
- SQLite
- Axios
- Cheerio
- Nodemailer
- Docker (opcional)
- LangSearch Web Search API

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Uma chave da [LangSearch](https://langsearch.com/) para realizar as buscas
- Uma conta SMTP, caso queira enviar candidaturas
- Currículo em formato PDF, caso queira enviar candidaturas

## Instalação

Clone o repositório e instale as dependências:

```bash
git clone <URL_DO_REPOSITORIO>
cd job-prospector
npm ci
```

Crie um arquivo `.env` na raiz do projeto:

```env
# Obrigatória para a prospecção
LANGSEARCH_API_KEY=sua_chave_langsearch

# Opcional: local do banco SQLite
DATABASE_PATH=./jobs.sqlite

# Obrigatória para envio de candidaturas
RESUME_PATH=./curriculo.pdf
SMTP_HOST=smtp.exemplo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@exemplo.com
SMTP_PASS=sua_senha_ou_app_password
SMTP_FROM="Seu Nome <usuario@exemplo.com>"
```

Não publique o arquivo `.env`, senhas SMTP, chaves de API, currículo ou banco de dados. Esses arquivos já devem permanecer fora do versionamento.

### Configuração SMTP

Use os dados fornecidos pelo seu provedor de e-mail. Em geral:

- Porta `465`: normalmente usa `SMTP_SECURE=true`.
- Porta `587`: normalmente usa `SMTP_SECURE=false` e inicia TLS durante a conexão.
- Contas com autenticação em duas etapas geralmente exigem uma senha de aplicativo.

## Personalize a candidatura

Antes de qualquer envio real, altere as funções `buildSubject` e `buildBody` em `src/applyEmail.js`. O texto atual contém nome, apresentação e assinatura específicos do autor original.

Também confirme que `RESUME_PATH` aponta para o seu próprio currículo em PDF.

## Uso

O projeto pode ser usado de duas formas:

- **Windows:** execução manual ou automática pelo Agendador de Tarefas.
- **Railway:** execução na nuvem como um Cron Job, sem precisar manter o computador ligado.

As duas opções usam as mesmas variáveis de ambiente e o mesmo fluxo de prospecção e candidatura descrito abaixo.

### 1. Prospectar e registrar vagas

```bash
npm start
```

Esse comando pesquisa, valida e salva vagas no SQLite. Ele não envia e-mails.

Durante a execução, o terminal mostra as vagas encontradas, identidades das empresas, canais de contato e um resumo da coleta.

Para executar com recarregamento automático durante o desenvolvimento:

```bash
npm run dev
```

### 2. Simular uma candidatura específica

Substitua `123` pelo ID da vaga no SQLite:

```bash
npm run apply:email -- --job-id 123 --dry-run
```

O modo `--dry-run` exibe destinatário, assunto, corpo e anexo, mas não envia o e-mail nem altera o status da candidatura.

### 3. Enviar uma candidatura específica

Depois de conferir o dry run:

```bash
npm run apply:email -- --job-id 123 --send
```

### 4. Simular todas as candidaturas pendentes

```bash
npm run apply:email -- --all-pending --dry-run
```

### 5. Enviar todas as candidaturas pendentes

```bash
npm run apply:email -- --all-pending --send
```

Esse comando envia e-mails reais, um por vez, para todas as vagas elegíveis ainda pendentes ou com erro anterior.

### 6. Executar o fluxo diário completo

```bash
npm run daily
```

O fluxo diário realiza duas etapas:

1. Prospecção e persistência das vagas.
2. Envio real de todas as candidaturas por e-mail pendentes.

Por segurança, não use esse comando até validar a configuração com `--dry-run`.

## Scripts disponíveis

| Comando                      | Descrição                                               |
| ---------------------------- | ------------------------------------------------------- |
| `npm start`                  | Pesquisa e registra vagas válidas                       |
| `npm run dev`                | Executa a prospecção com modo watch                     |
| `npm run apply:email -- ...` | Simula ou envia candidaturas por e-mail                 |
| `npm run apply:geekhunter -- ...` | Valida ou envia uma candidatura pública da GeekHunter |
| `npm run run:geekhunter -- ...` | Busca QA remoto na GeekHunter e processa as candidaturas |
| `npm run daily`              | Prospecta vagas e envia todas as candidaturas pendentes |

No fluxo diário, a GeekHunter roda depois das candidaturas por e-mail. Vagas
com perguntas adicionais não são respondidas automaticamente: a URL é enviada
para `GEEKHUNTER_CANDIDATE_EMAIL`. O SQLite registra as URLs processadas para
evitar novos envios nos próximos cron jobs.

## Execução com Docker

A imagem instala Chromium e define `CHROME_PATH=/usr/bin/chromium`. No deploy,
configure também todas as variáveis `GEEKHUNTER_*` apresentadas no
`.env.example`, mantenha `DATABASE_PATH` em volume persistente e disponibilize o
currículo indicado por `RESUME_PATH` dentro do container.

Crie a imagem:

```bash
docker build -t job-prospector .
```

Execute apenas a prospecção, persistindo o banco em um volume local:

```bash
docker run --rm \
  --env-file .env \
  -e DATABASE_PATH=/data/jobs.sqlite \
  -v "$(pwd)/data:/data" \
  qa-job-prospector
```

Para disponibilizar o currículo dentro do container, monte também o PDF e configure `RESUME_PATH` para o caminho interno:

```bash
docker run --rm \
  --env-file .env \
  -e DATABASE_PATH=/data/jobs.sqlite \
  -e RESUME_PATH=/documents/curriculo.pdf \
  -v "$(pwd)/data:/data" \
  -v "$(pwd)/curriculo.pdf:/documents/curriculo.pdf:ro" \
  qa-job-prospector npm run apply:email -- --all-pending --dry-run
```

No PowerShell, substitua `$(pwd)` por `${PWD}` se necessário.

## Opção 1: executar no Windows

### Execução manual

No PowerShell, acesse a pasta do projeto:

```powershell
cd D:\caminho\para\job-prospector
npm ci
```

Crie o arquivo `.env` conforme a seção de instalação e comece apenas pela prospecção:

```powershell
npm start
```

Antes de enviar candidaturas, faça uma simulação:

```powershell
npm run apply:email -- --all-pending --dry-run
```

Quando o currículo, os destinatários e a mensagem estiverem corretos, o fluxo completo pode ser executado com:

```powershell
npm run daily
```

Esse último comando envia candidaturas reais.

### Execução automática pelo Agendador de Tarefas

O arquivo `run-daily.bat` executa `npm run daily` e grava a saída em `logs/daily.log`.

1. Abra `run-daily.bat` e substitua o caminho depois de `cd /d` pelo diretório real do projeto.
2. Execute o arquivo manualmente uma vez e confira `logs/daily.log`.
3. Abra o **Agendador de Tarefas** do Windows.
4. Selecione **Criar Tarefa Básica** e escolha a frequência desejada.
5. Em **Ação**, selecione **Iniciar um programa**.
6. Informe o caminho completo de `run-daily.bat`.
7. Salve a tarefa e teste sua execução.

O computador precisa estar ligado e com acesso à internet no horário agendado. A conta usada pela tarefa também precisa ter permissão para acessar o projeto, o `.env`, o currículo e o SQLite.

## Opção 2: executar no Railway

O projeto não é uma aplicação web e não abre uma porta HTTP. No Railway, ele deve ser configurado como um **Cron Job**: o serviço inicia no horário definido, executa o comando e termina. Consulte a documentação oficial sobre [Cron Jobs](https://docs.railway.com/cron-jobs), [variáveis](https://docs.railway.com/variables) e [volumes](https://docs.railway.com/volumes/reference).

### 1. Criar o projeto

1. Publique este código em um repositório no GitHub.
2. Entre no Railway e selecione **New Project**.
3. Escolha **Deploy from GitHub Repo**.
4. Autorize o acesso e selecione o repositório.

O Railway detecta automaticamente o `Dockerfile` localizado na raiz e o utiliza para construir a imagem. Veja a documentação de [Dockerfiles no Railway](https://docs.railway.com/builds/dockerfiles).

### 2. Configurar as variáveis

Abra o serviço e acesse **Variables**. Cadastre:

```env
LANGSEARCH_API_KEY=sua_chave_langsearch
DATABASE_PATH=/data/jobs.sqlite
RESUME_PATH=/data/curriculo.pdf
SMTP_HOST=smtp.exemplo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@exemplo.com
SMTP_PASS=sua_senha_ou_app_password
SMTP_FROM=Seu Nome <usuario@exemplo.com>
```

Se quiser executar somente a prospecção, apenas `LANGSEARCH_API_KEY` e `DATABASE_PATH` são necessárias. As variáveis `RESUME_PATH` e `SMTP_*` são obrigatórias para envios.

Não coloque essas credenciais diretamente no GitHub. Variáveis adicionadas ou alteradas no Railway precisam ser aplicadas ao deployment para entrarem em vigor.

### 3. Adicionar armazenamento persistente

O sistema de arquivos normal do deployment não deve ser usado para persistir o SQLite. Para preservar vagas e status entre execuções:

1. Adicione um **Volume** ao serviço.
2. Defina o caminho de montagem como `/data`.
3. Configure `DATABASE_PATH=/data/jobs.sqlite`.

Para realizar envios, o currículo também precisa existir dentro do container no caminho indicado por `RESUME_PATH`. Mantenha o PDF em armazenamento privado e disponibilize-o no volume como `/data/curriculo.pdf`, ou ajuste `RESUME_PATH` para o local privado utilizado na sua implantação. Não publique o currículo em um repositório público.

### 4. Escolher o comando de início

Em **Settings**, configure o **Start Command** conforme o comportamento desejado:

| Objetivo                                   | Start Command                                    |
| ------------------------------------------ | ------------------------------------------------ |
| Apenas prospectar e registrar vagas        | `npm start`                                      |
| Prospectar e enviar candidaturas pendentes | `npm run daily`                                  |
| Conferir candidaturas sem enviar           | `npm run apply:email -- --all-pending --dry-run` |

O `Dockerfile` usa `npm start` por padrão. Portanto, é necessário sobrescrever o Start Command para `npm run daily` caso queira que o Railway também envie as candidaturas.

### 5. Testar antes de agendar

Faça primeiro um deployment com este Start Command:

```text
npm run apply:email -- --all-pending --dry-run
```

Confira os logs e confirme:

- Currículo correto
- Nome e assinatura personalizados
- Destinatários esperados
- Configuração SMTP válida
- Banco salvo em `/data/jobs.sqlite`

Depois do teste, escolha `npm start` ou `npm run daily` como comando definitivo.

### 6. Configurar o Cron Job

No serviço, abra **Settings > Cron Schedule** e informe uma expressão cron. O Railway interpreta os horários em **UTC**, não no horário de Brasília.

Exemplo para executar todos os dias às 09:00 no horário de Brasília (12:00 UTC, enquanto Brasília estiver em UTC−3):

```cron
0 12 * * *
```

Exemplo para executar todos os dias às 06:00 UTC:

```cron
0 6 * * *
```

O Railway pode atrasar a execução em alguns minutos. Se uma execução anterior ainda estiver ativa, a próxima será ignorada. Verifique nos logs se o processo termina após apresentar o resumo.

### 7. Conferir o deployment

Após salvar as configurações:

1. Execute o job manualmente uma vez.
2. Abra **Deploy Logs**.
3. Confirme que a prospecção foi concluída.
4. Confirme que o total do SQLite permanece nas execuções seguintes.
5. Se estiver usando `npm run daily`, confirme os status de envio e revise a caixa de e-mails enviados.

Não é necessário gerar um domínio público no Railway, pois este projeto não oferece página web ou API.

## Dados armazenados

O SQLite registra, entre outros dados:

- Empresa, cargo, descrição e URL da vaga
- Modalidade e localização
- Site e domínio identificados para a empresa
- Tipo e valor do canal de candidatura
- E-mail público encontrado
- Status e quantidade de tentativas de candidatura
- Datas de criação, atualização e envio

Por padrão, o banco é criado em `./jobs.sqlite`. Defina `DATABASE_PATH` para usar outro local.

## Estrutura do projeto

```text
src/
├── collectors/     # Busca web e leitura das páginas
├── config/         # Consultas e domínios bloqueados
├── database/       # Inicialização e evolução do SQLite
├── pipeline/       # Orquestração do processamento das vagas
├── repositories/   # Consultas e persistência no banco
├── services/       # Extração, identidade, contatos e envio de e-mail
├── validators/     # Regra QA + remoto + Brasil
├── index.js        # Prospecção de vagas
├── applyEmail.js   # Dry run e envio de candidaturas
└── daily.js        # Prospecção seguida de envios pendentes
```

## Limitações importantes

- A coleta depende da disponibilidade e dos limites da LangSearch.
- Apenas páginas com dados estruturados `JobPosting` são processadas como vagas.
- Sites que renderizam todo o conteúdo via JavaScript podem não ser lidos corretamente.
- A identificação de empresa, localização, modalidade e contatos usa heurísticas e pode produzir falsos positivos ou negativos.
- Somente e-mails públicos que correspondem ao domínio identificado da empresa são considerados.
- Canais como formulário ou página de carreiras são registrados, mas o envio automático atual funciona somente por e-mail.
- Revise cada candidatura e respeite os termos dos sites, as regras do provedor de e-mail e a legislação aplicável.

## Segurança e uso responsável

- Nunca faça commit do `.env` ou do currículo.
- Use uma senha de aplicativo SMTP quando disponível.
- Faça dry run antes de qualquer envio.
- Evite disparos em massa sem revisão.
- Confirme que os endereços encontrados são públicos e destinados a recrutamento.
- O usuário é responsável pelo conteúdo e pelos envios realizados com o software.

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE).
