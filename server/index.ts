import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { TypeSafeClient, choice, score, noul } from '@typesafe-ai/sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const apiKey = process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY;
if (!apiKey) console.error('⚠ No API key found. Set JEV_API_KEY in .env');

const client = new TypeSafeClient({ apiKey: apiKey || '' });

// ── Realistic Job Postings with Rich Scope Detail ──
export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  postedDaysAgo: number;
  repostCount: number;
  applicantCount: number;
  hiringManager: string | null;
  experienceScope: string;
  autonomyLevel: 'Foundational / Mentored' | 'Autonomous IC' | 'Lead / Architect' | 'Executive Lead';
  coreMission: string;
  engineeringDemands: string;
  cultureReality: string;
  archetype: 'high_signal' | 'ghost_job' | 'toxic_lowball' | 'skill_mismatch' | 'compliance_zombie';
}

export const INITIAL_JOBS: JobListing[] = [
  {
    id: 'job-1',
    title: 'Senior Full-Stack Engineer (Product & AI Orchestration)',
    company: 'NovaScale AI',
    location: 'San Francisco, CA (Hybrid / Remote Option)',
    salary: '$180,000 - $220,000 + 0.25% Equity',
    postedDaysAgo: 3,
    repostCount: 0,
    applicantCount: 28,
    hiringManager: 'Elena Rostova (VP of Engineering — Active)',
    experienceScope: 'Senior IC with proven experience designing high-throughput web architectures and reactive client state',
    autonomyLevel: 'Autonomous IC',
    coreMission: 'Own full-stack model orchestration infrastructure. You will architect low-latency client interfaces and high-concurrency Node/TypeScript pipelines connecting to inference clusters.',
    engineeringDemands: 'Requires deep understanding of async workflows, distributed caching, client render performance, and API design. Team values clean abstractions and fast iteration over formal ceremonies.',
    cultureReality: 'Async-first, strict 40-hour workweek, transparent leveling rubric, $4k annual learning budget.',
    archetype: 'high_signal'
  },
  {
    id: 'job-2',
    title: 'Staff Platform & Infrastructure Engineer',
    company: 'Stripe',
    location: 'Remote (US & Canada)',
    salary: '$240,000 - $290,000 + RSU Grants',
    postedDaysAgo: 5,
    repostCount: 0,
    applicantCount: 45,
    hiringManager: 'David Vance (Platform Group Lead)',
    experienceScope: 'Staff-level engineer with track record of operating multi-region distributed systems at extreme scale (100k+ qps)',
    autonomyLevel: 'Lead / Architect',
    coreMission: 'Scale core global settlement pipelines handling billions in daily transaction volume. Lead cross-organizational reliability initiatives, disaster recovery runbooks, and mentor senior engineers.',
    engineeringDemands: 'Extreme emphasis on zero-downtime migrations, strict data consistency, consensus protocols, Linux kernel performance, and robust telemetry.',
    cultureReality: 'Rigorous engineering culture, deep written RFC review process, high compensation transparency, formal on-call with comp time.',
    archetype: 'high_signal'
  },
  {
    id: 'job-3',
    title: 'Senior Cloud Solutions Architect',
    company: 'OmniGlobal Cloud Systems',
    location: 'New York, NY (Strict 5-day In-Office)',
    salary: 'Competitive Market Rate (Disclosed after 4th round)',
    postedDaysAgo: 184,
    repostCount: 6,
    applicantCount: 3410,
    hiringManager: null,
    experienceScope: '12+ years across 15 proprietary legacy enterprise vendors',
    autonomyLevel: 'Autonomous IC',
    coreMission: 'Navigate matrixed enterprise committees to advise on multi-cloud transformations. Must coordinate across 8 departmental sign-offs for production deploys.',
    engineeringDemands: 'Heavy documentation, compliance filings, legacy Java/Oracle modernization, enterprise middleware integration.',
    cultureReality: 'Bureaucratic matrix structure, slow 6-month delivery cycles, opaque compensation, candidate pipeline kept perpetually open.',
    archetype: 'ghost_job'
  }
];

// ── Candidate Profile Interface (Domain-Agnostic) ──
export interface CandidateResume {
  id: string;
  name: string;
  targetRole: string;
  experienceYears: number;
  seniorityTier: 'Junior' | 'Mid-Level' | 'Senior' | 'Staff / Lead';
  candidateDiscipline: string;
  engineeringArchetype?: string;
  demonstratedScaleAndScope: string;
  autonomyTrackRecord: string;
  primaryTechnicalDomains: string[];
  fullResumeText: string;
  summary?: string;
}

export const PERSONAS: Record<string, CandidateResume> = {
  alex: {
    id: 'alex',
    name: 'Alex Chen',
    targetRole: 'Senior Full-Stack / Product Systems Engineer',
    experienceYears: 5.5,
    seniorityTier: 'Senior',
    candidateDiscipline: 'Software & Systems Engineering',
    engineeringArchetype: 'Product-Focused Systems Engineer with strong full-stack foundations and scale track record',
    demonstratedScaleAndScope: 'Architected high-throughput real-time trading dashboards handling 120,000 daily active users and 45,000 events/sec. Designed microservices in Node/TypeScript and PostgreSQL, cutting p95 API response latency by 42% through optimized database indexing and distributed Redis caching.',
    autonomyTrackRecord: 'Operated as autonomous technical owner across 3 mission-critical product launches. Authored RFCs for client state management and API contracts. Regularly mentored 3 junior engineers and established automated integration testing suites.',
    primaryTechnicalDomains: ['Modern Web Architecture (React, TypeScript)', 'High-Throughput Backend APIs (Node.js, PostgreSQL)', 'Distributed Caching & Async Pipelines', 'Component Design Systems & Performance'],
    fullResumeText: `
Alex Chen — Senior Full-Stack Engineer (5.5 years experience)
Summary: Systems-minded product engineer with 5.5 years of experience building resilient, low-latency web platforms. Deep experience in TypeScript, React, Node.js, distributed state, and cloud databases.
Experience:
- Senior Full-Stack Engineer at FinTrack Labs (2023 - Present): Owned full-stack feature architecture for real-time market data dashboard used by 120k traders. Re-engineered core web socket streaming layer, reducing client memory footprint by 35%. Mentored engineers on clean architecture.
- Full-Stack Engineer at CloudPulse (2020 - 2023): Designed microservices in Node.js and PostgreSQL handling multi-tenant billing and analytics. Created design token system adopted across 4 applications.
Education: B.S. in Computer Science, UC Berkeley.
    `.trim()
  },
  maya: {
    id: 'maya',
    name: 'Maya Patel',
    targetRole: 'Staff Infrastructure & Platform Engineer',
    experienceYears: 8,
    seniorityTier: 'Staff / Lead',
    candidateDiscipline: 'Software & Systems Engineering',
    engineeringArchetype: 'Distributed Systems & Cloud Platform Architect',
    demonstratedScaleAndScope: 'Managed multi-region Kubernetes clusters orchestrating 4,500+ microservice pods across AWS and GCP with 99.995% uptime SLA. Led architectural transition from legacy VMs to containerized service meshes, reducing annual cloud infrastructure spend by $1.2M.',
    autonomyTrackRecord: 'Cross-organizational technical leader setting company-wide infrastructure roadmaps and disaster recovery standards. Served as Incident Commander for Tier-0 production outages. Established automated IaC deployment pipelines using Terraform.',
    primaryTechnicalDomains: ['Kubernetes Orchestration & Service Meshes', 'Distributed Systems Reliability & Consensus', 'Cloud Infrastructure as Code (Terraform, AWS/GCP)', 'Systems Observability & Telemetry (Prometheus, eBPF)'],
    fullResumeText: `
Maya Patel — Staff Infrastructure Engineer (8 years experience)
Summary: Platform engineer specialized in large-scale distributed systems, multi-region Kubernetes, cloud reliability, and infrastructure automation.
Experience:
- Staff Infrastructure Engineer at DataMesh (2022 - Present): Architectural owner of global compute platform spanning 4 regions and 4,500+ pods. Designed automated zero-downtime cluster upgrade system. Reduced infrastructure cost by $1.2M.
- Senior DevOps Engineer at CloudMatrix (2018 - 2022): Built automated Terraform infrastructure pipelines and centralized observability stack processing 10TB of daily telemetry.
Education: M.S. in Computer Engineering, Georgia Tech.
    `.trim()
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan Lee',
    targetRole: 'Junior Frontend Developer',
    experienceYears: 1.5,
    seniorityTier: 'Junior',
    candidateDiscipline: 'Software & Systems Engineering',
    engineeringArchetype: 'Eager UI Builder with rapid learning velocity',
    demonstratedScaleAndScope: 'Built responsive client web applications, marketing landing pages, and interactive UI forms using React, Tailwind CSS, and Next.js. Implemented client-side input validation and animated interactive states.',
    autonomyTrackRecord: 'Executes defined engineering tasks with diligence. Actively seeks code review feedback, pair programs with senior engineers, and writes clean component tests.',
    primaryTechnicalDomains: ['React & Next.js UI Development', 'CSS, Tailwind & Responsive Layouts', 'Client Form Validation & REST APIs', 'Git Workflows & Modern Frontend Tooling'],
    fullResumeText: `
Jordan Lee — Junior Frontend Developer (1.5 years experience)
Summary: Frontend developer with 1.5 years experience building clean, responsive web user interfaces with React, JavaScript, and Tailwind CSS.
Experience:
- Associate Frontend Developer at Digital Craft Agency (2024 - Present): Developed interactive client marketing websites and dashboards. Implemented reusable component libraries and accessible UI forms.
Education: Full-Stack Web Development Certificate + B.A. in Psychology.
    `.trim()
  },
  gaurav: {
    id: 'gaurav',
    name: 'Gaurav Ahuja',
    targetRole: 'Backend & Systems Engineer',
    experienceYears: 1.5,
    seniorityTier: 'Junior',
    candidateDiscipline: 'Software & Systems Engineering',
    engineeringArchetype: 'High-Velocity Systems Engineer with verified distributed event pipelines & high-concurrency architecture',
    demonstratedScaleAndScope: 'Kafka-based asynchronous event pipelines (3x throughput boost); Stateless AWS cloud migration (50% horizontal scalability gain); High-concurrency services sustaining 1000+ peak WebSockets; Cloud-native deployments on AWS with Docker, Kubernetes, and Terraform; Observability stack (Prometheus, Grafana, Loki) cutting incident MTTR 30%; Enterprise ATS API integrations (Greenhouse, Workday, Ashby) with 99.9% sync reliability.',
    autonomyTrackRecord: 'Operates with high autonomy on complex distributed systems, achieving 99.9% sync reliability and 40% P95 latency reduction.',
    primaryTechnicalDomains: ['Distributed Backend & Kafka Pipelines', 'Cloud Infrastructure & DevOps (AWS, K8s, IaC)', 'Observability & Telemetry (Prometheus, Grafana)', 'High-Concurrency APIs & Real-Time WebSockets', 'Systems Automation (Python/Go)'],
    fullResumeText: `
Gaurav Ahuja — Backend & Systems Engineer (1.5 years experience)
Education: B.Tech in Computer Science and Engineering, Indian Institute of Technology Mandi (IIT Mandi).
Summary: High-velocity backend and systems engineer with production experience in distributed event pipelines, Linux systems, observability, AWS cloud infrastructure, and systems automation.
Technical Skills:
- Languages: Python, Go, Java, TypeScript, JavaScript, SQL, Bash
- Infrastructure & Cloud: AWS (S3, RDS, EC2), Docker, Kubernetes, Terraform, Linux OS Internals
- Systems & Architecture: Kafka, Event-Driven Architecture, Microservices, WebSockets (1000+ concurrent), Redis
- Observability: Prometheus, Grafana, Loki (instrumentation, telemetry, MTTR reduction)
- Identity & Security: OAuth, Webhooks, Idempotency, REST API design
Experience:
- Software Engineer Intern at Joveo: Built Kafka-based asynchronous event pipelines delivering 3x throughput boost. Integrated enterprise ATS APIs (Greenhouse, Workday, Ashby) with 99.9% sync reliability.
- Software Developer Intern at Equal: Architected stateless cloud migration on AWS cutting latency. Deployed Prometheus/Grafana observability stack reducing incident MTTR by 30%.
Achievements: AiHack 1st Place (CatBoost ML optimization), LeetCode 1900+, Codeforces Expert.
    `.trim()
  }
};

