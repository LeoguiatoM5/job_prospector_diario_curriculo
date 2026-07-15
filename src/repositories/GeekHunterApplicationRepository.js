import database from "../database/database.js";

class GeekHunterApplicationRepository {
  find(url) {
    return new Promise((resolve, reject) => {
      database.get(
        "SELECT * FROM geekhunter_applications WHERE url = ? LIMIT 1",
        [url],
        (error, row) => error ? reject(error) : resolve(row || null),
      );
    });
  }

  save({ url, title, status, error = null }) {
    return new Promise((resolve, reject) => {
      database.run(`
        INSERT INTO geekhunter_applications (url, title, status, error)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          error = excluded.error,
          updated_at = CURRENT_TIMESTAMP
      `, [url, title, status, error], (dbError) => {
        if (dbError) reject(dbError);
        else resolve();
      });
    });
  }
}

export default new GeekHunterApplicationRepository();
