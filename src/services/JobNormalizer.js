class JobNormalizer {
  normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeUrl(value) {
    const url = this.normalizeText(value);

    if (!url) {
      return "";
    }

    try {
      const parsedUrl = new URL(url);

      parsedUrl.hash = "";

      return parsedUrl.toString();
    } catch {
      return url;
    }
  }

  normalize(job) {
    return {
      empresa: this.normalizeText(job.empresa),
      cargo: this.normalizeText(job.cargo),
      descricao: this.normalizeText(job.descricao),
      modalidade: this.normalizeText(job.modalidade),
      localizacao: this.normalizeText(job.localizacao),
      link: this.normalizeUrl(job.link),
      fonte: this.normalizeText(job.fonte),
      email: job.email ? this.normalizeText(job.email).toLowerCase() : null,
      status: job.status || "DESCOBERTA",
    };
  }
}

export default new JobNormalizer();
