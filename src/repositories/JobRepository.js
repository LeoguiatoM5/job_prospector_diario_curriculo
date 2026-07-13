import database from "../database/database.js";

class JobRepository {
  create(job) {
    const repository = this;

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO jobs (
          empresa,
          cargo,
          descricao,
          modalidade,
          localizacao,
          link,
          fonte,
          email,
          company_site,
          company_domain,
          identity_source,
          channel_type,
          channel_value,
          channel_source,
          channel_source_url,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        job.empresa,
        job.cargo,
        job.descricao,
        job.modalidade,
        job.localizacao,
        job.link,
        job.fonte,
        job.email,
        job.companySite,
        job.companyDomain,
        job.identitySource,
        job.channelType,
        job.channelValue,
        job.channelSource,
        job.channelSourceUrl,
        job.status,
      ];

      database.run(query, values, async function (error) {
        if (error) {
          if (error.code === "SQLITE_CONSTRAINT") {
            try {
              const enrichment = await repository.enrichByLink(job);

              resolve({
                created: false,
                reason: "DUPLICADA",
                enriched: enrichment.updated,
              });
            } catch (enrichmentError) {
              reject(enrichmentError);
            }

            return;
          }

          reject(error);
          return;
        }

        resolve({
          created: true,
          id: this.lastID,
        });
      });
    });
  }

  enrichByLink(job) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE jobs
        SET
          email = COALESCE(?, email),
          company_site = COALESCE(?, company_site),
          company_domain = COALESCE(?, company_domain),
          identity_source = COALESCE(?, identity_source),
          channel_type = COALESCE(?, channel_type),
          channel_value = COALESCE(?, channel_value),
          channel_source = COALESCE(?, channel_source),
          channel_source_url = COALESCE(?, channel_source_url),
          updated_at = CURRENT_TIMESTAMP
        WHERE link = ?
      `;

      const values = [
        job.email,
        job.companySite,
        job.companyDomain,
        job.identitySource,
        job.channelType,
        job.channelValue,
        job.channelSource,
        job.channelSourceUrl,
        job.link,
      ];

      database.run(query, values, function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          updated: this.changes > 0,
        });
      });
    });
  }

  findById(jobId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *
        FROM jobs
        WHERE id = ?
        LIMIT 1
      `;

      database.get(query, [jobId], (error, row) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(row || null);
      });
    });
  }

  findEmailApplicationsPending() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *
        FROM jobs
        WHERE channel_type = 'EMAIL'
          AND email IS NOT NULL
          AND TRIM(email) <> ''
          AND (
            application_status IS NULL
            OR application_status = 'PENDENTE'
            OR application_status = 'ERRO'
          )
        ORDER BY id ASC
      `;

      database.all(query, [], (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      });
    });
  }

  markApplicationSending(jobId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE jobs
        SET
          application_status = 'ENVIANDO',
          application_attempts = COALESCE(application_attempts, 0) + 1,
          application_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND channel_type = 'EMAIL'
          AND email IS NOT NULL
          AND TRIM(email) <> ''
          AND (
            application_status IS NULL
            OR application_status = 'PENDENTE'
            OR application_status = 'ERRO'
          )
      `;

      database.run(query, [jobId], function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          updated: this.changes > 0,
        });
      });
    });
  }

  markApplicationSent(jobId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE jobs
        SET
          application_status = 'ENVIADA',
          application_sent_at = CURRENT_TIMESTAMP,
          application_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND application_status = 'ENVIANDO'
      `;

      database.run(query, [jobId], function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          updated: this.changes > 0,
        });
      });
    });
  }

  markApplicationError(jobId, errorMessage) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE jobs
        SET
          application_status = 'ERRO',
          application_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND application_status = 'ENVIANDO'
      `;

      database.run(query, [errorMessage, jobId], function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          updated: this.changes > 0,
        });
      });
    });
  }

  findAll() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *
        FROM jobs
        ORDER BY id ASC
      `;

      database.all(query, [], (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      });
    });
  }

  count() {
    return new Promise((resolve, reject) => {
      database.get("SELECT COUNT(*) AS total FROM jobs", [], (error, row) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(row.total);
      });
    });
  }
}

export default new JobRepository();
