export type RawJobListing = {
  externalId: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  source: string;
  sourceUrl: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  tags?: string[];
};

export type JobSourceFetchOptions = {
  query?: string;
  skills?: string[];
  keywords?: string[];
  targetCompanies?: string[];
  remoteOnly?: boolean;
  limitPerSource?: number;
};
