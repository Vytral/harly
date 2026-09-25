import { describe, expect, it } from "vitest";

import {
  evaluateCandidateWithRules,
  replayRulesEvaluation,
  RULES_EVALUATION_VERSION,
  SCORING_CONSTANTS,
} from "./rules";
import { buildStructuredCriteria } from "./criteria-builder";

describe("Harly ATS Deterministic Engine rules-v5", () => {
  const juniorPhpJob = {
    title: "Junior PHP Engineer",
    description: "Build web applications.",
    requirements: "PHP and Laravel experience.",
    experienceLevel: "junior",
    education: null,
    keywords: ["PHP", "Laravel", "Git"],
  };

  it("returns transparent criteria and the rules-v4 version", () => {
    const result = evaluateCandidateWithRules({
      job: juniorPhpJob,
      candidate: {
        resumeText: `John Doe
Full Stack Developer
john@example.com

EXPERIENCE
PHP Developer - Acme Web (2024 - Present)
• Built web services using PHP and Laravel.
• Used Git for version control.
`,
        answers: [],
      },
      // Phase 0 exit gate: every duration-sensitive test pins an explicit referenceDate.
      referenceDate: "2026-09-19",
    });

    expect(RULES_EVALUATION_VERSION).toBe("rules-v5");
    expect(result.result.score).toBeGreaterThanOrEqual(80);
    expect(result.criterionResults.map((c) => c.label)).toContain("PHP");
    expect(
      result.criterionResults
        .filter((c) => c.status === "met")
        .every((c) => c.evidence !== null),
    ).toBe(true);
    const phpResult = result.criterionResults.find((c) => c.label === "PHP");
    expect(phpResult?.evidence).toContain('Acme Web (PHP Developer): "Built web services using PHP and Laravel."');
  });

  it("evaluates Isabella Rossi demo candidate with exact 8-year tenure, 100% coverage, and Strong Yes", () => {
    const marketingJob = {
      title: "Growth Marketing Manager",
      description: "Own the growth funnel from acquisition to activation.",
      requirements: "Experience across paid and organic channels.",
      experienceLevel: "Senior (5+ years)",
      education: "Bachelor's",
      keywords: ["SEO", "Paid acquisition", "Analytics", "Lifecycle", "Content"],
    };

    const isabellaResume = `Isabella Rossi
Lifecycle & content marketing
Milan, Italy · isabella.rossi@gmail.com

EXPERIENCE

Growth Marketing Manager — Nimbus Labs (2023–Present)
  •  Grew Nimbus Labs's self-serve pipeline 3.2x in 18 months through SEO, lifecycle email and referral loops.
  •  Cut blended CAC 28% by reallocating paid spend based on cohort LTV analysis.
  •  Launched a content engine (2 posts/week) that became the #1 acquisition channel.

Marketing Manager — Mosaic HQ (2020–2023)
  •  Owned activation experiments; 14 of 31 A/B tests shipped with significant lift.
  •  Built the marketing analytics stack from scratch (GA4, Amplitude, dbt).

Content Marketer — Atlas Forge (2018–2020)
  •  Managed social and community programs reaching 80k followers.

SKILLS
  •  Lifecycle marketing: email, in-product, push (Customer.io, Braze)
  •  Paid acquisition: Google Ads, LinkedIn, Meta — $1M+ annual budget
  •  SEO and content strategy; analytics with GA4, Amplitude
  •  Experiment design and statistics fundamentals

EDUCATION
B.A. Business & Marketing — State University of Technology (2014–2018)
`;

    const result = evaluateCandidateWithRules({
      job: marketingJob,
      candidate: {
        resumeText: isabellaResume,
        answers: [],
      },
      // Pinned: "2023–Present" tenure is referenceDate-relative; freezing keeps
      // the 8-year gold deterministic (Phase 0 exit gate).
      referenceDate: "2026-09-19",
    });

    // 8.0 years verified across 3 roles (3 yrs + 3 yrs + 2 yrs = 8 yrs exactly)
    const expResult = result.criterionResults.find((c) => c.label === "Experience");
    expect(expResult?.status).toBe("met");
    expect(expResult?.evidence).toContain("8 years of experience verified");

    // Education verified
    const eduResult = result.criterionResults.find((c) => c.label === "Education");
    expect(eduResult?.status).toBe("met");
    expect(eduResult?.evidence).toContain("B.A. Business & Marketing");

    // All skills verified with complete sentences
    const seoResult = result.criterionResults.find((c) => c.label === "SEO");
    expect(seoResult?.status).toBe("met");
    expect(seoResult?.evidence).toContain('Nimbus Labs (Growth Marketing Manager): "Grew Nimbus Labs\'s self-serve pipeline 3.2x in 18 months through SEO, lifecycle email and referral loops."');

    // Score & Tier invariants
    expect(result.demonstratedScore).toBe(100);
    expect(result.evidenceCoverage).toBe(100);
    expect(result.coverageAdjustedScore).toBe(100);
    expect(result.result.score).toBe(100);
    expect(result.result.recommendation).toBe("strong_yes");
    expect(result.requiresHumanReview).toBe(false);
    expect(result.result.gaps.length).toBe(0);
  });

  it("handles multi-skill vacancy with low evidence coverage without inflating the score", () => {
    const broadJob = {
      title: "Senior Full Stack Engineer",
      description: "Comprehensive multi-disciplinary stack.",
      requirements: "Must have broad experience across 10 areas.",
      experienceLevel: "Senior (5+ years)",
      education: null,
      keywords: [
        "React",
        "TypeScript",
        "Python",
        "PostgreSQL",
        "Kubernetes",
        "Docker",
        "AWS",
        "Terraform",
        "GraphQL",
        "Redis",
      ],
    };

    // Candidate only demonstrates React and TypeScript; 8 other skills unmentioned; tenure is ~2.8 yrs vs 5 required
    const lowCoverageResume = `Jane Doe
Frontend Specialist
jane@example.com

EXPERIENCE
Frontend Engineer - Tech Co (2024 - Present)
• Built user interfaces using React and TypeScript.
`;

    const result = evaluateCandidateWithRules({
      job: broadJob,
      candidate: {
        resumeText: lowCoverageResume,
        answers: [],
      },
      referenceDate: "2026-09-19",
    });

    // 12 criteria total (10 skills + Experience + title relevance).
    // 4 scored: React (100 @ wt 25), TypeScript (100 @ wt 25), Experience (40 @ wt 25),
    // Senior Full Stack Engineer title (45 @ wt 10 effective — Frontend is related
    // but not equivalent to Full Stack, §8.4, so partial rather than met).
    // demonstratedScore = (2500 + 2500 + 1000 + 450) / 85 = 76.
    expect(result.demonstratedScore).toBe(76);
    // Coverage is low (~27%) because 8 skills are not_demonstrated
    expect(result.evidenceCoverage).toBeLessThan(35);
    // The coverageAdjustedScore shrinks toward the neutral baseline (40)
    expect(result.coverageAdjustedScore).toBeLessThan(60);
    expect(result.result.score).toBeLessThan(60);
    expect(result.result.recommendation).toBe("maybe");
    expect(result.requiresHumanReview).toBe(true);
  });

  it("allows Strong Yes when preferred criteria are not met, provided required criteria and score thresholds hold", () => {
    const jobWithPreferred = {
      title: "Backend Engineer",
      description: "Build robust APIs.",
      requirements: "Go is required. Docker is required. Rust is preferred.",
      experienceLevel: "Mid",
      education: null,
      keywords: ["Go", "Docker", "Rust"],
    };

    const resumeWithOnlyRequired = `Bob Smith
Backend Developer
bob@example.com

EXPERIENCE
Backend Engineer — Cloud Corp (2022 - Present)
• Developed microservices using Go and deployed containers with Docker.
`;

    const result = evaluateCandidateWithRules({
      job: jobWithPreferred,
      candidate: {
        resumeText: resumeWithOnlyRequired,
        answers: [],
      },
      referenceDate: "2026-09-19",
    });

    // Go and Docker are met
    expect(result.criterionResults.find((c) => c.label === "Go")?.status).toBe("met");
    expect(result.criterionResults.find((c) => c.label === "Docker")?.status).toBe("met");
    // Rust is not_demonstrated (preferred)
    const rustResult = result.criterionResults.find((c) => c.label === "Rust");
    expect(rustResult?.status).toBe("unknown"); // legacy mapping of not_demonstrated
    expect(rustResult?.extendedStatus).toBe("not_demonstrated");
    expect(rustResult?.score).toBe(null);

    // Score on the 2 demonstrated skills (Go, Docker) + 1 required duration is 100
    expect(result.demonstratedScore).toBe(100);
    expect(result.evidenceCoverage).toBeGreaterThanOrEqual(70);
    expect(result.coverageAdjustedScore).toBeGreaterThanOrEqual(SCORING_CONSTANTS.YES_MIN_SCORE);
    expect(result.result.recommendation).toBe("yes");
  });

  it("merges overlapping date intervals cleanly into a non-overlapping contiguous duration", () => {
    const job = {
      title: "Software Engineer",
      description: "Experienced dev.",
      requirements: null,
      experienceLevel: "Senior (5+ years)",
      education: null,
      keywords: ["Python"],
    };

    // Candidate worked two concurrent jobs over the same 2-year window (2022-2024)
    const overlappingResume = `Alice Johnson
Software Engineer
alice@example.com

EXPERIENCE
Software Engineer — Company A (2022 - 2024)
• Built Python services.

Contract Developer — Company B (2022 - 2024)
• Maintained Python pipelines.
`;

    const result = evaluateCandidateWithRules({
      job,
      candidate: {
        resumeText: overlappingResume,
        answers: [],
      },
      referenceDate: "2026-09-19",
    });

    const expResult = result.criterionResults.find((c) => c.label === "Experience");
    // Union should be ~2 years, NOT 4 years!
    expect(expResult?.evidence).toContain("2 years of experience found");
    expect(expResult?.status).toBe("not_met"); // 2 years < 5 years required
  });

  // ── Broader Regression Test Suite ───────────────────────────────────────────

  describe("Broader ATS Regression Scenarios", () => {
    it("distinguishes skill only declared in Skills section vs demonstrated in work", () => {
      const job = {
        title: "Frontend Engineer",
        description: "Web developer",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: ["React", "GraphQL"],
      };

      const resume = `Developer
dev@example.com

EXPERIENCE
Web Dev - Agency (2023 - 2024)
• Built customer portals using React.

SKILLS
• GraphQL, REST, Tailwind
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resume, answers: [] },
      });

      const react = res.criterionResults.find((c) => c.label === "React");
      const graphql = res.criterionResults.find((c) => c.label === "GraphQL");

      // React is demonstrated in work experience (score: 100, strength: demonstrated)
      expect(react?.status).toBe("met");
      expect(react?.score).toBe(100);
      expect(react?.evidenceStrength).toBe("demonstrated");
      expect(react?.evidence).toContain('Agency (Web Dev): "Built customer portals using React."');

      // GraphQL is declared in skills section (score: 80, strength: declared)
      expect(graphql?.status).toBe("met");
      expect(graphql?.score).toBe(80);
      expect(graphql?.evidenceStrength).toBe("declared");
      expect(graphql?.evidence).toContain('Declared in Skills section: "GraphQL, REST, Tailwind"');
    });

    it("evaluates technical symbols with word boundaries: C++, C#, and .NET correctly", () => {
      const job = {
        title: "Systems Engineer",
        description: "Core systems",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: ["C++", "C#", ".NET"],
      };

      const resume = `Programmer
p@example.com

EXPERIENCE
Systems Developer - Tech Labs (2022 - Present)
• Programmed real-time engines in C++ and tools in C#.
• Shipped enterprise microservices using .NET runtime.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resume, answers: [] },
      });

      const cpp = res.criterionResults.find((c) => c.label === "C++");
      const csharp = res.criterionResults.find((c) => c.label === "C#");
      const dotnet = res.criterionResults.find((c) => c.label === ".NET");

      expect(cpp?.status).toBe("met");
      expect(cpp?.score).toBe(100);
      expect(csharp?.status).toBe("met");
      expect(csharp?.score).toBe(100);
      expect(dotnet?.status).toBe("met");
      expect(dotnet?.score).toBe(100);
    });

    it("parses Spanish resume section headers, degrees, and date ranges seamlessly", () => {
      const job = {
        title: "Desarrollador Backend",
        description: "Servicios backend",
        requirements: null,
        experienceLevel: "Mid (3+ years)",
        education: "Bachelor's",
        keywords: ["PostgreSQL", "Docker"],
      };

      const spanishResume = `Mateo González
mateo@ejemplo.com
Buenos Aires, Argentina

EXPERIENCIA LABORAL
Ingeniero Backend — Serviclick (2020 - 2024)
• Diseñó bases de datos relacionales en PostgreSQL con alta disponibilidad.
• Desplegó contenedores utilizando Docker en producción.

EDUCACIÓN
Ingeniería en Informática — Universidad de Buenos Aires (2015 - 2020)

HABILIDADES
• Docker, PostgreSQL, Linux
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: spanishResume, answers: [] },
      });

      // Experience: 4 years verified (2020 - 2024) meets 3+ years
      const exp = res.criterionResults.find((c) => c.label === "Experience");
      expect(exp?.status).toBe("met");
      expect(exp?.evidence).toContain("4 years of experience verified");

      // Education: Ingeniería en Informática rank 3 meets Bachelor's rank 3
      const edu = res.criterionResults.find((c) => c.label === "Education");
      expect(edu?.status).toBe("met");
      expect(edu?.evidence).toContain("Ingeniería en Informática");

      // Skills: PostgreSQL and Docker demonstrated in work experience
      const pg = res.criterionResults.find((c) => c.label === "PostgreSQL");
      const docker = res.criterionResults.find((c) => c.label === "Docker");
      expect(pg?.status).toBe("met");
      expect(docker?.status).toBe("met");
      expect(pg?.evidence).toContain('Serviclick (Ingeniero Backend): "Diseñó bases de datos relacionales en PostgreSQL con alta disponibilidad."');
    });

    it("handles month/year date intervals accurately (e.g. Mar 2021 - Nov 2023)", () => {
      const job = {
        title: "Developer",
        description: "Dev",
        requirements: null,
        experienceLevel: "Junior (2+ years)",
        education: null,
        keywords: ["Node.js"],
      };

      const resume = `Jane
jane@example.com

EXPERIENCE
Developer — Alpha Inc (Mar 2021 - Nov 2023)
• Built APIs with Node.js.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resume, answers: [] },
      });

      const exp = res.criterionResults.find((c) => c.label === "Experience");
      // Mar 2021 to Nov 2023 = 32 months = 2.7 years
      expect(exp?.status).toBe("met");
      expect(exp?.evidence).toContain("2.7 years of experience verified");
    });

    it("enforces explicit recruiter knockout failure immediately yielding No tier", () => {
      const job = {
        title: "Driver",
        description: "Delivery driver",
        requirements: "Valid driver license is mandatory.",
        experienceLevel: null,
        education: null,
        keywords: ["Driver License"],
      };

      const rubricWithKnockout = {
        version: "custom-rubric-v1",
        criteria: [
          {
            id: "crit:license",
            key: "license",
            label: "Driver License",
            type: "skill" as const,
            importance: "required" as const,
            weight: 50,
            aliases: [],
            isKnockout: true,
          },
        ],
      };

      // Candidate has clean resume but does not mention Driver License
      const resume = `Carlos
carlos@example.com

EXPERIENCE
Warehouse Worker — Logistics Co (2022 - 2024)
• Handled warehouse inventory and package dispatch.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resume, answers: [] },
        rubric: rubricWithKnockout,
      });

      const licenseCrit = res.criterionResults.find((c) => c.label === "Driver License");
      expect(licenseCrit?.status).toBe("unknown"); // legacy mapping
      expect(licenseCrit?.extendedStatus).toBe("not_demonstrated");
      expect(licenseCrit?.isKnockout).toBe(true);
      // Because an explicit knockout was not demonstrated, it fails the gate and results in 'no'
      expect(res.result.recommendation).toBe("no");
      expect(res.requiresHumanReview).toBe(true);
    });

    it("gracefully handles unparseable or missing dates without crashing or claiming phantom years", () => {
      const job = {
        title: "Sales Rep",
        description: "Sales",
        requirements: null,
        experienceLevel: "Mid (3+ years)",
        education: null,
        keywords: ["Sales"],
      };

      const resumeWithoutDates = `Ethan
ethan@example.com

EXPERIENCE
Sales Rep — FastSales
• Sold enterprise software products.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resumeWithoutDates, answers: [] },
      });

      // Low confidence timeline
      expect(res.requiresHumanReview).toBe(true);
      // Sales skill is still identified in the role
      const sales = res.criterionResults.find((c) => c.label === "Sales");
      expect(sales?.status).toBe("met");
    });

    it("guarantees snapshot reproducibility and time-frozen tenure using referenceDate", () => {
      const job = {
        title: "Frontend Developer",
        description: "React role",
        requirements: "Requires 4+ years of experience",
        experienceLevel: "Senior",
        education: null,
        keywords: ["React"],
      };

      const resumeWithPresent = `Alex Johnson
alex@example.com

EXPERIENCE
Frontend Engineer — Acme Corp | Mar 2021 - Present
• Built React web applications.
`;

      // Evaluated as of March 2024 (exactly 3 years / 36 months -> does not meet 4+ years)
      const res2024 = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resumeWithPresent, answers: [] },
        referenceDate: "2024-03-15",
      });

      const exp2024 = res2024.criterionResults.find((c) => c.label === "Experience");
      expect(exp2024?.extendedStatus).toBe("partially_met");
      expect(exp2024?.evidence).toContain("3 years of experience");
      expect(res2024.metadata.referenceDate).toBe("2024-03-15");
      expect(res2024.metadata.engineVersion).toBe("rules-v5");
      expect(res2024.metadata.neutralEvidenceBaseline).toBe(40);
      expect(res2024.candidateFacts.schemaVersion).toBe(2);
      expect(res2024.skillProfiles.schemaVersion).toBe(2);
      expect(res2024.skillProfiles.profiles.some((p) => p.canonicalName === "React")).toBe(true);

      // Re-evaluated as of March 2026 (exactly 5 years / 60 months -> meets 4+ years requirement)
      const res2026 = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resumeWithPresent, answers: [] },
        referenceDate: "2026-03-15",
      });

      const exp2026 = res2026.criterionResults.find((c) => c.label === "Experience");
      expect(exp2026?.status).toBe("met");
      expect(exp2026?.evidence).toContain("5 years of experience");
      expect(res2026.metadata.referenceDate).toBe("2026-03-15");
    });

    it("normalizes skill aliases (e.g. React.js, ReactJS, TS) into canonical concepts", () => {
      const job = {
        title: "Frontend Developer",
        description: "Looking for React and TypeScript developer",
        requirements: "Must have React and TypeScript",
        experienceLevel: "Mid",
        education: null,
        keywords: ["React", "TypeScript"],
      };

      const resumeWithAliases = `Jane Dev
jane@example.com

EXPERIENCE
Frontend Engineer — Alpha Tech | 2021 - 2023
• Developed interactive web views using React.js and TS.
• Managed state using Redux Toolkit.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resumeWithAliases, answers: [] },
        referenceDate: "2024-01-01",
      });

      const react = res.criterionResults.find((c) => c.label === "React");
      expect(react?.status).toBe("met");
      expect(react?.matchMethod).toBe("built_in_alias");

      const ts = res.criterionResults.find((c) => c.label === "TypeScript");
      expect(ts?.status).toBe("met");
      expect(ts?.matchMethod).toBe("built_in_alias");
    });

    it("isolates criterion-specific tenure: candidate has 8 years total career but only 2 years of Python", () => {
      const rubric = {
        version: "custom-v1",
        criteria: [
          {
            key: "crit:exp",
            label: "Experience",
            type: "experience_duration" as const,
            importance: "required" as const,
            weight: 30,
            aliases: [],
            minimumValue: 5, // 5+ years overall career required
          },
          {
            key: "crit:python",
            label: "Python",
            type: "skill" as const,
            importance: "required" as const,
            weight: 40,
            aliases: ["Python3", "Py"],
            minimumValue: 3, // 3+ years of Python specifically required
          },
        ],
      };

      const resume = `Carlos Gomez
carlos@example.com

EXPERIENCE
Senior Marketing Analyst — Growth Corp | 2016 - 2020
• Analyzed market trends using Excel and SQL.

Product Operations — Scale Co | 2020 - 2022
• Managed cross-functional workflows.

Backend Developer — PyTech | 2022 - 2024
• Built microservices using Python and FastAPI.
`;

      const res = evaluateCandidateWithRules({
        job: {
          title: "Senior Backend Developer",
          description: "Python role",
          requirements: "5+ years experience, 3+ years Python",
          experienceLevel: "Senior",
          education: null,
          keywords: ["Python"],
        },
        candidate: { resumeText: resume, answers: [] },
        rubric,
        referenceDate: "2024-06-01",
      });

      // 1. Overall experience: 2016 to 2024 = 8.0 years -> MEETS 5+ yrs requirement
      const overallExp = res.criterionResults.find((c) => c.label === "Experience");
      expect(overallExp?.status).toBe("met");
      expect(overallExp?.score).toBe(100);
      expect(overallExp?.evidence).toContain("8 years of experience verified");

      // 2. Python specific experience: ONLY used at PyTech (2022 - 2024 = 2.0 years) -> FAILS 3+ yrs requirement
      const pythonCrit = res.criterionResults.find((c) => c.label === "Python");
      expect(pythonCrit?.extendedStatus).toBe("partially_met");
      expect(pythonCrit?.evidence).toContain("roles spanning up to 2 years of Python");
      expect(pythonCrit?.missingReason).toContain("documented evidence window reaches at most 2 years");
      expect(pythonCrit?.score).toBeLessThan(100);

      const pythonAssessment = res.criterionAssessments.find((c) => c.label === "Python");
      expect(pythonAssessment?.evidence?.supportingEvidence).toHaveLength(1);
      expect(pythonAssessment?.evidence?.supportingEvidence?.[0]?.provenance.rawText).toContain("Python");
    });

    it("evaluates skills declared only in Skills section when duration is required", () => {
      const rubric = {
        version: "custom-v1",
        criteria: [
          {
            key: "crit:python",
            label: "Python",
            type: "skill" as const,
            importance: "required" as const,
            weight: 50,
            aliases: [],
            minimumValue: 3, // 3+ years required
          },
        ],
      };

      const resumeWithSkillSectionOnly = `Dev
dev@example.com

EXPERIENCE
Project Manager — Biz Corp | 2018 - 2023
• Managed software delivery timelines.

SKILLS
• Python
• Git
`;

      const res = evaluateCandidateWithRules({
        job: {
          title: "Python Dev",
          description: "Python",
          requirements: "3+ years Python",
          experienceLevel: "Mid",
          education: null,
          keywords: ["Python"],
        },
        candidate: { resumeText: resumeWithSkillSectionOnly, answers: [] },
        rubric,
        referenceDate: "2024-01-01",
      });

      const pythonCrit = res.criterionResults.find((c) => c.label === "Python");
      expect(pythonCrit?.extendedStatus).toBe("partially_met");
      expect(pythonCrit?.evidence).toContain("Declared in Skills section: \"Python\"");
      expect(pythonCrit?.evidence).toContain("requires 3+ yrs of verified experience");
      expect(pythonCrit?.missingReason).toContain("only declared as a skill without verified work tenure");
    });

    it("prevents false positive matches for related but non-equivalent skills (e.g. Next.js does not satisfy React)", () => {
      const job = {
        title: "React Developer",
        description: "Pure React role",
        requirements: "Requires React experience",
        experienceLevel: "Mid",
        education: null,
        keywords: ["React"],
      };

      // Candidate only used Angular and Vue (or other frameworks, not React)
      const resumeWithoutReact = `Frontend Engineer
candidate@example.com

EXPERIENCE
Frontend Developer — TechCorp | 2021 - 2023
• Built client-side web portals using Vue.js and Angular.
`;

      const res = evaluateCandidateWithRules({
        job,
        candidate: { resumeText: resumeWithoutReact, answers: [] },
        referenceDate: "2024-01-01",
      });

      const reactCrit = res.criterionResults.find((c) => c.label === "React");
      expect(reactCrit?.status).toBe("unknown"); // legacy status
      expect(reactCrit?.extendedStatus).toBe("not_demonstrated");
      expect(reactCrit?.score).toBeNull();
    });
  });

  describe("Phase 0 — versioned evaluation snapshots (Audit doc §5)", () => {
    const snapshotJob = {
      title: "Backend Developer",
      description: "Python role",
      requirements: "Requires Python experience",
      experienceLevel: "Mid",
      education: null,
      keywords: ["Python"],
    };

    const snapshotResume = `Sam Dev
sam@example.com

EXPERIENCE
Backend Developer — Acme Corp | 2020 - 2023
• Built APIs using Python.
`;

    function snapshotInput(overrides: Record<string, unknown> = {}) {
      return {
        job: snapshotJob,
        candidate: { resumeText: snapshotResume, answers: [] as Array<{ question: string; answer: string }> },
        referenceDate: "2024-06-01",
        evaluatedAt: "2024-06-01T12:00:00.000Z",
        ...overrides,
      };
    }

    it("exposes engine, layer, taxonomy, and configuration versions in metadata", () => {
      const res = evaluateCandidateWithRules(snapshotInput());
      expect(res.metadata.engineVersion).toBe("rules-v5");
      expect(res.metadata.parserVersion).toBe("parser-v2");
    expect(res.metadata.matcherVersion).toBe("matcher-v3");
    expect(res.metadata.scoringVersion).toBe("scoring-v3");
      expect(res.metadata.taxonomyVersion).toBe("skill-taxonomy-v2");
      expect(res.metadata.referenceDate).toBe("2024-06-01");
      expect(res.metadata.configuration.neutralEvidenceBaseline).toBe(
        SCORING_CONSTANTS.UNVERIFIED_EVIDENCE_BASELINE,
      );
      expect(res.metadata.configuration.requiredWeightFactor).toBe(SCORING_CONSTANTS.REQUIRED_WEIGHT_FACTOR);
      expect(res.metadata.configuration.preferredWeightFactor).toBe(SCORING_CONSTANTS.PREFERRED_WEIGHT_FACTOR);
      expect(res.metadata.configuration.tierThresholds.strongYesMinScore).toBe(
        SCORING_CONSTANTS.STRONG_YES_MIN_SCORE,
      );
    });

    it("fingerprints the exact resume, facts, and rubric inputs", () => {
      const res = evaluateCandidateWithRules(snapshotInput());
      for (const hash of [res.metadata.resumeSourceHash, res.metadata.candidateFactsHash, res.metadata.rubricHash]) {
        expect(hash).toMatch(/^[0-9a-f]{42}$/);
      }
      // Hashes are stable: same inputs always produce the same fingerprints.
      const replay = evaluateCandidateWithRules(snapshotInput());
      expect(replay.metadata.resumeSourceHash).toBe(res.metadata.resumeSourceHash);
      expect(replay.metadata.candidateFactsHash).toBe(res.metadata.candidateFactsHash);
      expect(replay.metadata.rubricHash).toBe(res.metadata.rubricHash);
    });

    it("reproduces byte-identical output from identical snapshot inputs", () => {
      const first = evaluateCandidateWithRules(snapshotInput());
      const second = evaluateCandidateWithRules(snapshotInput());
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it("replays from persisted facts, profiles, rubric, and metadata", () => {
      const original = evaluateCandidateWithRules(snapshotInput());
      const replay = replayRulesEvaluation({
        rubric: original.rubric,
        candidateFacts: original.candidateFacts,
        skillProfiles: original.skillProfiles,
        metadata: original.metadata,
      });

      expect(replay.result).toEqual(original.result);
      expect(replay.criterionAssessments).toEqual(original.criterionAssessments);
      expect(replay.metadata.referenceDate).toBe(original.metadata.referenceDate);
      expect(replay.metadata.evaluatedAt).toBe(original.metadata.evaluatedAt);
      expect(replay.metadata.resumeSourceHash).toBe(original.metadata.resumeSourceHash);
      expect(replay.metadata.candidateFactsHash).toBe(original.metadata.candidateFactsHash);
      expect(replay.metadata.rubricHash).toBe(original.metadata.rubricHash);
    });

    it("keeps scores and hashes stable when only evaluatedAt differs", () => {
      const first = evaluateCandidateWithRules(snapshotInput());
      const second = evaluateCandidateWithRules(
        snapshotInput({ evaluatedAt: "2024-06-02T12:00:00.000Z" }),
      );
      expect(second.result.score).toBe(first.result.score);
      expect(second.metadata.resumeSourceHash).toBe(first.metadata.resumeSourceHash);
      expect(second.metadata.candidateFactsHash).toBe(first.metadata.candidateFactsHash);
      expect(second.metadata.rubricHash).toBe(first.metadata.rubricHash);
      expect(second.metadata.evaluatedAt).not.toBe(first.metadata.evaluatedAt);
    });

    it("changes fingerprints when the resume or rubric changes (historical immutability signal)", () => {
      const base = evaluateCandidateWithRules(snapshotInput());
      const changedResume = evaluateCandidateWithRules(
        snapshotInput({ candidate: { resumeText: `${snapshotResume}\n• Also used Go.`, answers: [] } }),
      );
      expect(changedResume.metadata.resumeSourceHash).not.toBe(base.metadata.resumeSourceHash);
      expect(changedResume.metadata.candidateFactsHash).not.toBe(base.metadata.candidateFactsHash);

      const changedRubric = evaluateCandidateWithRules(
        snapshotInput({
          job: { ...snapshotJob, keywords: ["Python", "Docker"] },
        }),
      );
      expect(changedRubric.metadata.rubricHash).not.toBe(base.metadata.rubricHash);
      // Unchanged side stays stable.
      expect(changedRubric.metadata.resumeSourceHash).toBe(base.metadata.resumeSourceHash);
    });

    it("does not use candidate identity fields as matching signals", () => {
      const base = evaluateCandidateWithRules(snapshotInput());
      const identityChanged = evaluateCandidateWithRules(
        snapshotInput({
          candidate: {
            ...snapshotInput().candidate,
            fullName: "A completely different name",
            email: "different@example.test",
          },
        }),
      );
      expect(identityChanged.result).toEqual(base.result);
      expect(identityChanged.metadata.resumeSourceHash).toBe(base.metadata.resumeSourceHash);
      expect(identityChanged.metadata.candidateFactsHash).toBe(base.metadata.candidateFactsHash);
    });

    it("records a caller-provided evaluationId verbatim and omits it otherwise", () => {
      const withId = evaluateCandidateWithRules(snapshotInput({ evaluationId: "eval-123" }));
      expect(withId.metadata.evaluationId).toBe("eval-123");
      const withoutId = evaluateCandidateWithRules(snapshotInput());
      expect(withoutId.metadata.evaluationId).toBeUndefined();
    });
  });

  describe("Phase 2 — rescore without reparse (exit gate)", () => {
    const rescoreJob = {
      title: "Backend Developer",
      description: "Python role",
      requirements: "Requires Python experience",
      experienceLevel: "Mid",
      education: null,
      keywords: ["Python"],
    };

    const rescoreResume = `Sam Dev
sam@example.com

EXPERIENCE
Backend Developer — Acme Corp | 2020 - 2023
• Built APIs using Python.
`;

    it("reuses persisted snapshots: rubric change re-runs match/score only", () => {
      const first = evaluateCandidateWithRules({
        job: rescoreJob,
        candidate: { resumeText: rescoreResume, answers: [] },
        referenceDate: "2024-06-01",
        evaluatedAt: "2024-06-01T12:00:00.000Z",
      });

      // Rescore with NO resume text, reusing snapshots, against a changed rubric.
      const second = evaluateCandidateWithRules({
        job: { ...rescoreJob, keywords: ["Python", "Kubernetes"] },
        candidate: { resumeText: null, answers: [] },
        referenceDate: "2024-06-01",
        evaluatedAt: "2024-06-01T12:00:00.000Z",
        candidateFacts: first.candidateFacts,
        skillProfiles: first.skillProfiles,
      });

      // Same resume inputs -> identical fact identity, no reparse involved.
      expect(second.metadata.candidateFactsHash).toBe(first.metadata.candidateFactsHash);
      expect(second.metadata.rubricHash).not.toBe(first.metadata.rubricHash);
      // New rubric criterion appears and moves the outcome.
      expect(second.criterionResults.some((c) => c.label === "Kubernetes")).toBe(true);
      expect(first.criterionResults.some((c) => c.label === "Kubernetes")).toBe(false);
      expect(second.criterionResults.find((c) => c.label === "Kubernetes")?.extendedStatus).toBe(
        "not_demonstrated",
      );
    });

    it("never mutates caller-provided snapshots (copy-on-write override)", () => {
      const base = evaluateCandidateWithRules({
        job: rescoreJob,
        candidate: { resumeText: rescoreResume, answers: [] },
        referenceDate: "2024-06-01",
      });
      const factsBefore = JSON.stringify(base.candidateFacts);
      evaluateCandidateWithRules({
        job: rescoreJob,
        candidate: { resumeText: null, answers: [], experienceYears: 99 },
        referenceDate: "2024-06-01",
        candidateFacts: base.candidateFacts,
        skillProfiles: base.skillProfiles,
      });
      expect(JSON.stringify(base.candidateFacts)).toBe(factsBefore);
    });

    it("rejects incompatible snapshot schema versions loudly", () => {
      const base = evaluateCandidateWithRules({
        job: rescoreJob,
        candidate: { resumeText: rescoreResume, answers: [] },
        referenceDate: "2024-06-01",
      });
      const staleFacts = { ...base.candidateFacts, schemaVersion: 1 } as never;
      expect(() =>
        evaluateCandidateWithRules({
          job: rescoreJob,
          candidate: { resumeText: null, answers: [] },
          referenceDate: "2024-06-01",
          candidateFacts: staleFacts,
        }),
      ).toThrow(/Incompatible candidateFacts snapshot/);
    });

    it("auto-built criteria never carry knockout or exclusion (governance)", () => {
      const criteria = buildStructuredCriteria({
        job: {
          title: "Backend Engineer",
          description: "Go and Docker are required. Must have Kubernetes.",
          requirements: "Go is required. Docker is required. Kubernetes mandatory.",
          experienceLevel: "Senior (5+ years)",
          education: "Bachelor's",
          keywords: ["Go", "Docker", "Kubernetes"],
        },
        candidate: { resumeText: null, answers: [] },
      });
      expect(criteria.length).toBeGreaterThan(0);
      for (const c of criteria) {
        expect(c.isKnockout).toBe(false);
        expect(c.excluded ?? false).toBe(false);
      }
    });
  });

  describe("Phase 3 — occupation / title normalization (§11, exit gates)", () => {
    const backendResume = `Bea Dev
bea@example.com

EXPERIENCE
Backend Engineer — Cloud Corp (2021 - 2024)
• Built billing APIs in Go.
`;

    it("emits a preferred, non-gating domain_title; exact occupation match -> met", () => {
      const input = {
        job: {
          title: "Backend Developer",
          description: "APIs",
          requirements: null,
          experienceLevel: null,
          education: null,
          keywords: ["Go"],
        },
        candidate: { resumeText: backendResume, answers: [] as Array<{ question: string; answer: string }> },
        referenceDate: "2024-06-01",
      };
      const structured = buildStructuredCriteria(input);
      const titleCrit = structured.find((c) => c.id === "crit:domain-title");
      expect(titleCrit?.type).toBe("domain_title");
      expect(titleCrit?.importance).toBe("preferred");
      expect(titleCrit?.isKnockout).toBe(false);

      const res = evaluateCandidateWithRules(input);
      const title = res.criterionResults.find((c) => c.key === "crit:domain-title");
      expect(title).toBeDefined();
      expect(title?.extendedStatus).toBe("met");
      expect(title?.score).toBe(100);
      expect(title?.isKnockout).toBe(false);
      expect(title?.evidence).toContain("occupation matches target");
    });

    it("related-but-not-equivalent titles stay partial, never met (§8.4)", () => {
      const res = evaluateCandidateWithRules({
        job: {
          title: "Project Manager",
          description: "Delivery",
          requirements: null,
          experienceLevel: null,
          education: null,
          keywords: ["Planning"],
        },
        candidate: {
          resumeText: `Pam Lead
pam@example.com

EXPERIENCE
Product Manager — Acme Corp (2021 - 2024)
• Owned roadmap planning and delivery.
`,
          answers: [],
        },
        referenceDate: "2024-06-01",
      });
      const title = res.criterionResults.find((c) => c.key === "crit:domain-title");
      expect(title?.extendedStatus).toBe("partially_met");
      expect(title?.score).toBe(45);
      expect(title?.evidence).toContain("related but not equivalent");
    });

    it("ambiguous titles emit no criterion and leave scores untouched", () => {
      const jobBase = {
        description: "APIs",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: ["Go"],
      };
      const withAmbiguousTitle = evaluateCandidateWithRules({
        job: { ...jobBase, title: "Ninja Guru of Synergy" },
        candidate: { resumeText: backendResume, answers: [] },
        referenceDate: "2024-06-01",
        evaluatedAt: "2024-06-01T12:00:00.000Z",
      });
      const withEmptyTitle = evaluateCandidateWithRules({
        job: { ...jobBase, title: "" },
        candidate: { resumeText: backendResume, answers: [] },
        referenceDate: "2024-06-01",
        evaluatedAt: "2024-06-01T12:00:00.000Z",
      });
      expect(withAmbiguousTitle.criterionResults.some((c) => c.key === "crit:domain-title")).toBe(false);
      expect(withAmbiguousTitle.result.score).toBe(withEmptyTitle.result.score);
      expect(withAmbiguousTitle.coverageAdjustedScore).toBe(withEmptyTitle.coverageAdjustedScore);
    });

    it("title mismatch never blocks Strong Yes: preferred is non-gating (§15.6)", () => {
      const res = evaluateCandidateWithRules({
        job: {
          title: "Product Manager",
          description: "Backend APIs",
          requirements: "Go required. Docker required.",
          experienceLevel: "Mid (3+ years)",
          education: null,
          keywords: ["Go", "Docker"],
        },
        candidate: {
          resumeText: `Bea Dev
bea@example.com

EXPERIENCE
Backend Engineer — Cloud Corp (2021 - Present)
• Built billing APIs in Go and shipped containers with Docker.
`,
          answers: [],
        },
        referenceDate: "2026-09-19",
      });
      const title = res.criterionResults.find((c) => c.key === "crit:domain-title");
      expect(title?.extendedStatus).toBe("not_demonstrated");
      expect(res.result.recommendation).toBe("strong_yes");
    });
  });

  describe("Phase 5 — quantified impact enriches evidence, never scoring (§13)", () => {    it("surfaces Isabella's quantified achievements while scores stay pinned", () => {
      const res = evaluateCandidateWithRules({
        job: {
          title: "Growth Marketing Manager",
          description: "Growth",
          requirements: null,
          experienceLevel: null,
          education: null,
          keywords: ["SEO"],
        },
        candidate: {
          resumeText: `Isabella Rossi
isabella@example.com

EXPERIENCE
Growth Marketing Manager — Nimbus Labs (2023–Present)
• Grew pipeline 3.2x in 18 months through SEO and referrals.
• Cut blended CAC 28% by reallocating spend.
• Managed $1M+ paid-acquisition budget.
`,
          answers: [],
        },
        referenceDate: "2026-09-19",
      });
      expect(res.impactHighlights.length).toBeGreaterThanOrEqual(3);
      expect(res.impactHighlights[0]!.metrics.map((m) => m.type)).toContain("multiplier");
      // Phase 5 exit gate: no arbitrary score bonus from quantified bullets.
      expect(res.demonstratedScore).toBe(100);
      expect(res.coverageAdjustedScore).toBe(100);
      expect(res.result.score).toBe(100);
    });

    it("metric-free resumes yield empty highlights without affecting evaluation", () => {
      const res = evaluateCandidateWithRules({
        job: {
          title: "Backend Engineer",
          description: "APIs",
          requirements: null,
          experienceLevel: null,
          education: null,
          keywords: ["Python"],
        },
        candidate: {
          resumeText: `Sam Dev
sam@example.com

EXPERIENCE
Backend Developer — Acme Corp (2020 - 2023)
• Built APIs using Python.
`,
          answers: [],
        },
        referenceDate: "2024-06-01",
      });
      expect(res.impactHighlights).toEqual([]);
      expect(res.criterionResults.find((c) => c.label === "Python")?.extendedStatus).toBe("met");
    });
  });

  describe("Phase 7 — recency/depth signals are collected but inert (§15.4)", () => {
    const recencyJob = {
      title: "Backend Engineer",
      description: "APIs",
      requirements: null,
      experienceLevel: null,
      education: null,
      keywords: ["Python"],
    };

    function recencyResume(roleLine: string) {
      return `Sam Dev
sam@example.com

EXPERIENCE
${roleLine}
• Built APIs using Python.
`;
    }

    it("stale vs current evidence yields identical primary scores (no global decay)", () => {
      const current = evaluateCandidateWithRules({
        job: recencyJob,
        candidate: { resumeText: recencyResume("Backend Developer — Acme Corp (2023-Present)"), answers: [] },
        referenceDate: "2026-09-19",
      });
      const stale = evaluateCandidateWithRules({
        job: recencyJob,
        candidate: { resumeText: recencyResume("Backend Developer — Acme Corp (2015-2017)"), answers: [] },
        referenceDate: "2026-09-19",
      });
      // Recency is recorded in the profiles...
      const currentProfile = current.skillProfiles.profiles.find((p) => p.canonicalName === "Python")!;
      const staleProfile = stale.skillProfiles.profiles.find((p) => p.canonicalName === "Python")!;
      expect(currentProfile.currentlyUsed).toBe(true);
      expect(staleProfile.currentlyUsed).toBe(false);
      expect(staleProfile.lastUsedMonthsAgo).toBeGreaterThan(0);
      // ...but must not move the score without benchmark evidence (§15.4).
      expect(stale.result.score).toBe(current.result.score);
      expect(stale.coverageAdjustedScore).toBe(current.coverageAdjustedScore);
      expect(stale.result.recommendation).toBe(current.result.recommendation);
    });
  });
});
