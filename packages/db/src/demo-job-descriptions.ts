/**
 * Job description HTML for the demo workspace (Syntrix Inc. is fictional).
 * The career page renders it through the rich-HTML sanitizer, so only plain
 * structural tags are used: h3, p, ul, ol, li, strong. Salary, location and
 * employment type live in their own job fields and are shown alongside.
 */

type JobCopy = {
  intro: string[];
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  workModel: string;
  process: string[];
};

const COMMON_BENEFITS = [
  "Competitive salary reviewed every year, plus equity in Syntrix",
  "Private health, dental and vision cover for you and your dependants",
  "25 days of paid holiday plus local public holidays, and a company-wide winter break",
  "16 weeks of fully paid parental leave for every parent",
  "An annual learning budget of 1,500 USD for courses, books and conferences",
  "A home-office stipend and the hardware you choose",
  "Two paid days a year to contribute to an open-source project of your choice",
];

function list(tag: "ul" | "ol", items: string[]): string {
  return `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
}

function render(copy: JobCopy, benefits: string[] = COMMON_BENEFITS): string {
  return [
    ...copy.intro.map((p) => `<p>${p}</p>`),
    "<h3>What you will do</h3>",
    list("ul", copy.responsibilities),
    "<h3>What we are looking for</h3>",
    list("ul", copy.requirements),
    "<h3>Nice to have</h3>",
    list("ul", copy.niceToHave),
    "<h3>What we offer</h3>",
    list("ul", benefits),
    "<h3>Location and work model</h3>",
    `<p>${copy.workModel}</p>`,
    "<h3>Our hiring process</h3>",
    list("ol", copy.process),
    "<p>Syntrix is an equal opportunity employer. We welcome applicants of every background and make reasonable adjustments at any stage of the process; just tell your recruiter what you need.</p>",
  ].join("");
}

const PROCESS_ENGINEERING = [
  "<strong>Recruiter call</strong> (30 minutes): your background, what you are looking for, and an overview of the role and compensation.",
  "<strong>Hiring manager conversation</strong> (45 minutes): the problems the team is working on and how you approach your work.",
  "<strong>Technical interview</strong> (90 minutes): a pairing session on a realistic problem in our stack. No trick questions and no take-home assignment.",
  "<strong>Team interviews</strong> (2 × 45 minutes): system design and collaboration, with future teammates and a cross-functional partner.",
  "<strong>References and offer</strong>: we aim to make a decision within five working days of your final interview.",
];

const PROCESS_GENERAL = [
  "<strong>Recruiter call</strong> (30 minutes): your experience, your goals and the essentials of the role.",
  "<strong>Hiring manager interview</strong> (45 minutes): a deeper look at your past work and how you would approach the role.",
  "<strong>Practical exercise</strong> (60 minutes, live): a short, realistic scenario discussed together. We share the brief in advance.",
  "<strong>Meet the team</strong> (45 minutes): a conversation with two future colleagues, and time for your questions.",
  "<strong>References and offer</strong>: most candidates hear back within a week of the final stage.",
];

export const DEMO_JOB_DESCRIPTIONS = {
  seniorFrontend: render({
    intro: [
      "Syntrix builds open-source infrastructure software that thousands of teams use to host, monitor and scale their applications. Our customer dashboard is where those teams spend their day: deploying services, reading metrics and managing billing.",
      "We are looking for a Senior Frontend Engineer to join the Dashboard team, six engineers and a product designer who own the dashboard end to end. You will set the technical direction for our React codebase and ship interfaces that stay fast and clear with hundreds of services on screen.",
    ],
    responsibilities: [
      "Design, build and ship major dashboard features with product and design, from early prototypes to production",
      "Own the performance of the dashboard: measure it, set budgets and keep interactions under 100 ms",
      "Evolve our shared component library and design system together with the design team",
      "Raise the quality bar through code review, testing practices and clear technical writing",
      "Mentor engineers on the team and help shape how we plan and estimate work",
    ],
    requirements: [
      "5+ years building production web applications, with deep experience in React and TypeScript",
      "A strong grasp of browser fundamentals: rendering, networking, accessibility and performance profiling",
      "Experience designing component APIs that other engineers enjoy using",
      "Comfort working across the stack when needed, for example with GraphQL schemas or Node.js services",
      "Clear written communication in English; much of our collaboration is asynchronous",
    ],
    niceToHave: [
      "Experience with Next.js, server components and Tailwind CSS",
      "Data visualisation work with large time-series datasets",
      "Contributions to open-source projects",
    ],
    workModel:
      "Fully remote within the Americas (UTC−8 to UTC−3). The team overlaps for at least four hours a day and meets in person twice a year, with travel covered by Syntrix.",
    process: PROCESS_ENGINEERING,
  }),

  backendGo: render({
    intro: [
      "The Platform team builds the APIs and control plane behind every Syntrix product: provisioning, routing, quotas and the event pipeline that feeds usage billing. The system handles around 40,000 requests per second at peak.",
      "As a Backend Engineer you will design and operate Go services that other teams depend on, with a real say in how the architecture evolves over the next two years.",
    ],
    responsibilities: [
      "Build and maintain Go services exposed over gRPC and REST, with clear contracts and versioning",
      "Design PostgreSQL schemas and migrations that stay safe under production load",
      "Improve reliability through better observability, load testing and incident follow-ups",
      "Take part in a fair on-call rotation (one week in six, compensated) backed by documented runbooks",
      "Review designs and code from teammates and help onboard new engineers",
    ],
    requirements: [
      "3+ years of professional backend development, at least two of them in Go",
      "Solid experience with relational databases, ideally PostgreSQL, including query tuning",
      "Understanding of distributed-systems concepts such as idempotency, retries, consistency and backpressure",
      "Experience running services on Kubernetes or a comparable orchestrator",
      "Professional working proficiency in English; German is not required",
    ],
    niceToHave: [
      "Experience with AWS networking, IAM and managed databases",
      "Familiarity with event streaming systems such as Kafka or NATS",
      "Interest in open-source maintenance and community work",
    ],
    workModel:
      "Hybrid from our Berlin office: two anchor days a week in the office, the rest from wherever you work best. We support relocation to Berlin, including visa sponsorship.",
    process: PROCESS_ENGINEERING,
  }),

  productDesigner: render({
    intro: [
      "Design at Syntrix means making complex infrastructure understandable. Our users are engineers, and they notice every inconsistency, every slow screen and every unclear error message.",
      "We are hiring a Product Designer to join a design team of four, embedded with the Dashboard and Onboarding squads. You will own flows from discovery to delivery across the web app and our new mobile companion app.",
    ],
    responsibilities: [
      "Lead the design of new product areas, from user research and problem framing to high-fidelity prototypes",
      "Run regular interviews and usability sessions with customers and turn the findings into clear recommendations",
      "Contribute to and maintain the Syntrix design system in Figma, in close collaboration with frontend engineers",
      "Partner with engineering during delivery, reviewing builds and making pragmatic trade-offs",
      "Share work early and often through critiques and written design rationales",
    ],
    requirements: [
      "3+ years of product design experience on a shipped digital product",
      "A portfolio that shows your process, not only final screens",
      "Fluency in Figma, including components, variables and interactive prototyping",
      "Experience planning and running user research",
      "The ability to explain design decisions to engineers, product managers and leadership",
    ],
    niceToHave: [
      "Experience designing developer tools, data-heavy dashboards or B2B software",
      "Working knowledge of HTML and CSS",
      "Accessibility expertise, for example running WCAG 2.2 audits",
    ],
    workModel:
      "Fully remote within Europe (UTC−1 to UTC+3). The design team meets every quarter in one of our hubs, with travel and accommodation covered.",
    process: [
      "<strong>Recruiter call</strong> (30 minutes): your background and what you are looking for.",
      "<strong>Portfolio review</strong> (60 minutes): walk us through two projects you are proud of, including what you would change.",
      "<strong>Design collaboration session</strong> (90 minutes): a live exercise with a designer and an engineer. No unpaid take-home work.",
      "<strong>Meet the team</strong> (45 minutes): product, engineering and design partners.",
      "<strong>References and offer</strong>: a decision within five working days of the final stage.",
    ],
  }),

  supportSpecialist: render(
    {
      intro: [
        "Our Customer Support team is the voice of Syntrix for thousands of hosting customers, from solo developers to large engineering organisations. We answer every ticket with care and feed what we learn straight back to the product teams.",
        "As a Customer Support Specialist in our Manila hub you will help customers troubleshoot deployments, domains and billing questions, and grow your technical skills with the support of a dedicated team lead.",
      ],
      responsibilities: [
        "Answer customer questions by email and chat in Zendesk with clear, friendly and accurate replies",
        "Troubleshoot common hosting issues such as DNS, SSL certificates and failed deployments, and escalate when needed",
        "Write and update help-centre articles based on recurring questions",
        "Spot trends in customer feedback and share them with the product team",
        "Meet our service target of a first reply within two hours during your shift",
      ],
      requirements: [
        "1+ year of experience in customer support, ideally for a software or internet company",
        "Excellent written English and a calm, empathetic communication style",
        "A basic technical understanding of how websites work: domains, DNS and web hosting",
        "Organised, reliable and comfortable handling several conversations at once",
        "Availability for a rotating shift schedule, including some weekends",
      ],
      niceToHave: [
        "Experience with Zendesk or a similar help-desk tool",
        "Familiarity with the command line or basic scripting",
        "A second language, for example Spanish or Japanese",
      ],
      workModel:
        "On-site at our Manila office, five days a week on a rotating shift schedule. Night shifts carry an additional allowance.",
      process: PROCESS_GENERAL,
    },
    [
      "Competitive salary with a 13th-month payment and a night-shift allowance",
      "HMO coverage from day one for you and two dependants",
      "20 days of paid leave plus public holidays",
      "Paid certification courses and a clear path into technical support or engineering roles",
      "Free meals during shifts and a transport allowance",
    ],
  ),

  growthMarketing: render({
    intro: [
      "Syntrix has grown mainly through word of mouth in the developer community. We now want a growth engine that matches the quality of the product: honest, data-driven and respectful of our users' time.",
      "As Growth Marketing Manager you will own our funnel from first visit to activated account, working with a content marketer, a lifecycle specialist and a dedicated data analyst.",
    ],
    responsibilities: [
      "Own the growth strategy and quarterly targets for sign-ups, activation and paid conversion",
      "Plan, run and analyse experiments across paid search, SEO, content and onboarding",
      "Manage the paid acquisition budget and report clearly on return on spend",
      "Work with product and design on onboarding and lifecycle improvements",
      "Build dashboards and reporting the whole company can trust",
    ],
    requirements: [
      "5+ years in growth or performance marketing, ideally in B2B SaaS or developer tools",
      "A track record of designing experiments and acting on the results",
      "Strong analytical skills, including working knowledge of SQL",
      "Hands-on experience with paid acquisition channels and SEO",
      "Excellent written and verbal communication in English",
    ],
    niceToHave: [
      "Experience marketing open-source or developer-focused products",
      "Familiarity with product analytics and marketing automation tools",
      "Some exposure to pricing and packaging work",
    ],
    workModel:
      "Hybrid from our New York office, three days a week in the office. Occasional travel to conferences and our other hubs.",
    process: PROCESS_GENERAL,
  }),

  devops: render(
    {
      intro: [
        "We are bringing in a DevOps Engineer on a six-month contract to harden our infrastructure and CI/CD ahead of a major platform launch. You will join the Infrastructure team and work closely with Platform engineers.",
        "The contract has a clear scope and milestones, and there is a real possibility of converting to a permanent role afterwards.",
      ],
      responsibilities: [
        "Consolidate our AWS infrastructure into well-structured, reviewed Terraform modules",
        "Cut CI pipeline times for our main repositories by at least 40 percent",
        "Improve observability with consistent metrics, logs, traces and actionable alerts",
        "Document runbooks and hand knowledge over to the permanent team",
        "Review infrastructure changes and help set guardrails for safe deployments",
      ],
      requirements: [
        "3+ years in DevOps, SRE or infrastructure roles",
        "Deep hands-on experience with Terraform and AWS",
        "Experience building and optimising CI/CD pipelines, for example with GitHub Actions",
        "Strong knowledge of Docker and container-based deployments",
        "Comfort working independently and reporting progress in writing",
      ],
      niceToHave: [
        "Experience with Kubernetes and Helm",
        "Familiarity with OpenTelemetry and Prometheus-style monitoring",
        "Security and compliance experience, for example SOC 2 controls",
      ],
      workModel:
        "Fully remote worldwide, with at least three hours of overlap with Central European Time. Six-month contract at an expected 40 hours a week.",
      process: [
        "<strong>Intro call</strong> (30 minutes): scope, timeline and your availability.",
        "<strong>Technical conversation</strong> (60 minutes): your past infrastructure work and a walk-through of our current setup.",
        "<strong>Meet the team</strong> (45 minutes): the Infrastructure lead and a Platform engineer.",
        "<strong>Contract</strong>: we aim to send a contract within three working days.",
      ],
    },
    [
      "A competitive contract rate, paid monthly",
      "A clearly scoped engagement with defined milestones",
      "A possible conversion to a permanent role with full Syntrix benefits",
      "The same tooling, hardware budget and team rituals as permanent staff",
    ],
  ),

  salesDevelopment: render({
    intro: [
      "As more large engineering organisations adopt Syntrix, we are building our first sales team in Europe. Sales Development Representatives are where many of our customer relationships begin.",
      "You will join a small team in London, working closely with account executives and solutions engineers, with structured coaching and a clear path to an account executive role.",
    ],
    responsibilities: [
      "Research target accounts and identify the right people to talk to",
      "Run thoughtful outbound outreach by email, phone and social channels",
      "Qualify inbound leads and book discovery meetings for account executives",
      "Keep our CRM accurate and up to date",
      "Share market feedback with marketing and product",
    ],
    requirements: [
      "1+ year of experience in a customer-facing role, such as sales, recruitment or hospitality",
      "Curiosity about technology and a willingness to learn how developers work",
      "Resilience, a positive attitude and enjoyment of measurable goals",
      "Excellent spoken and written English",
      "The right to work in the United Kingdom",
    ],
    niceToHave: [
      "Previous outbound experience in B2B SaaS",
      "Experience with a CRM such as Salesforce or HubSpot",
      "A second European language",
    ],
    workModel:
      "On-site at our London office Monday to Thursday, with Fridays from home. Base salary plus an uncapped commission plan.",
    process: PROCESS_GENERAL,
  }),

  juniorPhp: render({
    intro: [
      "Our web platform team maintains the customer portal and billing system that thousands of Syntrix customers use every day. It is a mature Laravel application that we keep modern, tested and pleasant to work on.",
      "This junior role is designed for growth. You will ship real features from your first month, with a dedicated mentor, regular pairing and a structured twelve-month learning plan.",
    ],
    responsibilities: [
      "Build and maintain features in PHP and Laravel with guidance from senior engineers",
      "Write automated tests and help keep the test suite fast and reliable",
      "Fix bugs reported by customers and the support team",
      "Take part in code reviews, both receiving and giving feedback",
      "Contribute to documentation and internal knowledge sharing",
    ],
    requirements: [
      "1+ year of experience writing PHP, professionally or through substantial personal or open-source projects",
      "A basic understanding of relational databases and SQL",
      "Familiarity with Git and pull-request workflows",
      "Eagerness to learn and openness to feedback",
      "Good written English",
    ],
    niceToHave: [
      "Experience with Laravel",
      "Some familiarity with JavaScript or Vue",
      "Interest in web performance or security",
    ],
    workModel:
      "Fully remote within Europe. Your mentor works within two hours of your time zone, and new joiners spend their first week together at one of our hubs.",
    process: PROCESS_ENGINEERING,
  }),
} as const;