// ── Intelligent Job Experience & Level Extractor ──
export function extractJobExperienceDemands(fullText: string, title: string) {
  const isSeniorRole = /\b(senior|sr\.?|staff|principal|lead|director|manager|architect|head of|vp)\b/i.test(title);
  const isJuniorRole = /\b(junior|jr\.?|entry[\s\-]?level|new[\s\-]?grad(?:uate)?|fresher|graduate|associate|trainee|intern)\b/i.test(title);

  // Clean full text of common non-job-experience noise
  // (e.g. "4-year degree", "3-year bachelor", "in business for 20 years", "founded 10 years ago")
  const cleanedText = fullText
    .replace(/\b(?:in business for|founded|established|operating for|over)\s+\d+\+?\s+years\b/gi, '')
    .replace(/\b\d+\s*(?:–|-|—|to)\s*\d+\s*(?:day|week|month|applicant|candidate|review)s?\b/gi, '')
    .replace(/\b\d+[\s\-]year\s+(?:degree|bachelor|master|diploma|college|university)\b/gi, '');

  // Isolate high-confidence requirement sections if present
  const qualSectionMatch = cleanedText.match(
    /(?:key qualifications|basic qualifications|minimum qualifications|qualifications|requirements|what you(?:'ll)? need|what we(?:'re)? looking for|experience requirements|who you are|about the job)[\s\S]{0,3500}/i
  );
  const searchTexts = qualSectionMatch ? [qualSectionMatch[0], cleanedText] : [cleanedText];

  for (const text of searchTexts) {
    // 1. Explicit ranges: "3-5 years", "2 to 4 years", "1–3 yrs", "3 - 5 yrs"
    const rangePattern = /\b([0-9]|1[0-9])\s*(?:–|-|—|to)\s*([0-9]|1[0-9])\+?\s*(?:years?|yrs?)\b/gi;
    const rangeMatches = [...text.matchAll(rangePattern)];
    if (rangeMatches.length > 0) {
      const numbers = rangeMatches[0][0].match(/\b\d+\b/g)?.map(Number) || [2, 4];
      const min = numbers[0] ?? 2;
      const max = numbers[1] ?? min + 2;
      return {
        requiredExpStr: `${min}–${max} yrs`,
        minYears: min,
        maxYears: max,
        isJunior: isJuniorRole || min <= 1,
        isSenior: isSeniorRole || min >= 5,
        hasExplicitYears: true
      };
    }

    // 2. Specific year requirements: "5+ years", "3 years of work experience", "3+ years of backend engineering", "minimum 3 years"
    const expPattern = /\b(?:minimum(?:\s+of)?|min\.?|at least|\b)\s*([1-9]|1[0-9])\s*(\+)?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:work|hands[\s\-]?on|relevant|professional|commercial|industry|practical|backend|software|frontend|cloud|systems|engineering|development|experience|background|track record|comprising|in)){0,5}\b/gi;
    const matches = [...text.matchAll(expPattern)];

    if (matches.length > 0) {
      const validMatches = matches.map(m => {
        const num = Number(m[1]);
        const hasPlus = m[2] === '+' || m[0].includes('+');
        return { num, hasPlus };
      }).filter(m => !isNaN(m.num) && m.num > 0 && m.num <= 15);

      if (validMatches.length > 0) {
        const primary = validMatches[0];
        return {
          requiredExpStr: `${primary.num}${primary.hasPlus ? '+' : ''} yrs`,
          minYears: primary.num,
          maxYears: primary.num + 2,
          isJunior: isJuniorRole && primary.num <= 2,
          isSenior: isSeniorRole || primary.num >= 5,
          hasExplicitYears: true
        };
      }
    }
  }

  if (isSeniorRole) {
    return {
      requiredExpStr: 'Senior Scope (5+ yrs baseline)',
      minYears: 5,
      maxYears: 8,
      isJunior: false,
      isSenior: true,
      hasExplicitYears: false
    };
  }

  if (isJuniorRole) {
    return {
      requiredExpStr: 'Entry-Level Scope (0–2 yrs)',
      minYears: 0,
      maxYears: 2,
      isJunior: true,
      isSenior: false,
      hasExplicitYears: false
    };
  }

  // Check if role demands heavy autonomous architecture
  const hasHighComplexityDemands = /\b(distributed systems|kubernetes|cluster|multi[\s\-]?region|cloud architecture|microservices architecture|staff|principal)\b/i.test(fullText);
  if (hasHighComplexityDemands) {
    return {
      requiredExpStr: 'Mid-Senior Scope (3–5 yrs)',
      minYears: 3,
      maxYears: 5,
      isJunior: false,
      isSenior: false,
      hasExplicitYears: false
    };
  }

  return {
    requiredExpStr: 'Scope-based evaluation',
    minYears: 2,
    maxYears: 4,
    isJunior: false,
    isSenior: false,
    hasExplicitYears: false
  };
}

// ── Universal Professional Disciplines & Domain Catalogs ──
export type ProfessionalDiscipline =
  | 'Human Resources'
  | 'Software & Systems Engineering'
  | 'Data, Analytics & AI'
  | 'Marketing & Communications'
  | 'Design & Creative'
  | 'Product & Project Management'
  | 'Finance & Accounting'
  | 'Sales & Business Development'
  | 'Operations & Logistics'
  | 'General Professional';

export interface CompetencyDemand {
  id: string;
  name: string;
  keywords: RegExp;
  evidenceLabel: string;
  gapLabel: string;
}

export interface DisciplineDefinition {
  discipline: ProfessionalDiscipline;
  keywords: RegExp;
  competencies: CompetencyDemand[];
}

