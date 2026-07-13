import CompanyIdentityExtractor from "./CompanyIdentityExtractor.js";

import OfficialCompanySiteDiscoveryService from "./OfficialCompanySiteDiscoveryService.js";

import blockedDomains from "../config/blockedDomains.js";

class CompanyIdentityResolver {
  async resolve(page) {
    const declaredIdentity = CompanyIdentityExtractor.extract(page);

    if (
      declaredIdentity.found &&
      !this.isJobPortalDomain(declaredIdentity.domain, page.link)
    ) {
      return declaredIdentity;
    }

    const company = declaredIdentity.company;

    if (!company) {
      return {
        found: false,
        reason: "EMPRESA_NAO_IDENTIFICADA",
      };
    }

    if (this.isBlockedCompany(company)) {
      return {
        found: false,
        company,
        reason: "EMPRESA_E_PORTAL_AGREGADOR",
      };
    }

    const jobTitle = page.jobPosting?.title || "";

    return OfficialCompanySiteDiscoveryService.discover(company, jobTitle);
  }

  isBlockedCompany(companyName) {
    const normalizedCompany = String(companyName || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();

    return blockedDomains.some(
      (blockedDomain) =>
        normalizedCompany === blockedDomain ||
        normalizedCompany.endsWith(`.${blockedDomain}`),
    );
  }

  isJobPortalDomain(identityDomain, jobUrl) {
    if (!identityDomain || !jobUrl) {
      return false;
    }

    try {
      const jobDomain = new URL(jobUrl).hostname
        .replace(/^www\./, "")
        .toLowerCase();

      const normalizedIdentityDomain = String(identityDomain)
        .replace(/^www\./, "")
        .toLowerCase();

      return (
        normalizedIdentityDomain === jobDomain ||
        normalizedIdentityDomain.endsWith(`.${jobDomain}`) ||
        jobDomain.endsWith(`.${normalizedIdentityDomain}`)
      );
    } catch {
      return false;
    }
  }
}

export default new CompanyIdentityResolver();
