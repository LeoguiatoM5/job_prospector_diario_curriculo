class JobValidator {
  constructor() {
    this.qaTerms = [
      "qa",
      "quality assurance",
      "analista de testes",
      "analista de teste",
      "analista qa",
      "software tester",
      "tester",
      "qa analyst",
      "qa engineer",
      "test analyst",
      "qa automation",
      "automation tester",
      "quality engineer",
      "sdet",
      "software development engineer in test",
      "test automation engineer",
    ];

    this.remoteTerms = [
      "remoto",
      "remote",
      "100% remoto",
      "fully remote",
      "trabalho remoto",
      "home office",
    ];

    this.brazilTerms = [
      "brasil",
      "brazil",
      "remote brazil",
      "remoto brasil",
      "anywhere in brazil",
      "qualquer lugar do brasil",
    ];
  }

  normalizeText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  containsTerm(text, terms) {
    return terms.some((term) => text.includes(this.normalizeText(term)));
  }

  validate(job) {
    const content = this.normalizeText(`
      ${job.cargo}
      ${job.descricao}
      ${job.modalidade}
      ${job.localizacao}
    `);

    const qa = this.containsTerm(content, this.qaTerms);
    const remoto = this.containsTerm(content, this.remoteTerms);
    const brasil = this.containsTerm(content, this.brazilTerms);

    const valid = qa && remoto && brasil;

    return {
      qa,
      remoto,
      brasil,
      valid,
      status: valid ? "VALIDA" : "DESCARTADA",
    };
  }
}

export default new JobValidator();