export const DISCIPLINE_CATALOG: DisciplineDefinition[] = [
  {
    discipline: 'Human Resources',
    keywords: /\b(human resources|\bhr\b|hrms|keka|talent acquisition|recruiter|recruitment|employee lifecycle|payroll|compensation|benefits|onboarding|offboarding|employee relations|labor law|labour law|esic|\bpf\b|\btds\b|people operations|people partner|generalist)\b/i,
    competencies: [
      {
        id: 'hr_lifecycle',
        name: 'Employee Lifecycle & People Operations',
        keywords: /\b(lifecycle|onboarding|offboarding|employee records|policies|documentation|engagement|performance management)\b/i,
        evidenceLabel: 'Employee Lifecycle & People Operations',
        gapLabel: 'Employee lifecycle & onboarding operations'
      },
      {
        id: 'hr_hrms',
        name: 'HRMS Platforms & HR Reporting',
        keywords: /\b(hrms|keka|workday|bamboohr|peoplesoft|excel|google sheets|attendance|leave|records|reporting)\b/i,
        evidenceLabel: 'HRMS Platforms (Keka/Workday) & Data Reporting',
        gapLabel: 'HRMS platforms & HR data management'
      },
      {
        id: 'hr_payroll',
        name: 'Payroll, TDS & Statutory Compliance',
        keywords: /\b(payroll|salary|reimbursement|tds|\bpf\b|esic|statutory|epf|tax calculations)\b/i,
        evidenceLabel: 'Payroll, TDS & Statutory Compliance (PF/ESIC)',
        gapLabel: 'Payroll processing & statutory compliance (PF/ESIC/TDS)'
      },
      {
        id: 'hr_relations',
        name: 'Employee Relations & Labor Laws',
        keywords: /\b(employee relations|labor law|labour laws|compliance|workplace|conflict resolution|disciplinary|grievance)\b/i,
        evidenceLabel: 'Employee Relations & Labor Law Compliance',
        gapLabel: 'Employee relations & statutory labor laws'
      },
      {
        id: 'hr_recruitment',
        name: 'Talent Acquisition & Recruitment',
        keywords: /\b(recruitment|recruiting|hiring|talent acquisition|screening|interviewing|sourcing|ats)\b/i,
        evidenceLabel: 'Talent Acquisition & Full-Cycle Recruitment',
        gapLabel: 'Talent acquisition & recruitment operations'
      }
    ]
  },
  {
    discipline: 'Software & Systems Engineering',
    keywords: /\b(software|developer|engineer|backend|frontend|full[\s\-]?stack|devops|\bsre\b|cloud architect|systems engineer|microservice|distributed|web application|programming|coding)\b/i,
    competencies: [
      {
        id: 'swe_llm_apps',
        name: 'LLM Application Engineering & Generative AI',
        keywords: /\b(llms?|large language models?|genai|generative ai|foundation models?|prompt engineering|fine[\s\-]?tuning|openai|anthropic|claude|azure openai|close[\s\-]?to[\s\-]?model)\b/i,
        evidenceLabel: 'LLM Application Engineering & Generative AI',
        gapLabel: 'LLM application engineering & generative AI systems'
      },
      {
        id: 'swe_rag_vector',
        name: 'Production RAG, Vector Search & Embeddings',
        keywords: /\b(rag|retrieval[\s\-]?augmented|vector search|embeddings?|semantic search|semantic retrieval|pinecone|weaviate|qdrant|chroma|milvus|azure ai search|knowledge graphs?|chunking)\b/i,
        evidenceLabel: 'Production RAG, Vector Search & Embeddings',
        gapLabel: 'Production RAG, vector search & semantic embeddings'
      },
      {
        id: 'swe_llm_agents',
        name: 'LLM Agents & Multi-Agent Orchestration',
        keywords: /\b(langgraph|crewai|autogen|agentic|multi[\s\-]?agent|agents?|langchain|llamaindex|tool[\s\-]?calling|agent workflows?|agent orchestration|swarm)\b/i,
        evidenceLabel: 'Agent Orchestration & Multi-Agent Systems (LangGraph/CrewAI)',
        gapLabel: 'Agent orchestration & multi-agent systems (LangGraph/CrewAI)'
      },
      {
        id: 'swe_cloud_k8s',
        name: 'Cloud Infrastructure & Kubernetes (AKS/AWS)',
        keywords: /\b(cloud|azure|aks|aws|gcp|kubernetes|k8s|docker|terraform|infrastructure as code|\biac\b|helm|cloud engineering)\b/i,
        evidenceLabel: 'Cloud Infrastructure, Kubernetes & Terraform (AKS/AWS)',
        gapLabel: 'Cloud infrastructure provisioning & Kubernetes workloads (AKS/AWS)'
      },
      {
        id: 'swe_python_fastapi',
        name: 'Python & FastAPI Backend Architecture',
        keywords: /\b(python|fastapi|pydantic|asyncio|rest api|api development|django|flask|backend)\b/i,
        evidenceLabel: 'Python & High-Performance API Engineering',
        gapLabel: 'Python & FastAPI asynchronous backend engineering'
      },
      {
        id: 'swe_observability',
        name: 'Production Observability & Telemetry (LangSmith/OTel)',
        keywords: /\b(observability|telemetry|langsmith|opentelemetry|\botel\b|azure monitor|prometheus|grafana|loki|monitoring|tracing|evals?)\b/i,
        evidenceLabel: 'Production Telemetry, Observability & Tracing',
        gapLabel: 'Production LLM & system observability (LangSmith/OpenTelemetry)'
      },
      {
        id: 'swe_tool_integrations',
        name: 'Context Systems & Tool Integration (MCP)',
        keywords: /\b(\bmcp\b|model context protocol|tool integration|enterprise systems|context systems?|webhooks?|connectors?|api integration|plugins?)\b/i,
        evidenceLabel: 'Model Context Protocol (MCP) & Tool-Use Systems',
        gapLabel: 'Enterprise tool/context integration patterns (MCP)'
      },
      {
        id: 'swe_security',
        name: 'Enterprise Security, IAM & Secrets Management',
        keywords: /\b(secrets management|identity|access control|key vault|azure key vault|iam|rbac|oauth|security practices|encryption)\b/i,
        evidenceLabel: 'Enterprise Security, Secrets & Access Controls',
        gapLabel: 'Enterprise security & secrets management (Key Vault/IAM)'
      },
      {
        id: 'swe_cicd',
        name: 'Automated CI/CD & Build Pipelines',
        keywords: /\b(ci[\/\-]cd|github actions|build pipelines?|release pipelines?|deployment pipelines?|automated testing|continuous integration|continuous deployment|devops|jenkins|circleci|argocd)\b/i,
        evidenceLabel: 'Automated CI/CD & Build Pipelines (GitHub Actions)',
        gapLabel: 'Automated CI/CD workflows & release pipelines'
      },
      {
        id: 'swe_backend_dist',
        name: 'Distributed Systems & Data Architecture',
        keywords: /\b(distributed|microservices?|grpc|trpc|graphql|postgresql|postgres|mysql|sql|redis|nosql|caching|data pipelines?|scalability)\b/i,
        evidenceLabel: 'Distributed Systems & High-Throughput Databases',
        gapLabel: 'Distributed systems & scalable database architecture'
      },
      {
        id: 'swe_streaming',
        name: 'Event Streaming & Real-Time Concurrency',
        keywords: /\b(kafka|event[\s\-]?driven|message queue|rabbitmq|pub[\/\-]sub|websocket|concurrency|throughput|low[\s\-]?latency)\b/i,
        evidenceLabel: 'Event Streaming & Real-Time Concurrency',
        gapLabel: 'Event streaming & real-time messaging pipelines'
      },
      {
        id: 'swe_frontend',
        name: 'Modern Web Architecture & UI State',
        keywords: /\b(react|typescript|javascript|frontend|next\.?js|html|css|tailwind|client state|ui components|user interface)\b/i,
        evidenceLabel: 'Client Web Architecture & UI Systems',
        gapLabel: 'Modern client web architecture & UI state'
      }
    ]
  },
  {
    discipline: 'Data, Analytics & AI',
    keywords: /\b(data analyst|data scientist|machine learning|deep learning|ai engineer|ai researcher|ml engineer|bi analyst|artificial intelligence|data science|computer vision|\bnlp\b|analytics|mlops)\b/i,
    competencies: [
      {
        id: 'ai_llm_apps',
        name: 'LLM Systems & Applied Generative AI',
        keywords: /\b(llms?|large language models?|genai|generative ai|foundation models?|prompt engineering|fine[\s\-]?tuning|openai|anthropic|claude|azure openai|model serving)\b/i,
        evidenceLabel: 'LLM Systems & Applied Generative AI',
        gapLabel: 'Production LLM systems & generative AI models'
      },
      {
        id: 'ai_rag_vector',
        name: 'Production RAG, Vector Search & Semantic Embeddings',
        keywords: /\b(rag|retrieval[\s\-]?augmented|vector search|embeddings?|semantic search|semantic retrieval|pinecone|weaviate|qdrant|chroma|milvus|azure ai search|knowledge graphs?|chunking)\b/i,
        evidenceLabel: 'Production RAG, Vector Search & Semantic Embeddings',
        gapLabel: 'Production RAG, vector search & semantic embeddings'
      },
      {
        id: 'ai_llm_agents',
        name: 'LLM Agents & Multi-Agent Orchestration',
        keywords: /\b(langgraph|crewai|autogen|agentic|multi[\s\-]?agent|ai agents?|autonomous agents?|tool[\s\-]?calling|agent workflows?|agent orchestration|swarm)\b/i,
        evidenceLabel: 'Agent Orchestration & Multi-Agent Frameworks (LangGraph/CrewAI)',
        gapLabel: 'Agent orchestration & multi-agent systems'
      },
      {
        id: 'ai_ml_models',
        name: 'Deep Learning & Applied ML Models',
        keywords: /\b(pytorch|tensorflow|scikit[\s\-]?learn|huggingface|transformers|fine[\s\-]?tuning|model training|neural network|nlp|deep learning|ml models?)\b/i,
        evidenceLabel: 'Deep Learning & Model Architecture (PyTorch/Transformers)',
        gapLabel: 'Deep learning model training & fine-tuning'
      },
      {
        id: 'ai_python_fastapi',
        name: 'Python & High-Performance AI APIs',
        keywords: /\b(python|fastapi|pydantic|asyncio|rest api|api development|flask|backend)\b/i,
        evidenceLabel: 'Python & High-Performance AI API Engineering',
        gapLabel: 'Python & FastAPI AI service development'
      },
      {
        id: 'ai_cloud_mlops',
        name: 'Cloud AI Infrastructure & MLOps (Kubernetes)',
        keywords: /\b(cloud|azure|azure openai|aks|aws|kubernetes|k8s|docker|terraform|mlops|model serving|inference|gpu)\b/i,
        evidenceLabel: 'Cloud AI Workload Deployment & MLOps (K8s/AKS)',
        gapLabel: 'Cloud AI deployments & MLOps infrastructure'
      },
      {
        id: 'ai_data_eng',
        name: 'Data Engineering & Feature Pipelines',
        keywords: /\b(data pipelines?|etl|spark|databricks|snowflake|bigquery|sql|feature store|data lake|kafka)\b/i,
        evidenceLabel: 'Large-Scale Data Pipelines & Feature Engineering',
        gapLabel: 'Data engineering & pipeline architecture'
      }
    ]
  },
  {
    discipline: 'Marketing & Communications',
    keywords: /\b(marketing|\bseo\b|\bsem\b|social media|campaign|brand|content strategy|copywriting|growth|email marketing|advertising|\bppc\b|meta ads|google ads)\b/i,
    competencies: [
      {
        id: 'mkt_seo',
        name: 'SEO & Organic Growth',
        keywords: /\b(seo|search engine|organic|keywords|ranking|traffic|backlinks|on[\s\-]?page)\b/i,
        evidenceLabel: 'SEO & Organic Search Growth',
        gapLabel: 'Search engine optimization (SEO)'
      },
      {
        id: 'mkt_paid',
        name: 'Paid Acquisition & Campaign ROI',
        keywords: /\b(sem|ppc|google ads|meta ads|facebook ads|paid media|campaigns|ad spend|cac|roas)\b/i,
        evidenceLabel: 'Paid Media & Performance Marketing',
        gapLabel: 'Paid media & performance marketing'
      },
      {
        id: 'mkt_content',
        name: 'Content Strategy & Copywriting',
        keywords: /\b(content|copywriting|editorial|creative|storytelling|messaging|blog|newsletter)\b/i,
        evidenceLabel: 'Content Strategy & High-Conversion Copywriting',
        gapLabel: 'Content strategy & copywriting'
      },
      {
        id: 'mkt_analytics',
        name: 'Marketing Analytics & Attribution',
        keywords: /\b(analytics|google analytics|ga4|conversion rate|cro|funnel|attribution|metrics)\b/i,
        evidenceLabel: 'Marketing Analytics & Growth Funnels',
        gapLabel: 'Marketing analytics & conversion optimization'
      }
    ]
  },
  {
    discipline: 'Design & Creative',
    keywords: /\b(designer|ui[\/\-]ux|product design|user experience|visual design|graphic design|figma|prototyping|design system|creative director)\b/i,
    competencies: [
      {
        id: 'des_uiux',
        name: 'UI/UX & Interactive Prototyping',
        keywords: /\b(ui|ux|interaction|wireframe|prototype|figma|user flow|mockups)\b/i,
        evidenceLabel: 'UI/UX Craft & Interactive Prototyping',
        gapLabel: 'UI/UX design & interactive prototyping'
      },
      {
        id: 'des_system',
        name: 'Design Systems & Component Libraries',
        keywords: /\b(design system|tokens|components|modular|patterns|style guide|typography)\b/i,
        evidenceLabel: 'Design Systems & Modular Components',
        gapLabel: 'Design systems & component architecture'
      },
      {
        id: 'des_research',
        name: 'User Research & Usability Testing',
        keywords: /\b(user research|usability|interviews|personas|heuristics|testing|feedback)\b/i,
        evidenceLabel: 'User Research & Usability Validation',
        gapLabel: 'User research & usability methodologies'
      }
    ]
  },
  {
    discipline: 'Finance & Accounting',
    keywords: /\b(finance|financial|accounting|accountant|auditing|taxation|balance sheet|p&l|general ledger|\bcpa\b|chartered accountant|budgeting)\b/i,
    competencies: [
      {
        id: 'fin_reporting',
        name: 'Financial Accounting & Reporting',
        keywords: /\b(reporting|financial statements|general ledger|p&l|balance sheet|gaap|ifrs|accounting)\b/i,
        evidenceLabel: 'Financial Accounting & Reporting Standards',
        gapLabel: 'Financial accounting & ledger management'
      },
      {
        id: 'fin_tax',
        name: 'Taxation, Audit & Statutory Compliance',
        keywords: /\b(tax|taxation|gst|audit|statutory|compliance|filing|deductions|regulatory)\b/i,
        evidenceLabel: 'Tax Compliance, Auditing & Statutory Filings',
        gapLabel: 'Tax planning & statutory compliance'
      },
      {
        id: 'fin_modeling',
        name: 'Budgeting & Financial Modeling',
        keywords: /\b(budget|forecast|financial modeling|valuation|cash flow|projections|variance)\b/i,
        evidenceLabel: 'Budgeting, Forecasting & Financial Modeling',
        gapLabel: 'Financial modeling & forecasting'
      }
    ]
  },
  {
    discipline: 'Product & Project Management',
    keywords: /\b(product manager|product management|scrum master|agile|product owner|roadmap|user stories|sprint)\b/i,
    competencies: [
      {
        id: 'prd_strategy',
        name: 'Product Vision & Strategic Roadmapping',
        keywords: /\b(strategy|roadmap|vision|prioritization|okrs|feature definition|backlog)\b/i,
        evidenceLabel: 'Product Strategy & Roadmap Prioritization',
        gapLabel: 'Product vision & strategic roadmapping'
      },
      {
        id: 'prd_agile',
        name: 'Agile Delivery & Cross-Functional Execution',
        keywords: /\b(agile|scrum|sprint|jira|delivery|cross[\s\-]?functional|execution|stakeholder)\b/i,
        evidenceLabel: 'Agile Execution & Cross-Functional Delivery',
        gapLabel: 'Agile & sprint delivery coordination'
      },
      {
        id: 'prd_analytics',
        name: 'Product Analytics & User Retention',
        keywords: /\b(metrics|kpis|retention|funnel|churn|amplitude|mixpanel|launch|experimentation)\b/i,
        evidenceLabel: 'Product Telemetry & Metric Optimization',
        gapLabel: 'Product analytics & KPI tracking'
      }
    ]
  },
  {
    discipline: 'Sales & Business Development',
    keywords: /\b(sales|business development|account executive|\bsdr\b|\bbdr\b|lead generation|pipeline|quota|\bcrm\b|salesforce)\b/i,
    competencies: [
      {
        id: 'sls_pipeline',
        name: 'Pipeline Generation & Outbound Prospecting',
        keywords: /\b(prospecting|outbound|leads|pipeline|cold outreach|discovery|qualification)\b/i,
        evidenceLabel: 'Pipeline Generation & Outbound Prospecting',
        gapLabel: 'Pipeline development & lead generation'
      },
      {
        id: 'sls_closing',
        name: 'Deal Closing & Contract Negotiation',
        keywords: /\b(closing|negotiation|contract|quota|deals|conversion|revenue)\b/i,
        evidenceLabel: 'Contract Negotiation & Deal Closing',
        gapLabel: 'Deal negotiation & closing execution'
      },
      {
        id: 'sls_crm',
        name: 'CRM Management & Revenue Forecasting',
        keywords: /\b(crm|salesforce|hubspot|forecasting|pipeline management|revenue)\b/i,
        evidenceLabel: 'CRM Management & Revenue Forecasting',
        gapLabel: 'CRM administration & pipeline hygiene'
      }
    ]
  },
  {
    discipline: 'General Professional',
    keywords: /.*/i,
    competencies: [
      {
        id: 'gen_exec',
        name: 'Core Role Deliverables & Execution',
        keywords: /\b(execution|deliverables|management|coordination|implementation|operations)\b/i,
        evidenceLabel: 'Core Role Deliverables & Execution',
        gapLabel: 'Core role domain deliverables'
      },
      {
        id: 'gen_domain',
        name: 'Specialized Domain Expertise',
        keywords: /\b(specialized|domain|expertise|methodology|standards|knowledge)\b/i,
        evidenceLabel: 'Specialized Domain Competency',
        gapLabel: 'Specialized domain qualifications'
      },
      {
        id: 'gen_collab',
        name: 'Stakeholder Alignment & Communication',
        keywords: /\b(communication|collaboration|teamwork|stakeholder|presentation|interpersonal)\b/i,
        evidenceLabel: 'Cross-Functional Stakeholder Alignment',
        gapLabel: 'Stakeholder alignment & communication'
      },
      {
        id: 'gen_quality',
        name: 'Problem Solving & Operational Standards',
        keywords: /\b(problem[\s\-]?solving|quality|analytical|troubleshooting|results|standards)\b/i,
        evidenceLabel: 'Analytical Problem Solving & Quality',
        gapLabel: 'Operational quality & problem-solving'
      }
    ]
  }
];

