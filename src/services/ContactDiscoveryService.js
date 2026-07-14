import PageContentCollector from "../collectors/PageContentCollector.js";

import ContactWebDiscoveryService from "./ContactWebDiscoveryService.js";

import blockedDomains from "../config/blockedDomains.js";

class ContactDiscoveryService {
  async discover(companyIdentity) {
    if (!companyIdentity?.found || !companyIdentity?.site) {
      return {
        found: false,
        reason: "SITE_EMPRESA_NAO_DISPONIVEL",
      };
    }

    const site = companyIdentity.site;
    const domain = companyIdentity.domain;

    const pages = this.buildCandidatePages(site);

    const channels = [];

    for (const pageUrl of pages) {
      console.log(`Analisando contato: ${pageUrl}`);

      const page = await PageContentCollector.collect(pageUrl, {
        includeInstitutionalText: true,
      });
      if (!page?.success) {
        continue;
      }

      const emails = this.extractEmails(page.textoInstitucional || "", domain);

      if (emails.length > 0) {
        return {
          found: true,
          type: "EMAIL",
          value: emails[0],
          email: emails[0],
          emails,
          source: "SITE_OFICIAL",
          sourceUrl: pageUrl,
        };
      }

      if (this.isOfficialDomain(this.extractDomain(page.link), domain)) {
        channels.push(
          ...this.classifyLinks(page.links || [], domain, page.link),
          ...this.classifyContactForm(page, domain, page.link),
        );
      }
    }

    const channel = this.getBestChannel(channels);

    if (channel) {
      return channel;
    }

    const webContact =
      await ContactWebDiscoveryService.discover(companyIdentity);

    if (webContact.found) {
      return webContact;
    }

    return {
      found: false,
      reason: "SEM_CONTATO_PUBLICO",
    };
  }

  buildCandidatePages(site) {
    const paths = [
      "",
      "/carreiras",
      "/carreiras/",
      "/trabalhe-conosco",
      "/trabalhe-conosco/",
      "/careers",
      "/careers/",
      "/jobs",
      "/jobs/",
      "/contato",
      "/contato/",
      "/contact",
      "/contact/",
    ];

    return [
      ...new Set(
        paths.map((path) => {
          try {
            return new URL(path, site).href;
          } catch {
            return null;
          }
        }),
      ),
    ].filter(Boolean);
  }

  classifyLinks(links, companyDomain, sourceUrl) {
    return links
      .map((link) => this.classifyLink(link, companyDomain, sourceUrl))
      .filter(Boolean);
  }

  classifyLink(link, companyDomain, sourceUrl) {
    const context = this.normalize(`${link.text} ${link.href}`);

    if (!context || this.hasExcludedContext(context)) {
      return null;
    }

    const official = this.isOfficialDomain(link.domain, companyDomain);

    if (!official) {
      if (!this.isAtsLink(link, context)) {
        return null;
      }

      return this.createChannel("ATS", link.href, sourceUrl);
    }

    if (this.hasValidApplicationContext(context)) {
      return this.createChannel("APPLICATION_FORM", link.href, sourceUrl);
    }

    if (this.hasJobContext(context)) {
      return this.createChannel("JOB_PAGE", link.href, sourceUrl);
    }

    if (this.hasCareerContext(context)) {
      return this.createChannel("CAREERS_PAGE", link.href, sourceUrl);
    }

    return null;
  }
  hasValidApplicationContext(context) {
    if (!this.hasApplicationContext(context)) {
      return false;
    }

    if (this.hasDirectApplicationActionContext(context)) {
      return true;
    }

    return (
      context.includes("application") && this.hasCareerOrJobContext(context)
    );
  }

  hasDirectApplicationActionContext(context) {
    return this.containsAny(context, [
      "apply",
      "candidate",
      "candidatura",
      "candidatar",
      "inscreva se",
      "apply now",
      "submit application",
    ]);
  }

  classifyContactForm(page, companyDomain, sourceUrl) {
    if (!page.hasPublicForm) {
      return [];
    }

    const pageDomain = this.extractDomain(page.link || sourceUrl);
    const context = this.normalize(
      `${page.titulo || ""} ${page.textoInstitucional || ""}`,
    );

    if (
      !this.isOfficialDomain(pageDomain, companyDomain) ||
      this.hasExcludedContext(context) ||
      !this.hasContactContext(context)
    ) {
      return [];
    }

    return [
      this.createChannel("CONTACT_FORM", page.link || sourceUrl, sourceUrl),
    ];
  }

  isAtsLink(link, context) {
    if (!this.hasCareerOrJobContext(context)) {
      return false;
    }

    return (
      this.hasApplicationContext(context) || this.isBlockedDomain(link.domain)
    );
  }

  getBestChannel(channels) {
    const priorities = {
      APPLICATION_FORM: 90,
      JOB_PAGE: 80,
      ATS: 70,
      CAREERS_PAGE: 60,
      CONTACT_FORM: 50,
    };

    return [
      ...new Map(channels.map((channel) => [channel.value, channel])).values(),
    ].sort((a, b) => priorities[b.type] - priorities[a.type])[0];
  }

  createChannel(type, value, sourceUrl) {
    return {
      found: true,
      type,
      value,
      source: "SITE_OFICIAL",
      sourceUrl,
    };
  }

  isOfficialDomain(domain, companyDomain) {
    if (!domain || !companyDomain) {
      return false;
    }

    return domain === companyDomain || domain.endsWith(`.${companyDomain}`);
  }

  isBlockedDomain(domain) {
    return blockedDomains.some(
      (blockedDomain) =>
        domain === blockedDomain || domain.endsWith(`.${blockedDomain}`),
    );
  }

  hasApplicationContext(context) {
    return this.containsAny(context, [
      "apply",
      "application",
      "candidate",
      "candidatura",
      "candidatar",
      "inscreva se",
      "apply now",
      "submit application",
    ]);
  }

  hasJobContext(context) {
    return this.containsAny(context, [
      "jobs",
      "job",
      "vagas",
      "vaga",
      "open positions",
      "open roles",
      "positions",
      "opportunities",
    ]);
  }

  hasCareerContext(context) {
    return this.containsAny(context, [
      "careers",
      "career",
      "carreiras",
      "carreira",
      "trabalhe conosco",
      "work with us",
      "join us",
      "opportunities",
    ]);
  }

  hasCareerOrJobContext(context) {
    return this.hasCareerContext(context) || this.hasJobContext(context);
  }

  hasContactContext(context) {
    return this.containsAny(context, [
      "contact",
      "contato",
      "fale conosco",
      "get in touch",
    ]);
  }

  hasExcludedContext(context) {
    return this.containsAny(context, [
      "support",
      "suporte",
      "privacy",
      "privacidade",
      "lgpd",
      "security",
      "seguranca",
      "abuse",
      "imprensa",
      "press",
      "sales",
      "vendas",
    ]);
  }

  containsAny(context, terms) {
    return terms.some((term) => context.includes(term));
  }

  normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  extractDomain(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
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
    if (!companyDomain) {
      return false;
    }

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
      "comercial",
      "vendas",
      "sales",
      "financeiro",
      "finance",
      "faturamento",
      "billing",
      "marketing",
      "imprensa",
      "press",
      "legal",
      "juridico",
      "info",
      "hello",
      "contato",
      "contact",
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
}

export default new ContactDiscoveryService();
