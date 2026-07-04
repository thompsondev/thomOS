import type { UpsertProfileDto } from '../profile.types';

/** Default owner id for Thompson's master profile (always lowercase) */
export const THOMPSON_USER_ID = 'topeyemi33@gmail.com';

const MASTER_RESUME = `THOMPSON OPEYEMI ODUNAYO
Lagos, Nigeria | +234 805 198 6863
Topeyemi33@gmail.com | LinkedIn | GitHub

Summary
Software engineer with 6+ years of experience building scalable fintech and SaaS platforms using React.js/Next.js/Vue.js, NestJS, TypeORM, PostgreSQL, AI tools. I develop responsive, high-performance interfaces and robust backend services, design efficient APIs, and deliver features that scale reliably. I work well across teams and enjoy using modern tools and best practices to create smooth, impactful user experiences from end to end.

Technical Skills
Languages: JavaScript (ES6+), TypeScript, HTML5, CSS3
Frontend Frameworks & Libraries: Next.js, Vue.js, React, React Native, Tailwind CSS
AI & Automation: n8n, Langchain, Eleven Labs, make.com, Higgsfield, Vercel AI SDK
Backend & Server-Side: Nest.js, Golang, Node.js, TypeORM, Prisma, PostgreSQL, MongoDB, Redis
APIs & Data Handling: REST, GraphQL, WebSockets, tRPC
Testing: Jest, Cypress, Vitest, React Testing Library, Supertest
Build, DevOps & Tooling: Webpack, Vite, Docker, Git, GitHub, Bitbucket, CI/CD pipelines
Cloud & Deployment: AWS (S3, Lambda basics), Firebase, Vercel, Netlify, Coolify, Railway
Collaboration & Productivity: Jira, Zoho Sprints, Trello, Figma, Postman, Insomnia

Professional Experience

Chief of Staff & AI Automation Engineer
Zokulabs | Los Angeles, USA | Remote | Mar 2026 – Present
- Coordinated and launched Snapblock, an AI website builder for entrepreneurs and early-stage founders (USA), attracting 100+ users and generating more than $50K revenue in 2 months.
- Developed an AI content generation system for TechDepot that automates product category enrichment and SEO optimization; processed and enriched 10,000+ products.
- Led cross-functional coordination across subsidiaries: project execution, deliverables, operational bottlenecks, and timely completion of initiatives.
- Partnered with Founder & CEO on strategic initiatives across portfolio companies, KPIs, and operational goals.
- Built and integrated scalable workflows connecting CRMs, email, databases, finance platforms, calendars, and third-party services.
- Developed internal dashboards, monitoring tools, and reporting systems for performance, productivity, and decision-making.

Frontend Engineering Lead
Sapphire Virtual Network | Lagos, Nigeria | Hybrid | Jan 2025 – Apr 2026
- Led design and delivery of a device financing platform processing 1,000+ monthly applications; reduced approval turnaround by 40% via workflow automation.
- Drove integration of AI-assisted risk profiling and eligibility scoring for real-time decision support and reduced manual review.
- Owned end-to-end optimization of user journeys and eligibility workflows; reduced application drop-offs by 25%.
- Designed and implemented an internal loan management system; improved operational monitoring efficiency by 30% with real-time visibility into repayments, defaults, and reconciliation.
- Collaborated with product, operations, and engineering to align system capabilities with business goals.

AI & Automation Engineer
HostandRest | Lagos, Nigeria | Remote | Jul 2024 – Dec 2024
- Deployed an AI-powered infrastructure provisioning system enabling cloud environment setup/management via WhatsApp conversational interface.
- Built backend orchestration services converting natural language prompts into structured infrastructure commands using LangChain pipelines and intent classification.
- Leveraged Claude, Gemini, and Grok for multimodal reasoning and image-based infrastructure visualization; integrated Higgsfield for AI-driven video generation in onboarding.
- Implemented LLM routing and model abstraction using Vercel AI SDK and Vercel AI Gateway for cost-optimized model selection and fallbacks.
- Designed automated DevOps workflows using n8n and Make.com for cloud provisioning, DNS, SSL, container deployments, and monitoring.

Product Lead – Frontend Engineer
Intech Management Limited | Lagos, Nigeria | Remote | Jan 2022 – Jun 2024
- Led frontend development across fintech products: Inpay App, Intech Checkout, Inpay for Business, and Incommerce.
- Collaborated with cross-functional teams on cohesive UI/UX and platform scalability for 2M+ projected users.
- Built high-performance UIs using React, TypeScript, Redux, and React Native for web and mobile.
- Architected scalable frontend systems with reusable components and efficient state management.
- Optimized app performance via code-splitting, lazy loading, and caching (40% faster load times).
- Integrated secure payment APIs and dashboards for transaction tracking and merchant management.
- Implemented automated CI/CD, linting, and testing frameworks (90%+ test coverage).

Frontend Engineer (Website Solutions Specialist)
Talku Talku | Abuja, Nigeria | Remote | Jul 2020 – Dec 2021
- Delivered optimized websites with 55% faster load times and improved SEO visibility.
- Built a restaurant online ordering system that boosted client sales by 40%.
- Addressed performance and security issues, reducing downtime by 20%.
- Collaborated with designers to deliver intuitive, responsive web experiences.

Web Developer
Just Inches Limited | Lagos, Nigeria | Remote | Apr 2018 – Jun 2020
- Developed brand-consistent websites for multiple clients, improving engagement and retention.
- Integrated animations, optimized layouts, and enhanced responsiveness across devices.
- Conducted audits and implemented improvements in speed, accessibility, and security.

Personal Projects
Storytime Nigeria – Fullstack Engineer
- Designed and developed full platform architecture using NestJS, TypeORM, and PostgreSQL: secure auth, RBAC, content moderation, and story publishing pipelines.
- Leveraged AI-driven automation for content recommendations, automated tagging/classification, and personalized story surfacing.
- Built frontend with Next.js, Tailwind, and TypeScript: fast loads, responsive layouts, SEO-optimized content pages.
- Created scalable CMS workflow for admins to review, approve, or feature stories.
- Integrated analytics dashboards for users, story engagement, and creator performance.

Education
B.Tech, Computer Science – Tansian University, Umunya | 2023 – 2024
HND, Computer Science – Lagos State Polytechnic, Ikorodu | 2019 – 2022
ND, Computer Science – Lagos State Polytechnic, Ikorodu | 2014 – 2016
WASSCE | 2014
NYSC Certificate | 2022 – 2023
`;