// ── Detect Professional Discipline ──
export function detectDiscipline(text: string, titleHint: string = ''): ProfessionalDiscipline {
  const title = (titleHint || '').toLowerCase();
  
  if (/\b(human resources|\bhr\b|hrms|recruiter|recruitment|talent acquisition|people operations|payroll|generalist)\b/i.test(title)) {
    return 'Human Resources';
  }
  if (/\b(data analyst|data scientist|machine learning|deep learning|ai engineer|ai researcher|ml engineer|bi analyst|artificial intelligence)\b/i.test(title)) {
    return 'Data, Analytics & AI';
  }
  if (/\b(software|developer|engineer|backend|frontend|full[\s\-]?stack|devops|\bsre\b|cloud architect|firmware)\b/i.test(title)) {
    return 'Software & Systems Engineering';
  }
  if (/\b(marketing|\bseo\b|content strategist|growth|copywriter|social media|advertising|brand manager)\b/i.test(title)) {
    return 'Marketing & Communications';
  }
  if (/\b(designer|ui[\/\-]ux|product designer|graphic designer|creative director)\b/i.test(title)) {
    return 'Design & Creative';
  }
  if (/\b(product manager|product owner|scrum master|technical product)\b/i.test(title)) {
    return 'Product & Project Management';
  }
  if (/\b(accountant|accounting|finance|financial analyst|auditor|tax)\b/i.test(title)) {
    return 'Finance & Accounting';
  }
  if (/\b(sales|business development|account executive|\bsdr\b|\bbdr\b)\b/i.test(title)) {
    return 'Sales & Business Development';
  }

  const combined = `${titleHint} ${titleHint} ${text}`.toLowerCase();
  let bestDiscipline: ProfessionalDiscipline = 'General Professional';
  let maxHits = 0;

  for (const item of DISCIPLINE_CATALOG) {
    if (item.discipline === 'General Professional') continue;
    const matches = combined.match(new RegExp(item.keywords.source, 'gi'));
    const count = matches ? matches.length : 0;
    if (count > maxHits && count >= 2) {
      maxHits = count;
      bestDiscipline = item.discipline;
    }
  }

  return bestDiscipline;
}

