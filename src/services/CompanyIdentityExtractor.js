import blockedDomains from "../config/blockedDomains.js";

class CompanyIdentityExtractor {
  extract(page) {
    const organization = page.jobPosting?.hiringOrganization;

    if (!organization) {
      return {
        found: false,
        reason: "HIRING_ORGANIZATION_AUSENTE",
      };
    }

    const company = this.decodeHtml(organization.name);

    const declaredUrls = [organization.url, organization.sameAs];

    let blockedUrlFound = false;

    for (const value of declaredUrls) {
      const url = this.getValidUrl(value);

      if (!url) {
        continue;
      }

      const domain = this.extractDomain(url);

      if (this.isBlockedDomain(domain)) {
        blockedUrlFound = true;

        continue;
      }

      return {
        found: true,
        company,
        site: url.origin,
        domain,
        source: "JOBPOSTING",
        declaredUrl: url.href,
      };
    }

    return {
      found: false,
      company,
      reason: blockedUrlFound
        ? "URL_ORGANIZACAO_AGREGADOR"
        : "URL_ORGANIZACAO_NAO_DECLARADA",
    };
  }

  getValidUrl(value) {
    if (!value || typeof value !== "string") {
      return null;
    }

    try {
      const url = new URL(value);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
      }

      return url;
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

  extractDomain(url) {
    return url.hostname.replace(/^www\./, "").toLowerCase();
  }

  decodeHtml(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/&#38;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#8211;/gi, "–")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export default new CompanyIdentityExtractor();
