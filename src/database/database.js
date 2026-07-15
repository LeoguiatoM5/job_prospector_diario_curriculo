import sqlite3 from "sqlite3";

const databasePath = process.env.DATABASE_PATH || "./jobs.sqlite";

const database = new sqlite3.Database(databasePath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa TEXT NOT NULL,
        cargo TEXT NOT NULL,
        descricao TEXT,
        modalidade TEXT,
        localizacao TEXT,
        link TEXT NOT NULL UNIQUE,
        fonte TEXT,
        email TEXT,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    database.run(query, (error) => {
      if (error) {
        reject(error);
        return;
      }

      ensureColumns()
        .then(ensureGeekHunterApplicationsTable)
        .then(resolve)
        .catch(reject);
    });
  });
}

function ensureGeekHunterApplicationsTable() {
  return new Promise((resolve, reject) => {
    database.run(`
      CREATE TABLE IF NOT EXISTS geekhunter_applications (
        url TEXT PRIMARY KEY,
        title TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (error) => error ? reject(error) : resolve());
  });
}

function ensureColumns() {
  const columns = {
    company_site: "TEXT",
    company_domain: "TEXT",
    identity_source: "TEXT",
    channel_type: "TEXT",
    channel_value: "TEXT",
    channel_source: "TEXT",
    channel_source_url: "TEXT",
    application_status: "TEXT",
    application_attempts: "INTEGER DEFAULT 0",
    application_sent_at: "DATETIME",
    application_error: "TEXT",
  };

  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info(jobs)", (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      const existingColumns = new Set(rows.map((row) => row.name));

      const missingColumns = Object.entries(columns).filter(
        ([name]) => !existingColumns.has(name),
      );

      const addNextColumn = () => {
        const column = missingColumns.shift();

        if (!column) {
          resolve();
          return;
        }

        const [name, definition] = column;

        database.run(
          `ALTER TABLE jobs ADD COLUMN ${name} ${definition}`,
          (alterError) => {
            if (alterError) {
              reject(alterError);
              return;
            }

            addNextColumn();
          },
        );
      };

      addNextColumn();
    });
  });
}

export { initializeDatabase };

export default database;