// ── Dynamic Cross-Domain Competency Analyzer ──
export function analyzeCompetencies(
  jobText: string,
  candidateText: string,
  jobDiscipline: ProfessionalDiscipline,
  candidateDiscipline: ProfessionalDiscipline,
  techScore: number
) {
  const isPeerTechnicalDiscipline =
    (jobDiscipline === 'Software & Systems Engineering' && candidateDiscipline === 'Data, Analytics & AI') ||
    (jobDiscipline === 'Data, Analytics & AI' && candidateDiscipline === 'Software & Systems Engineering');

  const isDisciplineMismatch =
    jobDiscipline !== 'General Professional' &&
    candidateDiscipline !== 'General Professional' &&
    jobDiscipline !== candidateDiscipline &&
    !isPeerTechnicalDiscipline;

  const catalogEntry = DISCIPLINE_CATALOG.find(d => d.discipline === jobDiscipline) ||
    DISCIPLINE_CATALOG.find(d => d.discipline === 'Software & Systems Engineering') ||
    DISCIPLINE_CATALOG.find(d => d.discipline === 'General Professional')!;

  // 1. Rank competencies dynamically by how heavily they are demanded in this specific job description
  const scoredCompetencies = catalogEntry.competencies.map(comp => {
    const jobHits = (jobText.match(new RegExp(comp.keywords.source, 'gi')) || []).length;
    const candHits = (candidateText.match(new RegExp(comp.keywords.source, 'gi')) || []).length;
    return { comp, jobHits, candHits };
  });

  // Sort by job demand first (skills explicitly demanded in the job appear at the very top)
  scoredCompetencies.sort((a, b) => {
    if (b.jobHits !== a.jobHits) return b.jobHits - a.jobHits;
    return b.candHits - a.candHits;
  });

  // Select the competencies to evaluate: prioritize skills the job actually demands
  const demanded = scoredCompetencies.filter(s => s.jobHits > 0);
  const selected = demanded.length >= 4
    ? demanded.slice(0, 4)
    : [
        ...demanded,
        ...scoredCompetencies.filter(s => s.jobHits === 0).slice(0, Math.max(0, 4 - demanded.length))
      ];

  // 2. Score candidate truthfully based on verified resume deliverables vs job requirements
  const competencyAlignment = selected.map(({ comp, jobHits, candHits }) => {
    if (isDisciplineMismatch) {
      return {
        skill: comp.name,
        percentage: Math.max(8, Math.min(22, 12 + Math.round(Math.random() * 8)))
      };
    }

    let pct: number;
    if (jobHits > 0 && candHits === 0) {
      // Explicitly demanded by job, but candidate has ZERO proof on resume!
      pct = Math.max(14, Math.min(26, Math.round(18 + Math.random() * 6)));
    } else if (candHits >= 2) {
      // Strong proven deliverables
      pct = Math.max(82, Math.min(96, Math.round(86 + Math.min(8, candHits * 2))));
    } else if (candHits === 1) {
      // Foundational mention / single hit
      pct = Math.max(48, Math.min(62, Math.round(52 + Math.random() * 6)));
    } else {
      // Secondary skill not explicitly emphasized
      pct = Math.max(25, Math.min(45, Math.round(32 + (techScore / 4) * 8)));
    }

    return {
      skill: comp.name,
      percentage: pct
    };
  });

  const evidence: Array<{ text: string; tag: string; status: 'strong' | 'good' | 'stretch' | 'mismatch'; isStretch?: boolean }> = [];

  if (isDisciplineMismatch) {
    evidence.push({
      text: `Discipline mismatch: Candidate is in ${candidateDiscipline} vs role in ${jobDiscipline}`,
      tag: 'Discipline gap',
      status: 'mismatch',
      isStretch: true
    });

    for (const { comp } of selected.slice(0, 2)) {
      evidence.push({
        text: `Missing: ${comp.gapLabel}`,
        tag: 'Discipline barrier',
        status: 'mismatch',
        isStretch: true
      });
    }
  } else {
    // Only evaluate evidence for skills ACTUALLY DEMANDED by the job (jobHits > 0)
    for (const { comp, jobHits, candHits } of selected) {
      if (jobHits === 0) {
        // Job NEVER asked for this skill — NEVER claim it is a gap or a required match!
        continue;
      }

      if (candHits === 0) {
        // Job asked for this, but candidate lacks deliverables
        evidence.push({
          text: `Missing: ${comp.gapLabel}`,
          tag: 'Skill gap',
          status: 'mismatch',
          isStretch: true
        });
      } else if (candHits >= 2) {
        // Job asked for this, and candidate has strong verified deliverables
        evidence.push({
          text: comp.evidenceLabel,
          tag: 'Solid match',
          status: 'strong'
        });
      } else if (candHits === 1) {
        // Job asked for this, but candidate only has basic mention
        evidence.push({
          text: `Foundational: ${comp.name}`,
          tag: 'Learning curve',
          status: 'stretch',
          isStretch: true
        });
      }
    }
  }

  return { competencyAlignment, evidence, isDisciplineMismatch };
}

// ── Holistic Context Subagent Processor (Universal) ──
export function runContextSubagent(job: Partial<JobListing>, resume: CandidateResume) {
  const title = job.title || 'Role Opportunity';
  const company = job.company || 'Company';
  const location = job.location || 'Remote / Hybrid';
  const salary = job.salary || 'Disclosed in interview';
  const postedDaysAgo = job.postedDaysAgo ?? 3;
  const repostCount = job.repostCount ?? 0;
  const applicantCount = job.applicantCount ?? 25;

  const fullJobText = `${title} ${company} ${job.description || ''} ${job.coreMission || ''} ${job.engineeringDemands || ''}`;
  const expInfo = extractJobExperienceDemands(fullJobText, title);

  const jobDiscipline = detectDiscipline(fullJobText, title);
  const candidateDiscipline = resume.candidateDiscipline || detectDiscipline(resume.fullResumeText || '', resume.targetRole || '');

  const isPeerTechnicalDiscipline =
    (jobDiscipline === 'Software & Systems Engineering' && candidateDiscipline === 'Data, Analytics & AI') ||
    (jobDiscipline === 'Data, Analytics & AI' && candidateDiscipline === 'Software & Systems Engineering');

  const isDisciplineMismatch =
    jobDiscipline !== 'General Professional' &&
    candidateDiscipline !== 'General Professional' &&
    jobDiscipline !== candidateDiscipline &&
    !isPeerTechnicalDiscipline;

  const autonomyLevel = expInfo.isSenior
    ? 'Lead / Senior Autonomous Scope'
    : (expInfo.isJunior ? 'Foundational / Mentored Scope' : 'Autonomous Professional Scope');

  const coreMission = job.coreMission || job.description?.slice(0, 450) || 'Execute core functional deliverables and operational priorities.';
  const roleDemands = job.engineeringDemands || job.description?.slice(0, 450) || 'Role ownership, quality standards, and problem-solving.';

  const candidateName = resume.name || 'Candidate';
  const candidateTier = resume.seniorityTier || 'Mid-Level';
  const candidateYears = resume.experienceYears ?? 1.5;
  const candidateArchetype = resume.engineeringArchetype || `${candidateTier} ${candidateDiscipline} Professional`;
  const candidateScale = resume.demonstratedScaleAndScope || 'Demonstrated execution of core role responsibilities.';
  const candidateAutonomy = resume.autonomyTrackRecord || 'Autonomous execution of professional deliverables.';
  const candidateDomains = Array.isArray(resume.primaryTechnicalDomains) && resume.primaryTechnicalDomains.length
    ? resume.primaryTechnicalDomains
    : [candidateDiscipline];
  const candidateText = resume.fullResumeText ? resume.fullResumeText.slice(0, 450) : 'Experienced professional.';

  const synthesizedState = `
ROLE SPECIFICATION:
Position: ${title}
Organization: ${company} [${location}]
Professional Field: ${jobDiscipline}
Experience Requirement: ${expInfo.hasExplicitYears ? `${expInfo.requiredExpStr} (explicitly mandated)` : `${expInfo.requiredExpStr} (scope-based evaluation)`}
Seniority & Autonomy Demand: ${autonomyLevel}
Core Mission: ${coreMission}
Day-to-Day Operational Demands: ${roleDemands}
Hiring Timeline Signals: Posted ${postedDaysAgo}d ago, Reposted ${repostCount} times, ${applicantCount} applicants.

CANDIDATE DEMONSTRATED PROFILE:
Candidate: ${candidateName}
Professional Field: ${candidateDiscipline}
Current / Target Role: ${resume.targetRole}
Seniority Tier: ${candidateTier} (${candidateYears} years verified experience)
Professional Profile: ${candidateArchetype}
Demonstrated Scope & Accomplishments: ${candidateScale}
Autonomy & Execution: ${candidateAutonomy}
Key Competencies: ${candidateDomains.join('; ')}
Candidate Background: ${candidateText}

CROSS-DOMAIN & QUALIFICATION CALIBRATION:
1. Field Alignment:
   ${isDisciplineMismatch
     ? `CRITICAL DISCIPLINE MISMATCH: Candidate's field is "${candidateDiscipline}", but the role is in "${jobDiscipline}". A ${resume.targetRole} applying to a ${title} lacks the requisite professional credentials, operational methods, and domain compliance. Verdict MUST be skill_mismatch.`
     : `FIELD ALIGNMENT: Candidate and role are both within "${jobDiscipline}". Evaluate based on competency depth, project scale, and seniority requirements.`
   }
