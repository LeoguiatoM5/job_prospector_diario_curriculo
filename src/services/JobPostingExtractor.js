import * as cheerio from "cheerio";

class JobPostingExtractor {
  extract(page) {
    const data = page.jobPosting;

    if (!data) {
      return null;
    }

    const cargo = this.cleanHtml(data.title);

    const empresa = this.cleanHtml(data.hiringOrganization?.name);

    const remoto = this.isRemote(data);

    const brasil = this.isAvailableInBrazil(data);

    return {
      empresa,
      cargo,
      descricao: this.cleanHtml(data.description),
      modalidade: remoto ? "REMOTO" : "",
      localizacao: brasil ? "BRASIL" : "",
      link: page.link,
      fonte: page.fonte,
      email: null,
      status: "DESCOBERTA",
    };
  }

  isRemote(data) {
    const locationType = String(data.jobLocationType || "").toUpperCase();

    return locationType === "TELECOMMUTE";
  }

  isAvailableInBrazil(data) {
    if (this.containsBrazil(data.applicantLocationRequirements)) {
      return true;
    }

    if (this.containsBrazil(data.jobLocation)) {
      return true;
    }

    return false;
  }

  containsBrazil(value) {
    if (!value) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.containsBrazil(item));
    }

    if (typeof value === "object") {
      return Object.values(value).some((item) => this.containsBrazil(item));
    }

    const normalized = String(value).trim().toLowerCase();

    return ["br", "brasil", "brazil"].includes(normalized);
  }

  cleanHtml(value) {
    if (!value) {
      return "";
    }

    const $ = cheerio.load(`<div>${String(value)}</div>`);

    return $("div").first().text().replace(/\s+/g, " ").trim();
  }
}

export default new JobPostingExtractor();
