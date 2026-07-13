import axios from "axios";
import * as cheerio from "cheerio";

class PageContentCollector {
  async collect(input, options = {}) {
    const searchResult = this.normalizeInput(input);

    if (!searchResult?.link) {
      return {
        success: false,
        reason: "URL_NAO_INFORMADA",
        link: null,
      };
    }

    try {
      const response = await axios.get(searchResult.link, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        },
      });

      const contentType = response.headers["content-type"] || "";

      if (!contentType.includes("text/html")) {
        return {
          success: false,
          reason: "CONTEUDO_NAO_HTML",
          link: searchResult.link,
        };
      }

      const $ = cheerio.load(response.data);

      const finalUrl = response.request?.res?.responseUrl || searchResult.link;

      const jobPosting = this.extractJobPosting($);

      const links = this.extractLinks($, finalUrl);

      const hasPublicForm = $("form").length > 0;

      const textoInstitucional = options.includeInstitutionalText
        ? this.extractInstitutionalText($)
        : null;

      $("script").remove();
      $("style").remove();
      $("noscript").remove();
      $("svg").remove();
      $("nav").remove();
      $("header").remove();
      $("footer").remove();

      const title =
        $("h1").first().text().trim() ||
        $("title").first().text().trim() ||
        searchResult.titulo ||
        "";

      const contentElement = $("main").first().length
        ? $("main").first()
        : $("article").first().length
          ? $("article").first()
          : $("body");

      const text = this.normalizeText(contentElement.text());

      if (!text && !textoInstitucional) {
        return {
          success: false,
          reason: "CONTEUDO_VAZIO",
          link: searchResult.link,
        };
      }

      const unavailableReason = this.detectUnavailablePage(
        title,
        text || textoInstitucional,
      );

      if (unavailableReason) {
        return {
          success: false,
          reason: unavailableReason,
          titulo: title,
          link: searchResult.link,
        };
      }

      return {
        success: true,
        titulo: this.normalizeText(title),
        texto: text,
        textoInstitucional,
        links,
        hasPublicForm,
        jobPosting,
        link: finalUrl,
        fonte: searchResult.fonte || null,
        query: searchResult.query || null,
      };
    } catch (error) {
      return {
        success: false,
        reason: "ERRO_HTTP",
        status: error.response?.status || null,
        message: error.message,
        link: searchResult.link,
      };
    }
  }

  normalizeInput(input) {
    if (typeof input === "string") {
      return {
        link: input,
        titulo: "",
        fonte: "URL_DIRETA",
        query: null,
      };
    }

    if (input && typeof input === "object") {
      return input;
    }

    return null;
  }

  extractJobPosting($) {
    let jobPosting = null;

    $('script[type="application/ld+json"]').each((_, element) => {
      if (jobPosting) {
        return;
      }

      try {
        const content = $(element).html();

        if (!content) {
          return;
        }

        const data = JSON.parse(content);

        jobPosting = this.findJobPosting(data);
      } catch {
        // JSON-LD inválido. Continua procurando.
      }
    });

    return jobPosting;
  }

  findJobPosting(data) {
    if (!data) {
      return null;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        const result = this.findJobPosting(item);

        if (result) {
          return result;
        }
      }

      return null;
    }

    if (typeof data !== "object") {
      return null;
    }

    const types = Array.isArray(data["@type"])
      ? data["@type"]
      : [data["@type"]];

    if (types.includes("JobPosting")) {
      return data;
    }

    if (data["@graph"]) {
      return this.findJobPosting(data["@graph"]);
    }

    return null;
  }

  extractInstitutionalText($) {
    const content = $("body").clone();

    content.find("script, style, noscript, svg").remove();

    return this.normalizeText(content.text());
  }

  extractLinks($, baseUrl) {
    const links = new Map();

    $("a[href]").each((_, element) => {
      const hrefValue = String($(element).attr("href") || "").trim();

      if (!hrefValue || hrefValue === "#") {
        return;
      }

      try {
        const url = new URL(hrefValue, baseUrl);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return;
        }

        const href = url.href;

        if (!links.has(href)) {
          links.set(href, {
            text: this.normalizeText($(element).text()),
            href,
            domain: url.hostname.replace(/^www\./, "").toLowerCase(),
          });
        }
      } catch {
        // Link inválido. Continua analisando os demais.
      }
    });

    return [...links.values()];
  }

  detectUnavailablePage(title, text) {
    const content = this.normalizeText(`${title} ${text}`).toLowerCase();

    const unavailableTerms = [
      "vaga não encontrada",
      "vaga nao encontrada",
      "vaga encerrada",
      "oportunidade encerrada",
      "job not found",
      "job is no longer available",
      "position has been filled",
      "this job has expired",
    ];

    const term = unavailableTerms.find((item) => content.includes(item));

    if (!term) {
      return null;
    }

    return "VAGA_INDISPONIVEL";
  }

  normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export default new PageContentCollector();
