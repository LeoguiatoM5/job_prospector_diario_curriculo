import WebSearchCollector from "../collectors/WebSearchCollector.js";
import PageContentCollector from "../collectors/PageContentCollector.js";

class ContactWebDiscoveryService {
  async discover(companyIdentity) {
    if (
      !companyIdentity?.found ||
      !companyIdentity?.company ||
      !companyIdentity?.domain
    ) {
      return {
        found: false,
        reason: "IDENTIDADE_EMPRESA_INCOMPLETA",
      };
    }

    const companyName = companyIdentity.company;
    const companyDomain = companyIdentity.domain;

    const queries = this.buildQueries(companyName, companyDomain);

    for (const query of queries) {
      console.log(`Buscando contato: ${query}`);

      let results;

      try {
        results = await WebSearchCollector.searchWithRetry(query);
      } catch (error) {
        if (WebSearchCollector.isRateLimitError(error)) {
          throw new Error(
            "LANGSEARCH_REQUEST_LIMIT: limite de requisições atingido.",
            { cause: error },
          );
        }

        this.logSearchError(query, error);
        await this.wait(1100);
        continue;
      }

      for (const result of results) {
        const emails = this.extractEmails(
          `${result.titulo || ""} ${result.snippet || ""} ${result.resumo || ""}`,
          companyDomain,
        );

        if (emails.length > 0) {
          return this.createResult(emails, result.link, query);
        }

        if (!this.belongsToOfficialSite(result.link, companyDomain)) continue;

        const page = await PageContentCollector.collect(result.link, {
          includeInstitutionalText: true,
        });
        if (!page?.success) continue;

        const pageEmails = this.extractEmails(
          `${page.textoInstitucional || ""} ${(page.mailtoEmails || []).join(" ")}`,
          companyDomain,
        );

        if (pageEmails.length > 0) {
          return this.createResult(pageEmails, page.link || result.link, query);
        }
      }

      await this.wait(1100);
    }

    return {
      found: false,
      reason: "CONTATO_WEB_NAO_LOCALIZADO",
    };
  }

  buildQueries(companyName, companyDomain) {
    return [
      `site:${companyDomain} (recrutamento OR RH OR talentos OR carreiras) email`,
      `site:${companyDomain} (contato OR "fale conosco" OR "trabalhe conosco")`,
      `"${companyName}" recrutamento email`,
      `"${companyName}" RH email`,
      `"${companyName}" talentos email`,
      `"${companyName}" vagas email`,
      `"${companyName}" careers email`,
      `"${companyName}" recruitment email`,
      `"@${companyDomain}" recrutamento`,
      `"@${companyDomain}" careers`,
    ];
  }

  belongsToOfficialSite(value, companyDomain) {
    try {
      const domain = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
      return domain === companyDomain || domain.endsWith(`.${companyDomain}`);
    } catch {
      return false;
    }
  }

  createResult(emails, sourceUrl, query) {
    return {
      found: true,
      type: "EMAIL",
      value: emails[0],
      email: emails[0],
      emails,
      source: "WEB_FALLBACK",
      sourceUrl,
      query,
    };
  }

  extractEmails(text, companyDomain) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const emails = String(text || "").match(emailRegex) || [];

    return [...new Set(emails.map((email) => email.toLowerCase()))]
      .filter((email) => this.isValidEmail(email))
      .filter((email) => this.belongsToCompany(email, companyDomain))
      .sort((a, b) => this.getEmailPriority(b) - this.getEmailPriority(a));
  }

  belongsToCompany(email, companyDomain) {
    const emailDomain = email.split("@")[1];

    return (
      emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)
    );
  }

  isValidEmail(email) {
    const blockedPrefixes = [
      "noreply",
      "no-reply",
      "donotreply",
      "do-not-reply",
      "privacy",
      "privacidade",
      "dpo",
      "lgpd",
      "abuse",
      "security",
      "suporte",
      "support",
    ];

    const prefix = email.split("@")[0];

    return !blockedPrefixes.some(
      (blockedPrefix) =>
        prefix === blockedPrefix || prefix.startsWith(`${blockedPrefix}.`),
    );
  }

  getEmailPriority(email) {
    const prefix = email.split("@")[0];

    const priorities = {
      rh: 100,
      recrutamento: 100,
      recruitment: 100,
      recrutamentoeselecao: 100,
      talentos: 95,
      talent: 95,
      careers: 90,
      carreira: 90,
      carreiras: 90,
      jobs: 90,
      vagas: 90,
      people: 80,
      pessoas: 80,
      contato: 50,
      contact: 50,
    };

    return priorities[prefix] || 10;
  }

  wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  logSearchError(query, error) {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || error?.message;

    console.error(
      `Falha ao buscar contato para ${query}${status ? ` (HTTP ${status})` : ""}: ${message}`,
    );
  }
}

export default new ContactWebDiscoveryService();
