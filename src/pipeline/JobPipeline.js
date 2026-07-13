import JobRepository from "../repositories/JobRepository.js";
import JobNormalizer from "../services/JobNormalizer.js";
import JobValidator from "../validators/JobValidator.js";
import CompanyIdentityResolver from "../services/CompanyIdentityResolver.js";
import ContactDiscoveryService from "../services/ContactDiscoveryService.js";

class JobPipeline {
  async process(rawJob, page) {
    const job = JobNormalizer.normalize(rawJob);

    const validation = JobValidator.validate(job);

    job.status = validation.status;

    if (!validation.valid) {
      return {
        job,
        validation,
        identity: null,
        contact: null,
        persistence: {
          created: false,
          reason: "DESCARTADA",
        },
      };
    }

    const identity = await CompanyIdentityResolver.resolve(page);

    const contact = identity.found
      ? await ContactDiscoveryService.discover(identity)
      : null;

    job.companySite = identity.site || null;
    job.companyDomain = identity.domain || null;
    job.identitySource = identity.source || null;
    job.channelType = contact?.type || null;
    job.channelValue = contact?.value || null;
    job.channelSource = contact?.source || null;
    job.channelSourceUrl = contact?.sourceUrl || null;
    job.email = contact?.type === "EMAIL" ? contact.email || contact.value : null;

    const persistence = await JobRepository.create(job);

    return {
      job,
      validation,
      identity,
      contact,
      persistence,
    };
  }
}

export default new JobPipeline();
