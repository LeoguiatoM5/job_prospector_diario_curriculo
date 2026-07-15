import axios from "axios";

class WebSearchCollector {
  constructor() {
    this.apiUrl = "https://api.langsearch.com/v1/web-search";
    this.requestInterval = 1100;
    this.maxAttempts = 3;
  }

  async search(query) {
    console.log(`Buscando: ${query}`);

    const apiKey = process.env.LANGSEARCH_API_KEY;

    if (!apiKey) {
      throw new Error("LANGSEARCH_API_KEY não configurada.");
    }

    const response = await axios.post(
      this.apiUrl,
      {
        query,
        freshness: "oneMonth",
        summary: true,
        count: 10,
      },
      {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data?.code !== 200) {
      throw new Error(response.data?.msg || "Erro desconhecido na LangSearch.");
    }

    const pages = response.data?.data?.webPages?.value || [];

    return pages.map((page) => ({
      titulo: page.name || "",
      snippet: page.snippet || "",
      resumo: page.summary || "",
      link: page.url || "",
      dataPublicacao: page.datePublished || null,
      fonte: "LANGSEARCH",
      query,
    }));
  }

  async searchWithRetry(query) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.search(query);
      } catch (error) {
        if (this.isRateLimitError(error) || !this.isRetryableError(error)) {
          throw error;
        }

        if (attempt === this.maxAttempts) {
          throw error;
        }

        const delay = this.requestInterval * attempt;

        console.warn(
          `Falha temporária na busca. Nova tentativa ${attempt + 1}/${this.maxAttempts} em ${delay}ms.`,
        );

        await this.wait(delay);
      }
    }
  }

  isRateLimitError(error) {
    return error?.response?.status === 429;
  }

  isRetryableError(error) {
    const status = error?.response?.status;

    return (
      status >= 500 ||
      error?.code === "ECONNABORTED" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ECONNRESET" ||
      error?.code === "ENOTFOUND"
    );
  }

  async collect(queries) {
    const allResults = [];
    let successfulSearches = 0;

    for (const query of queries) {
      try {
        const results = await this.searchWithRetry(query);

        successfulSearches++;

        console.log(`Resultados encontrados: ${results.length}`);
        console.log("");

        allResults.push(...results);
      } catch (error) {
        console.error(`Erro na busca: ${query}`);

        if (error.response) {
          console.error(`HTTP: ${error.response.status}`);
          console.error(error.response.data);

          if (this.isRateLimitError(error)) {
            throw new Error(
              "LANGSEARCH_REQUEST_LIMIT: limite de requisições atingido.",
            );
          }
        } else {
          console.error(error.message);
        }

        console.log("");
      } finally {
        await this.wait(this.requestInterval);
      }
    }

    if (successfulSearches === 0) {
      throw new Error(
        "LANGSEARCH_INDISPONIVEL: nenhuma busca foi concluída com sucesso.",
      );
    }

    return allResults;
  }

  wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

export default new WebSearchCollector();