2. Experience Alignment:
   Candidate has ${candidateYears} years experience vs role demand (${expInfo.requiredExpStr}).
   ${!isDisciplineMismatch
     ? (expInfo.isSenior && candidateYears < 3.5
       ? `CRITICAL SENIORITY MISMATCH: Candidate has only ${candidateYears} years experience applying to a Senior role requiring 5+ years. A junior/mid candidate cannot bridge senior autonomous scope, architecture ownership, and leadership. Verdict MUST be experience_mismatch.`
       : (expInfo.hasExplicitYears && (expInfo.minYears - candidateYears >= 1.5 || candidateYears / expInfo.minYears < 0.65)
         ? `CRITICAL TENURE DEFICIT: Candidate has only ${candidateYears} years vs explicit requirement of ${expInfo.requiredExpStr}. High probability of hard ATS and recruiter screen rejection. Verdict MUST be experience_mismatch.`
         : (expInfo.isJunior
           ? `Role has junior scope. Candidate meets or exceeds functional expectations.`
           : `Posting is evaluated on verified deliverables and competency alignment.`
         )
       )
     )
     : ''
   }
3. Screening Feasibility:
   ${isDisciplineMismatch
     ? `Non-transferable field. Candidate will not pass initial recruiter or hiring manager screening for this ${jobDiscipline} role.`
     : `Direct domain transferability. Candidate brings verified deliverables in target field.`
   }
