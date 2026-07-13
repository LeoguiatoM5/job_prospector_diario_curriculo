import WebSearchCollector from "../collectors/WebSearchCollector.js";

import blockedDomains from "../config/blockedDomains.js";

class OfficialCompanySiteDiscoveryService {
  async discover(companyName, jobTitle = "") {
    if (!companyName) {
      return {
        found: false,
        reason: "EMPRESA_NAO_INFORMADA",
      };
    }

    const jobContext = this.getJobContext(jobTitle);

    const queries = [
      `"${companyName}" "${jobContext}"`,
      `"${companyName}" hiring "${jobContext}"`,
      `"${companyName}" careers`,
      `"${companyName}" jobs`,
      `"${companyName}" site oficial`,
      `"${companyName}" official website`,
    ].filter(
      (query, index, queriesList) =>
        query && !query.includes('""') && queriesList.indexOf(query) === index,
    );

    for (const query of queries) {
      const results = await WebSearchCollector.search(query);

      for (const result of results) {
        const candidate = this.createCandidate(
          result,
          companyName,
          jobContext,
          query,
        );

        if (!candidate) {
          continue;
        }

        return {
          found: true,
          company: companyName,
          site: candidate.site,
          domain: candidate.domain,
          source: "WEB_FALLBACK",
          sourceUrl: result.link,
          query,
        };
      }

      await this.wait(1100);
    }

    return {
      found: false,
      company: companyName,
      reason: "SITE_OFICIAL_NAO_LOCALIZADO",
    };
  }

  createCandidate(result, companyName, jobContext, query) {
    const domain = this.extractDomain(result.link);

    if (!domain) {
      return null;
    }

    if (this.isBlockedDomain(domain)) {
      return null;
    }

    const institutionalDomain = this.getInstitutionalDomain(domain);

    const domainName = institutionalDomain.split(".")[0];

    const normalizedDomainName = this.normalizeDomain(domainName);

    const companyTokens = this.getCompanyTokens(companyName);

    if (companyTokens.length === 0) {
      return null;
    }

    const domainMatches = companyTokens.some(
      (token) => normalizedDomainName === token,
    );

    if (!domainMatches) {
      return null;
    }

    const searchContent = this.normalize(`
      ${result.titulo || ""}
      ${result.snippet || ""}
    `);

    if (!this.hasCompanyContext(searchContent, companyName)) {
      return null;
    }

    if (
      this.isContextualQuery(query) &&
      !this.hasJobContext(searchContent, jobContext)
    ) {
      return null;
    }

    if (this.isCareerQuery(query) && !this.hasCareerContext(searchContent)) {
      return null;
    }

    return {
      site: this.createOrigin(result.link, institutionalDomain),
      domain: institutionalDomain,
    };
  }

  hasCompanyContext(searchContent, companyName) {
    const companyTokens = this.getCompanyContextTokens(companyName);

    if (companyTokens.length === 0) {
      return false;
    }

    const matchedTokens = companyTokens.filter((token) =>
      searchContent.includes(token),
    );

    if (companyTokens.length === 1) {
      return matchedTokens.length === 1;
    }

    return matchedTokens.length >= 2;
  }

  getJobContext(jobTitle) {
    const ignoredTerms = new Set([
      "remote",
      "remoto",
      "remota",
      "senior",
      "junior",
      "pleno",
      "mid",
      "sr",
      "jr",
      "contract",
      "month",
      "meses",
      "brasil",
      "brazil",
    ]);

    return this.normalize(jobTitle)
      .split(" ")
      .filter((token) => token.length >= 3)
      .filter((token) => !ignoredTerms.has(token))
      .slice(0, 4)
      .join(" ");
  }

  hasJobContext(searchContent, jobContext) {
    if (!jobContext) {
      return true;
    }

    const jobTokens = jobContext
      .split(" ")
      .filter((token) => token.length >= 3);

    return jobTokens.some((token) => searchContent.includes(token));
  }

  hasCareerContext(searchContent) {
    const careerTerms = [
      "career",
      "careers",
      "jobs",
      "job",
      "hiring",
      "vaga",
      "vagas",
      "carreira",
      "carreiras",
      "trabalhe conosco",
      "work with us",
      "join us",
      "recruitment",
    ];

    return careerTerms.some((term) => searchContent.includes(term));
  }

  isContextualQuery(query) {
    const normalizedQuery = this.normalize(query);

    return (
      !normalizedQuery.includes("site oficial") &&
      !normalizedQuery.includes("official website") &&
      !normalizedQuery.includes("careers") &&
      !normalizedQuery.includes("jobs")
    );
  }

  isCareerQuery(query) {
    const normalizedQuery = this.normalize(query);

    return (
      normalizedQuery.includes("careers") || normalizedQuery.includes("jobs")
    );
  }

  getCompanyTokens(companyName) {
    const ignoredTerms = new Set([
      "grupo",
      "tecnologia",
      "technology",
      "educacao",
      "education",
      "consultoria",
      "assessoria",
      "pessoas",
      "software",
      "development",
      "digital",
      "brasil",
      "brazil",
      "uol",
    ]);

    return this.normalize(companyName)
      .split(" ")
      .filter((token) => token.length >= 4)
      .filter((token) => !ignoredTerms.has(token));
  }

  getCompanyContextTokens(companyName) {
    const ignoredTerms = new Set(["de", "da", "do", "das", "dos", "e", "and"]);

    return this.normalize(companyName)
      .split(" ")
      .filter((token) => token.length >= 3)
      .filter((token) => !ignoredTerms.has(token));
  }

  getInstitutionalDomain(domain) {
    const removableSubdomains = [
      "www",
      "blog",
      "ri",
      "parceiros",
      "career",
      "careers",
      "carreiras",
      "jobs",
      "go",
    ];

    const parts = domain.split(".");

    if (parts.length > 2 && removableSubdomains.includes(parts[0])) {
      parts.shift();
    }

    return parts.join(".");
  }

  createOrigin(value, domain) {
    try {
      const url = new URL(value);

      return `${url.protocol}//${domain}`;
    } catch {
      return null;
    }
  }

  isBlockedDomain(domain) {
    return blockedDomains.some(
      (blockedDomain) =>
        domain === blockedDomain || domain.endsWith(`.${blockedDomain}`),
    );
  }

  extractDomain(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  }

  normalizeDomain(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]/g, "");
  }

  normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

export default new OfficialCompanySiteDiscoveryService();