export const thompsonOpeyemiProfile: UpsertProfileDto = {
  userId: THOMPSON_USER_ID,
  fullName: 'Thompson Opeyemi Odunayo',
  headline: 'Senior Frontend Engineer | AI & Automation Engineer',
  summary:
    'Software engineer with 6+ years of experience building scalable fintech and SaaS platforms using React.js/Next.js/Vue.js, NestJS, TypeORM, PostgreSQL, and AI tools. Develops responsive, high-performance interfaces and robust backend services, designs efficient APIs, and delivers features that scale reliably.',
  masterResume: MASTER_RESUME,
  skills: [
    'JavaScript',
    'TypeScript',
    'HTML5',
    'CSS3',
    'Next.js',
    'Vue.js',
    'React',
    'React Native',
    'Tailwind CSS',
    'n8n',
    'LangChain',
    'Eleven Labs',
    'Make.com',
    'Higgsfield',
    'Vercel AI SDK',
    'NestJS',
    'Golang',
    'Node.js',
    'TypeORM',
    'Prisma',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'REST',
    'GraphQL',
    'WebSockets',
    'tRPC',
    'Jest',
    'Cypress',
    'Vitest',
    'React Testing Library',
    'Supertest',
    'Webpack',
    'Vite',
    'Docker',
    'Git',
    'CI/CD',
    'AWS',
    'Firebase',
    'Vercel',
    'Netlify',
    'Coolify',
    'Railway',
  ],
  filters: {
    remoteOnly: true,
    seniority: ['Senior', 'Lead', 'Staff', 'Principal'],
    skills: [
      'React',
      'Next.js',
      'TypeScript',
      'NestJS',
      'AI',
      'Automation',
      'Frontend',
    ],
    locations: ['Remote', 'Nigeria', 'USA', 'Europe', 'UK'],
    visaSponsorship: false,
    keywords: [
      'Senior Frontend Engineer',
      'Frontend Lead',
      'AI Engineer',
      'Automation Engineer',
      'Fullstack Engineer',
      'React',
      'Next.js',
      'NestJS',
    ],
    targetCompanies: [
      'OpenAI',
      'Anthropic',
      'GitHub',
      'Vercel',
      'Stripe',
      'Linear',
      'Shopify',
      'GitLab',
      'Cloudflare',
      'Cursor',
    ],
  },
  experience: [
    {
      company: 'Zokulabs',
      title: 'Chief of Staff & AI Automation Engineer',
      startDate: 'Mar 2026',
      endDate: 'Present',
      bullets: [
        'Coordinated and launched Snapblock, an AI website builder for entrepreneurs and early-stage founders (USA), attracting 100+ users and generating more than $50K revenue in 2 months.',
        'Developed an AI content generation system for TechDepot that automates product category enrichment and SEO optimization; processed and enriched 10,000+ products.',
        'Led cross-functional coordination across subsidiaries: project execution, deliverables, operational bottlenecks, and timely completion of initiatives.',
        'Partnered with Founder & CEO on strategic initiatives across portfolio companies, KPIs, and operational goals.',
        'Built and integrated scalable workflows connecting CRMs, email, databases, finance platforms, calendars, and third-party services.',
        'Developed internal dashboards, monitoring tools, and reporting systems for performance, productivity, and decision-making.',
      ],
    },
    {
      company: 'Sapphire Virtual Network',
      title: 'Frontend Engineering Lead',
      startDate: 'Jan 2025',
      endDate: 'Apr 2026',
      bullets: [
        'Led design and delivery of a device financing platform processing 1,000+ monthly applications; reduced approval turnaround by 40% via workflow automation.',
        'Drove integration of AI-assisted risk profiling and eligibility scoring for real-time decision support and reduced manual review.',
        'Owned end-to-end optimization of user journeys and eligibility workflows; reduced application drop-offs by 25%.',
        'Designed and implemented an internal loan management system; improved operational monitoring efficiency by 30% with real-time visibility into repayments, defaults, and reconciliation.',
        'Collaborated with product, operations, and engineering to align system capabilities with business goals.',
      ],
    },
    {
      company: 'HostandRest',
      title: 'AI & Automation Engineer',
      startDate: 'Jul 2024',
      endDate: 'Dec 2024',
      bullets: [
        'Deployed an AI-powered infrastructure provisioning system enabling cloud environment setup/management via WhatsApp conversational interface.',
        'Built backend orchestration services converting natural language prompts into structured infrastructure commands using LangChain pipelines and intent classification.',
        'Leveraged Claude, Gemini, and Grok for multimodal reasoning and image-based infrastructure visualization; integrated Higgsfield for AI-driven video generation in onboarding.',
        'Implemented LLM routing and model abstraction using Vercel AI SDK and Vercel AI Gateway for cost-optimized model selection and fallbacks.',
        'Designed automated DevOps workflows using n8n and Make.com for cloud provisioning, DNS, SSL, container deployments, and monitoring.',
      ],
    },
    {
      company: 'Intech Management Limited',
      title: 'Product Lead – Frontend Engineer',
      startDate: 'Jan 2022',
      endDate: 'Jun 2024',
      bullets: [
        'Led frontend development across fintech products: Inpay App, Intech Checkout, Inpay for Business, and Incommerce.',
        'Collaborated with cross-functional teams on cohesive UI/UX and platform scalability for 2M+ projected users.',
        'Built high-performance UIs using React, TypeScript, Redux, and React Native for web and mobile.',
        'Architected scalable frontend systems with reusable components and efficient state management.',
        'Optimized app performance via code-splitting, lazy loading, and caching (40% faster load times).',
        'Integrated secure payment APIs and dashboards for transaction tracking and merchant management.',
        'Implemented automated CI/CD, linting, and testing frameworks (90%+ test coverage).',
      ],
    },
    {
      company: 'Talku Talku',
      title: 'Frontend Engineer (Website Solutions Specialist)',
      startDate: 'Jul 2020',
      endDate: 'Dec 2021',
      bullets: [
        'Delivered optimized websites with 55% faster load times and improved SEO visibility.',
        'Built a restaurant online ordering system that boosted client sales by 40%.',
        'Addressed performance and security issues, reducing downtime by 20%.',
        'Collaborated with designers to deliver intuitive, responsive web experiences.',
      ],
    },
    {
      company: 'Just Inches Limited',
      title: 'Web Developer',
      startDate: 'Apr 2018',
      endDate: 'Jun 2020',
      bullets: [
        'Developed brand-consistent websites for multiple clients, improving engagement and retention.',
        'Integrated animations, optimized layouts, and enhanced responsiveness across devices.',
        'Conducted audits and implemented improvements in speed, accessibility, and security.',
      ],
    },
    {
      company: 'Storytime Nigeria',
      title: 'Fullstack Engineer (Personal Project)',
      startDate: 'Personal Project',
      endDate: undefined,
      bullets: [
        'Designed and developed full platform architecture using NestJS, TypeORM, and PostgreSQL: secure auth, RBAC, content moderation, and story publishing pipelines.',
        'Leveraged AI-driven automation for content recommendations, automated tagging/classification, and personalized story surfacing.',
        'Built frontend with Next.js, Tailwind, and TypeScript: fast loads, responsive layouts, SEO-optimized content pages.',
        'Created scalable CMS workflow for admins to review, approve, or feature stories.',
        'Integrated analytics dashboards for users, story engagement, and creator performance.',
      ],
    },
  ],
};