`.trim();

  return {
    expInfo,
    synthesizedState,
    jobDiscipline,
    candidateDiscipline,
    isDisciplineMismatch,
    candidateArchetype,
    roleDemandsSummary: coreMission,
    autonomyLevel
  };
}

// ── API Endpoints ──

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, key: !!apiKey });
});

app.get('/api/jobs', (_req, res) => {
  res.json({ jobs: INITIAL_JOBS });
});

app.get('/api/personas', (_req, res) => {
  res.json({ personas: PERSONAS });
});

app.post('/api/scan-job', async (req, res) => {
  const { job, resume, customResume } = req.body;

  if (!job) {
    return res.status(400).json({ error: 'Job listing object is required' });
  }

  if (!job.coreMission && job.description) {
    job.coreMission = job.description.slice(0, 450);
  }
  if (!job.engineeringDemands && job.description) {
    job.engineeringDemands = job.description.slice(0, 450);
  }

  const fallbackCandidate = (resume && PERSONAS[resume]) || PERSONAS['alex'];
  const rawName = customResume?.name || fallbackCandidate?.name || 'Candidate';
  const cleanName = /indian|institute|college|university|custom profile/i.test(rawName) ? 'Candidate' : rawName;

  const fullResumeText = customResume?.fullResumeText || fallbackCandidate?.fullResumeText || '';
  const detectedCandidateDiscipline = customResume?.candidateDiscipline ||
    detectDiscipline(fullResumeText, customResume?.targetRole || fallbackCandidate?.targetRole || '');

  const candidate: CandidateResume = {
    ...fallbackCandidate,
    ...(customResume || {}),
    name: cleanName,
    experienceYears: customResume?.experienceYears ?? fallbackCandidate?.experienceYears ?? 1.5,
    seniorityTier: customResume?.seniorityTier || fallbackCandidate?.seniorityTier || 'Junior',
    candidateDiscipline: detectedCandidateDiscipline,
    primaryTechnicalDomains: (customResume?.primaryTechnicalDomains && customResume.primaryTechnicalDomains.length)
      ? customResume.primaryTechnicalDomains
      : (fallbackCandidate?.primaryTechnicalDomains || [detectedCandidateDiscipline]),
    fullResumeText
  };

  const t0 = Date.now();

  try {
    const subagent = runContextSubagent(job, candidate);
    const expInfo = subagent.expInfo;
    console.log(`[CareerRadar Scan] Job: "${job.title}" at "${job.company}" | Exp Req: ${expInfo.requiredExpStr} (explicit: ${expInfo.hasExplicitYears}) | Cand: ${candidate.name} (${candidate.experienceYears}y) | Disc: ${subagent.jobDiscipline}`);
    const fullJobText = `${job.title || ''} ${job.company || ''} ${job.description || ''} ${job.coreMission || ''} ${job.engineeringDemands || ''}`;
    const resumeText = candidate.fullResumeText || '';

    // Call Jev System One with Speculative Fan-out for Tactical Career Decisions
    const response = await client.systemOne({
      state: subagent.synthesizedState,
      questions: {
        decision_verdict: choice(
          'What is the tactical application recommendation for this candidate regarding this specific job opportunity?',
          {
            can_apply: 'Strong fit — candidate background, qualifications, and core deliverables align well with role expectations; high probability of landing interview',
            reach_apply: 'Strategic reach — candidate is in the right professional discipline but is slightly below the formal years requirement; proven deliverables make them a viable applicant',
            experience_mismatch: 'Seniority mismatch — candidate is in the correct discipline but the role mandates significantly higher (or lower) seniority with hard tenure filters',
            skill_mismatch: 'Discipline or field mismatch — role is in a completely different professional discipline (e.g. software engineer applying for HR, marketing, or finance) or requires non-transferable domain credentials'
          }
        ),
        technical_match_score: score(
          'Rate the functional and domain competency match between what this candidate brings and what the role demands.',
          [
            'Complete mismatch in professional discipline or problem domain',
            'Minimal overlap — requires fundamental domain retraining',
            'Moderate overlap — transferable skills exist, but candidate lacks specialized core experience',
            'High competency alignment — candidate has solved the exact category of domain challenges',
            'Flawless synergy — immediate production contribution on day one'
          ]
        ),
        experience_feasibility: score(
          'Evaluate how feasibly the candidate meets the seniority and experience expectations.',
          [
            'Impassable gap — company auto-rejects due to hard senior tenure filters or discipline barrier',
            'Steep gap — candidate would struggle with team autonomy expectations at this level',
            'Manageable stretch — candidate compensates for slight tenure deficit with strong proven deliverables',
            'Negligible gap — demonstrated scale fully offsets calendar differences',
            'Zero gap — candidate operates at or above the role requirements'
          ]
        ),
        interview_probability: noul(
          'Based on candidate credentials, domain alignment, and problem-solving caliber, what is the probability (0 to 1) of landing a screening interview?'
        )
      }
    });

    const ms = Date.now() - t0;
    const a = response.answers as any;

    let verdictChoice = a.decision_verdict?.choice ?? (subagent.isDisciplineMismatch ? 'skill_mismatch' : 'reach_apply');
    if (subagent.isDisciplineMismatch) {
      verdictChoice = 'skill_mismatch';
    }

    const verdictConfidence = a.decision_verdict?.confidence ?? 0.92;
    const techScore = a.technical_match_score?.score ?? (subagent.isDisciplineMismatch ? 0.1 : 2.8);
    const expScore = a.experience_feasibility?.score ?? (subagent.isDisciplineMismatch ? 0.8 : 2.5);
    const interviewOdds = a.interview_probability?.noul ?? (subagent.isDisciplineMismatch ? 0.08 : 0.65);

    // Derived Match Percentage (0 - 100%)
    let matchPercentage: number;
    if (subagent.isDisciplineMismatch) {
      matchPercentage = Math.max(6, Math.min(18, Math.round(techScore * 5 + interviewOdds * 25 + 5)));
    } else {
      matchPercentage = Math.round(
        ((techScore / 4) * 0.5 + (expScore / 4) * 0.25 + interviewOdds * 0.25) * 100
      );
    }

    // Dynamic Competency Analysis (No hardcoded 10 engineering domains!)
    const { competencyAlignment, evidence: domainEvidence } = analyzeCompetencies(
      fullJobText,
      resumeText,
      subagent.jobDiscipline,
      subagent.candidateDiscipline,
      techScore
    );

    const evidence = [...domainEvidence];

    const candidateYears = candidate.experienceYears ?? 1.5;
    const requiredMinYears = expInfo.minYears || (expInfo.isSenior ? 5 : (expInfo.isJunior ? 0 : 2));
    const tenureDeficit = requiredMinYears - candidateYears;
    const tenureRatio = candidateYears / Math.max(1, requiredMinYears);

    // Hard Guardrails: Stop AI buttering on severe tenure / seniority mismatches!
    const isSevereTenureMismatch =
      (expInfo.isSenior && candidateYears < 3.5) ||
      (expInfo.hasExplicitYears && tenureDeficit >= 1.5 && tenureRatio < 0.70) ||
      (expScore < 1.6 && tenureDeficit >= 1.0);

    if (isSevereTenureMismatch && !subagent.isDisciplineMismatch) {
      verdictChoice = 'experience_mismatch';
    }

    const isReach = verdictChoice === 'reach_apply';
    const isMismatch = verdictChoice === 'experience_mismatch' || verdictChoice === 'skill_mismatch';

    if (subagent.isDisciplineMismatch) {
      evidence.push({
        text: `Field disconnect (${candidate.candidateDiscipline} vs ${subagent.jobDiscipline})`,
        tag: 'Discipline gap',
        status: 'mismatch',
        isStretch: true
      });
    } else if (isSevereTenureMismatch || verdictChoice === 'experience_mismatch') {
      evidence.push({
        text: `Tenure deficit (${candidateYears} yrs vs ${expInfo.requiredExpStr})`,
        tag: 'Tenure barrier',
        status: 'mismatch',
        isStretch: true
      });
    } else if (isReach) {
      evidence.push({
        text: `Calculated reach (${candidateYears} yrs vs ${expInfo.requiredExpStr})`,
        tag: expScore < 1.8 ? 'Steep gap' : 'Borderline reach',
        status: 'stretch',
        isStretch: true
      });
    } else {
      evidence.push({
        text: `Tenure aligns (${candidateYears} yrs meets ${expInfo.requiredExpStr})`,
        tag: 'Qualified',
        status: 'strong'
      });
    }

    const reqDisplay = expInfo.hasExplicitYears
      ? expInfo.requiredExpStr.replace(' years', ' yrs')
      : (expInfo.isSenior ? '5+ yrs' : (expInfo.isJunior ? '0 – 2 yrs' : (expInfo.minYears === 3 ? '3 – 5 yrs' : 'Scope-based')));

    const experienceComparison = {
      required: reqDisplay,
      candidate: `${candidateYears} yrs`,
      evaluationType: subagent.isDisciplineMismatch
        ? 'DISCIPLINE-BARRIER'
        : (expInfo.hasExplicitYears ? 'YEARS-FILTER' : (expInfo.isSenior ? 'SENIOR-SCOPE' : 'SCOPE-BASED')),
      note: subagent.isDisciplineMismatch
        ? `Non-transferable field · Direct discipline barrier`
        : (isSevereTenureMismatch
          ? `Strict tenure filter · ${tenureDeficit.toFixed(1)} yr deficit below filter baseline`
          : (isReach
            ? (expScore < 1.8 ? 'Steep tenure stretch · High screening barrier' : 'Borderline reach · Requires standout deliverables')
            : (isMismatch ? 'Strict tenure filters · High screening barrier' : 'Direct experience match · Fully qualified')))
    };

    let verdictHeadline = 'STRONG FIT';
    let verdictSubtext = 'Core qualifications and deliverables strongly match role expectations.';
    let badgeLabel = 'DIRECT FIT';

    if (subagent.isDisciplineMismatch || verdictChoice === 'skill_mismatch') {
      verdictHeadline = 'DISCIPLINE MISMATCH';
      verdictSubtext = `Candidate background in ${candidate.candidateDiscipline} does not align with ${subagent.jobDiscipline} role expectations.`;
      badgeLabel = 'DISCIPLINE GAP';
    } else if (isSevereTenureMismatch || verdictChoice === 'experience_mismatch') {
      verdictHeadline = 'EXP MISMATCH';
      verdictSubtext = `Candidate tenure (${candidateYears} yrs) falls significantly below ${expInfo.requiredExpStr}. High screening barrier.`;
      badgeLabel = 'TENURE BARRIER';
    } else if (verdictChoice === 'reach_apply') {
      verdictHeadline = 'REACH APPLY';
      verdictSubtext = 'Competency match is solid; experience scope is a calculated reach.';
      badgeLabel = 'REACH CANDIDATE';
    }

    // Dynamic Deep Rationale
    let rationale = '';
    if (subagent.isDisciplineMismatch) {
      rationale = `This position is a ${job.title} in ${subagent.jobDiscipline} at ${job.company}, requiring domain expertise in ${competencyAlignment.map(c => c.skill).slice(0, 3).join(', ')}. The candidate's background is in ${candidate.candidateDiscipline} (${candidate.targetRole}). Because the candidate lacks foundational operational training and credentials in ${subagent.jobDiscipline}, this application faces an immediate discipline filter. Verdict: ${verdictHeadline}.`;
    } else {
      const topSkills = competencyAlignment.filter(c => c.percentage >= 70).map(c => c.skill);
      const skillSummary = topSkills.length ? topSkills.slice(0, 2).join(' and ') : subagent.jobDiscipline;
      rationale = `Candidate demonstrates solid domain alignment in ${skillSummary}. Experience of ${candidate.experienceYears} yrs compared to ${expInfo.requiredExpStr} makes this a ${isReach ? 'competitive reach' : 'direct qualification'}. Verdict: ${verdictHeadline}.`;
    }

    // Dynamic Interview Pitch
    let interviewPitch = '';
    if (subagent.isDisciplineMismatch) {
      interviewPitch = `"This role requires domain qualifications in ${subagent.jobDiscipline} outside my core background in ${candidate.candidateDiscipline}. For a cross-discipline transition, emphasize transferable organizational leadership and process execution, or seek hybrid crossover roles."`;
    } else {
      const topSkills = candidate.primaryTechnicalDomains.slice(0, 3).join(', ');
      interviewPitch = `"I bring demonstrated experience in ${topSkills}, and have delivered ${candidate.demonstratedScaleAndScope.split(';')[0] || 'proven deliverables'}, positioning me to contribute immediate production value to ${job.company}."`;
    }

    console.log(`[CareerRadar Result] ${job.title} @ ${job.company} -> Verdict: ${verdictHeadline} (${verdictChoice}) | Fit: ${matchPercentage}% | Tech: ${techScore}/4 | Exp: ${expScore}/4`);

    res.json({
      jobId: job.id,
      ms,
      matchPercentage,
      verdict: verdictChoice,
      verdictHeadline,
      verdictSubtext,
      badgeLabel,
      verdictConfidence,
      techScore,
      expScore,
      interviewOdds,
      evidence,
      technicalAlignment: competencyAlignment,
      experienceComparison,
      rationale,
      interviewPitch,
      jobDiscipline: subagent.jobDiscipline,
      candidateDiscipline: candidate.candidateDiscipline,
      verdictProbabilities: a.decision_verdict?.probabilities ?? {},
      model: response.model,
      tokens: response.usage,
      subagentSignals: {
        candidateArchetype: subagent.candidateArchetype,
        candidateSeniority: `${candidate.seniorityTier} (${candidate.experienceYears}y exp)`,
        requiredExp: expInfo.requiredExpStr,
        candidateExp: `${candidate.experienceYears} Years verified experience`,
        hasExplicitYears: expInfo.hasExplicitYears,
        summaryVerdict: verdictSubtext
      }
    });
  } catch (err: any) {
    console.error('Jev evaluation error:', err?.message);
    res.status(500).json({ error: err?.message || 'Jev System One evaluation failed' });
  }
});

// ── Universal Intelligent Resume Parser ──
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

function calculateYearsFromDateRanges(dateRanges: string[]): number {
  if (!dateRanges || dateRanges.length === 0) return 1.5;

  const monthNames: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parsedIntervals: Array<{ start: number; end: number }> = [];
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth();

  for (const range of dateRanges) {
    const match = range.match(/(?:([A-Za-z]+)\s+)?(\d{4})\s*[–\-—]\s*(?:(Present|Current|Now)|(?:([A-Za-z]+)\s+)?(\d{4}))/i);
    if (!match) continue;

    const startMonthStr = match[1]?.toLowerCase().slice(0, 3);
    const startYear = parseInt(match[2], 10);
    const startMonth = (startMonthStr && monthNames[startMonthStr] !== undefined) ? monthNames[startMonthStr] : 0;

    let endYear = nowYear;
    let endMonth = nowMonth;
    if (!match[3]) {
      const endMonthStr = match[4]?.toLowerCase().slice(0, 3);
      endYear = parseInt(match[5], 10);
      endMonth = (endMonthStr && monthNames[endMonthStr] !== undefined) ? monthNames[endMonthStr] : 11;
    }

    if (startYear >= 1980 && endYear >= startYear && endYear <= nowYear + 1) {
      parsedIntervals.push({
        start: startYear * 12 + startMonth,
        end: endYear * 12 + endMonth
      });
    }
  }

  if (parsedIntervals.length === 0) {
    return dateRanges.length >= 4 ? 3.5 : (dateRanges.length >= 2 ? 1.5 : 0.8);
  }

  parsedIntervals.sort((a, b) => a.start - b.start);
  let totalMonths = 0;
  let curStart = parsedIntervals[0].start;
  let curEnd = parsedIntervals[0].end;

  for (let i = 1; i < parsedIntervals.length; i++) {
    const inv = parsedIntervals[i];
    if (inv.start <= curEnd) {
      curEnd = Math.max(curEnd, inv.end);
    } else {
      totalMonths += (curEnd - curStart);
      curStart = inv.start;
      curEnd = inv.end;
    }
  }
  totalMonths += (curEnd - curStart);

  const years = Math.round((totalMonths / 12) * 10) / 10;
  return Math.max(0.5, Math.min(25, years));
}

