import WebSearchCollector from "../collectors/WebSearchCollector.js";

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

      const results = await WebSearchCollector.search(query);

      for (const result of results) {
        const emails = this.extractEmails(
          `${result.titulo || ""} ${result.snippet || ""}`,
          companyDomain,
        );

        if (emails.length === 0) {
          continue;
        }

        return {
          found: true,
          type: "EMAIL",
          value: emails[0],
          email: emails[0],
          emails,
          source: "WEB_FALLBACK",
          sourceUrl: result.link,
          query,
        };
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
}

export default new ContactWebDiscoveryService();