export function parseResumeIntelligently(text: string, overrides: any = {}) {
  // 1. Dynamic Candidate Name extraction
  let parsedName = overrides.name || '';
  if (!parsedName) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (
        /^[A-Za-z\s\.\-']{2,40}$/.test(line) &&
        !/(resume|curriculum|vitae|education|experience|summary|skills|projects|contact|email|phone|objective|\btech\b|university|college|institute)/i.test(line)
      ) {
        parsedName = line;
        break;
      }
    }
  }
  if (!parsedName || /indian|institute|college|university|custom profile|candidate/i.test(parsedName)) {
    parsedName = 'Candidate';
  }

  // 2. Education Detection (Universal)
  const eduMatch = text.match(/\b(Indian Institute of Technology[^\n,.;|]*|IIT[^\n,.;|]*|National Institute[^\n,.;|]*|BITS[^\n,.;|]*|IIIT[^\n,.;|]*|Stanford[^\n,.;|]*|MIT|Berkeley|Harvard|University[^\n,.;|]*|College[^\n,.;|]*|Institute[^\n,.;|]*|School of[^\n,.;|]*)/i);
  const college = eduMatch ? eduMatch[0].trim() : '';
  const degreeMatch = text.match(/\b(B\.?Tech[^\n,.;|]*|M\.?Tech[^\n,.;|]*|B\.?S\.?[^\n,.;|]*|M\.?S\.?[^\n,.;|]*|\bB\.?A\.?\b[^\n,.;|]*|\bM\.?A\.?\b[^\n,.;|]*|B\.?Com[^\n,.;|]*|M\.?Com[^\n,.;|]*|\bBBA\b[^\n,.;|]*|\bMBA\b[^\n,.;|]*|Bachelor of [A-Za-z]+|Master of [A-Za-z]+|Bachelor[^\n,.;|]*|Master[^\n,.;|]*|Ph\.?D[^\n,.;|]*|Diploma[^\n,.;|]*)/i);
  const degree = degreeMatch ? degreeMatch[0].trim() : '';
  const cgpaMatch = text.match(/(CGPA[:\s]*[\d.]+|GPA[:\s]*[\d.]+|[\d.]+\s*(?:CGPA|GPA))/i);
  const cgpa = cgpaMatch ? cgpaMatch[0].trim() : '';

  // 3. Experience & Dates
  const dateRanges = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*[–\-—]\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/gi) || [];
  const calculatedYears = calculateYearsFromDateRanges(dateRanges);
  const years = overrides.years !== undefined && overrides.years !== '' ? Number(overrides.years) : calculatedYears;

  // 4. Extract Roles & Job Titles (Any profession)
  const roles: string[] = [];
  const roleMatches = text.match(/(?:Senior|Staff|Lead|Principal|Associate|Junior|Executive|Head of)?\s*(?:Software Engineer|Backend Engineer|Frontend Engineer|Full[\s\-]?Stack Engineer|Platform Engineer|DevOps Engineer|Data Engineer|Systems Engineer|Human Resources Generalist|Human Resources Specialist|HR Generalist|HR Specialist|HR Manager|HR Business Partner|Recruiter|Talent Acquisition Specialist|Product Manager|Product Owner|UI\/UX Designer|Product Designer|Graphic Designer|Marketing Manager|Marketing Specialist|Content Strategist|SEO Specialist|Financial Analyst|Accountant|Auditor|Operations Manager|Sales Executive|Account Executive|Business Development Representative|Intern)[^\n,.;|]*/gi);
  if (roleMatches) {
    const uniqueRoles = Array.from(new Set(roleMatches.map(r => {
      return r.split(/\s+(?:at|@|\-|\–|\—)\s+|\s*\(/i)[0].trim();
    }))).slice(0, 3);
    roles.push(...uniqueRoles);
  }

  // 5. Detect Candidate Discipline
  const candidateDiscipline = overrides.discipline || detectDiscipline(text, roles[0] || '');

  // 6. Seniority Tier Calibration
  const seniorityTier: CandidateResume['seniorityTier'] =
    overrides.seniorityTier || (years >= 5 ? 'Senior' : (years >= 2 ? 'Mid-Level' : 'Junior'));

  // 7. Extract Demonstrated Highlights & Impact Bullets
  const systemsHighlights: string[] = [];
  const lines = text.split('\n').map(l => l.trim());
  for (const line of lines) {
    if (line.startsWith('–') || line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
      const cleanBullet = line.replace(/^[\–\-\•\*]\s*/, '').trim();
      if (cleanBullet.length > 25 && cleanBullet.length < 180) {
        if (/(\d+%|\d+x|\$[\d,]+|\bbuilt\b|\bmanaged\b|\bled\b|\bimproved\b|\breduced\b|\bdelivered\b|\barchitected\b|\bdesigned\b|\bscaled\b)/i.test(cleanBullet)) {
          systemsHighlights.push(cleanBullet);
          if (systemsHighlights.length >= 4) break;
        }
      }
    }
  }

  // 8. Extract Skills & Competencies dynamically
  const skillsList: string[] = [];
  const skillsSectionMatch = text.match(/(?:Technical Skills|Key Skills|Skills|Core Competencies|Areas of Expertise|Tools & Technologies)[:\n]([\s\S]{0,500})/i);
  if (skillsSectionMatch && skillsSectionMatch[1]) {
    const skillLines = skillsSectionMatch[1].split(/\n|\/|\||,/).map(s => s.replace(/^[–\-\•\*]\s*/, '').replace(/^[A-Za-z]+:\s*/, '').trim());
    for (const sk of skillLines) {
      if (sk.length >= 2 && sk.length <= 30 && !/(experience|projects|education|summary|achievements)/i.test(sk)) {
        if (!skillsList.includes(sk)) skillsList.push(sk);
        if (skillsList.length >= 6) break;
      }
    }
  }

  // Fallback domain tokens if explicit skills were sparse
  if (skillsList.length === 0) {
    const catalogEntry = DISCIPLINE_CATALOG.find(d => d.discipline === candidateDiscipline);
    if (catalogEntry) {
      for (const comp of catalogEntry.competencies) {
        if (new RegExp(comp.keywords.source, 'gi').test(text)) {
          skillsList.push(comp.name);
        }
      }
    }
  }

  const derivedTargetRole = overrides.targetRole ||
    (roles.length > 0 ? roles[0] : `${seniorityTier} ${candidateDiscipline} Professional`);

  const candidate: CandidateResume = {
    id: 'custom',
    name: parsedName,
    targetRole: derivedTargetRole,
    experienceYears: years,
    seniorityTier,
    candidateDiscipline,
    engineeringArchetype: overrides.archetype || `${seniorityTier} in ${candidateDiscipline}`,
    demonstratedScaleAndScope: systemsHighlights.join('; ') || `Proven track record of operational and professional execution in ${candidateDiscipline}.`,
    autonomyTrackRecord: overrides.autonomy || (seniorityTier === 'Senior' || seniorityTier === 'Staff / Lead'
      ? 'Operates with high autonomy on complex initiatives and end-to-end deliverables.'
      : 'Demonstrated execution of core functional deliverables and operational priorities.'),
    primaryTechnicalDomains: skillsList.length ? skillsList : [candidateDiscipline],
    fullResumeText: text.trim()
  };

  return {
    candidate,
    metadata: {
      college: college || 'Higher Education Graduate',
      degree: degree || candidateDiscipline,
      cgpa,
      roles: roles.length ? roles : [derivedTargetRole],
      dateRanges,
      calculatedYears,
      achievements: systemsHighlights.slice(0, 2),
      systemsHighlights,
      domains: skillsList
    }
  };
}

// ── File Upload Endpoint (PDF / TXT) ──
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    let text = '';
    if (req.file) {
      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const parser = new PDFParse({ data: req.file.buffer });
        const textResult = await parser.getText();
        text = textResult.text;
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: 'Could not extract valid text from resume (minimum 20 characters required)' });
    }

    const result = parseResumeIntelligently(text, req.body);
    res.json({ ...result, rawText: text });
  } catch (err: any) {
    console.error('Resume upload error:', err);
    res.status(500).json({ error: err?.message || 'Failed to process resume file' });
  }
});

// ── Text / Form Parser Endpoint ──
app.post('/api/parse-resume', (req, res) => {
  const { text, ...overrides } = req.body;
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: 'Resume text must be at least 20 characters' });
  }

  const result = parseResumeIntelligently(text, overrides);
  res.json({ ...result, rawText: text });
});

const PORT = 3001;
const server = app.listen(PORT, () => console.log(`GhostHunter Jev Server running on http://localhost:${PORT}`));

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
