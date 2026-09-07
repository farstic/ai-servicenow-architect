// ARC-02-S03 — the rewritten skill descriptions and the trigger material moved out of them.
//
// THROWAWAY. This file is deleted with the rest of scripts/maint/ at the end of the ARC (S01), and it
// is NOT a second source of truth in the meantime: SKILL.md frontmatter is authoritative for every
// description, and a copy that outlived the rewrite would drift from it silently. It exists so the 28
// rewrites could be authored and applied in one reviewable place. Git history keeps it.
//
// Recipe (story ARC-02-S03): sentence 1 is the trigger sentence — "Use when …" for builders,
// reviewers and consults, "Mandatory gateway for …" for the five Domain Experts. Sentence 2 says what
// the skill produces. An optional third sentence carries the one boundary that prevents mis-routing.
// Hard limits: ≤ 500 characters, no ServiceNowDocs paths, no §1.1 mechanics, no keyword lists — those
// move to the `## Triggers` body section, which is why nothing here is lost.
export const SKILLS = {
  'app-engine-specialist': {
    description: 'Use when a custom scoped ServiceNow application is in scope — scope strategy and application structure, App Engine Studio, App Engine Management Center, decision tables, document templates, and delegated development or maker governance. Produces scoped-app design specifications and structure, not implementation code and not the UI surface design.',
    keywords: 'scoped app, App Engine, App Engine Studio, App Engine Management Center, decision table, document template, low-code, custom application, maker, delegated development',
    fires: 'On demand, in the main thread, whenever a custom scoped application is in scope.',
    notThis: 'Developer writes the code inside the app. UI/UX Specialist designs its screens. A custom scoped application is exactly what §1.1 gates — this skill proceeds only on explicit Chief Architect approval, and stays baseline-first inside the app.',
  },
  'atf-author': {
    description: 'Use when writing ServiceNow Automated Test Framework coverage — tests, test suites and steps across the baseline step categories, reusable tests and templates, assertions, test-data setup and rollback, and runner placement. Produces ATF test and suite designs with mandatory deployment notes. Two modes: inline single-component coverage in the main thread, and full-app batch suite generation as a sub-agent.',
    keywords: 'ATF, Automated Test Framework, test case, test suite, test coverage, sys_atf_test, sys_atf_test_suite, test step, assertion, test data',
    fires: 'Post-build per taxonomy §6.2 when a release-path artefact returns, and on demand.',
    notThis: 'Code Reviewer reviews the code under test. ATF tests are baseline configuration; a custom step type is a flagged extension, and test data is created and rolled back, never stored in a custom table.',
  },
  'cmdb-csdm-specialist': {
    description: 'Mandatory gateway for ServiceNow CMDB and Common Service Data Model work — CI class modelling, CSDM domains and service types, CSDM-to-CMDB table mapping, implementation-stage alignment, Identification and Reconciliation Engine rules, CMDB Health, install base, and the service and CI layer shared by ITSM and CSM. Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4. Owns the model; ITOM/Discovery owns CI population.',
    keywords: 'CMDB, CI class, CSDM, service type, business service, technology service, service instance, IRE, identification rule, reconciliation, CMDB Health, install base, data model, class hierarchy',
    fires: 'Phase 1 Step 5 (before any builder dispatch) and Phase 2 Step 4 (review mode).',
    notThis: 'ITOM/Discovery Specialist owns CI population — Discovery, MID Server, patterns and Service Mapping execution. When a task genuinely spans population and model, both gateways fire and the envelopes reconcile. Australia ships CSDM v5, with renamed service tables.',
  },
  'code-reviewer': {
    description: 'Use when reviewing existing ServiceNow code — Script Includes, Business Rules, Client Scripts, UI Scripts, Scheduled Jobs, custom Flow Action scripts and ATF step scripts — against the four checklists: style, performance, security and best practice. Produces a structured review report with severity ratings (block / fix-before-prod / consider) and explicit recommendations.',
    keywords: 'review this code, code review, lint, anti-pattern, refactor, code quality, security review of a script',
    fires: 'Automatically post-build per taxonomy §6.2 after any Developer or code-emitting builder returns, and on manual invocation.',
    notThis: 'Security & GRC Specialist owns architecture-level security; this skill owns code-level review of one artefact. Performance & Scale Specialist owns design-level scale.',
  },
  'csm-specialist': {
    description: 'Mandatory gateway for ServiceNow Customer Service Management work — case lifecycle, the account, contact and consumer model, contract and entitlement evaluation, CSM Configurable Workspace, Customer Service Portal, special handling notes and customer projects. Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4.',
    keywords: 'case, account, contact, consumer, entitlement, contract, service contract, CSM Workspace, Customer Service Portal, special handling note, customer project, install base (CSM view)',
    fires: 'Phase 1 Step 5 (before any builder dispatch) and Phase 2 Step 4 (review mode).',
    notThis: 'ITSM Specialist owns incident, problem and change. CMDB & CSDM Specialist owns the shared service and CI layer. Refuses to ratify custom tables, custom scoped apps or custom state extensions without explicit Chief Architect approval.',
  },
  developer: {
    description: 'Use when implementing ServiceNow code — Script Includes, Business Rules, Client Scripts, UI Scripts, Scheduled Jobs, Background Scripts, Fix Scripts and custom Flow Action scripts. Produces production-quality Glide-API code with security checks, error handling and scoped-app conventions, and always proposes a Code Reviewer handoff post-build.',
    keywords: 'implement, write the code, code the, build the script, Script Include, Business Rule, Client Script, UI Script, Scheduled Job, Fix Script, GlideRecord, GlideAggregate',
    fires: 'On dispatch from the Chief Architect after a design spec is approved.',
    notThis: 'Technical Designer produces the spec this skill implements. Flow Designer Specialist owns the orchestration that calls the code. Integration Specialist owns the plumbing.',
  },
  'devops-release-manager': {
    description: 'Use when planning how a ServiceNow change reaches production — update-set strategy (batching, dependencies, collision preview, ordering, backout), App Repository and App Engine Management Center, DevOps Change Velocity, CI/CD and source control, environment and instance strategy including clones and data preservers, and release governance. Produces a deployment and release plan.',
    keywords: 'update set, App Repository, deploy, deployment, release, DevOps, CI/CD, pipeline, instance clone, promote, backout, rollback, source control, change velocity, environment strategy',
    fires: 'As a §3.1 routing-time consult on new scoped apps, update-set strategy or deployment pipeline design, and on demand.',
    notThis: 'Integration Specialist owns the plumbing to a CI tool. This skill plans the deployment, not the artefacts being deployed. Update sets, App Repository, Change Velocity and clones are baseline release mechanics; a custom deployment framework needs approval.',
  },
  'diagramming-specialist': {
    description: 'Use when a ServiceNow design needs a figure — solution and context (C4), data-model and ERD, sequence, process and swimlane, state and lifecycle, deployment and MID topology, CSDM and CMDB relationship maps, and project visuals such as roadmap, Gantt and RACI. Produces diagrams in Mermaid by default, draw.io XML or PlantUML on request. Depicts architecture faithfully and flags inconsistencies back to the source author; it never invents or decides architecture.',
    keywords: 'diagram, draw, Mermaid, draw.io, ERD, sequence diagram, architecture diagram, C4, swimlane, state diagram, topology, roadmap, Gantt, RACI, user journey',
    fires: 'Post-build per taxonomy §6.2 when an HLD/LLD or Technical Design returns, and on demand. Two modes — inline single figure in the main thread, batch diagram pack as a sub-agent.',
    notThis: 'HLD/LLD Writer and Technical Designer decide the architecture this skill depicts. A diagram is an artefact, not a ServiceNow object — but it must never render an unapproved custom table, scope or state as blessed; flag it PENDING instead.',
  },
  'discovery-specialist': {
    description: 'Use when requirements must be elicited or structured before any design — from a blueprint, workshop, interview or transcript. Maps current state against target state, produces a gap analysis, identifies personas, processes, volumes and sensitivity, and surfaces open questions. Produces the structured Discovery Output that the Domain Expert gateways and the Story Writer consume as their input contract.',
    keywords: 'blueprint, requirements, workshop, transcript, extract from this, current state, target state, gap analysis, as-is, to-be, stakeholders, scope, personas, volumes',
    fires: 'Upstream of the whole routing protocol, in the main thread, on demand.',
    notThis: 'This is divergent elicitation work — it does not design, build, or rule on §1.1. It surfaces custom-object implications for the gateway to adjudicate. Story Writer converts its output into Gherkin.',
  },
  'estimation-specialist': {
    description: 'Use when a ServiceNow scope, story set or design needs a defensible effort estimate — method selection, the platform complexity rubric, confidence ranges, contingency, and grounding against team velocity and capacity. Produces a range with method, assumptions, complexity breakdown and the baseline-versus-custom effort delta, never a single number, and records into baseline SPM demand, story-point and cost/effort plans.',
    keywords: 'estimate, estimation, sizing, LOE, level of effort, story points, T-shirt size, how long, how big, ballpark, rough order of magnitude, ROM, contingency, velocity, capacity',
    fires: 'As a planning and scoping consult before a delivery commitment, and on demand. It does not auto-fire on every build.',
    notThis: 'SPM Specialist owns the demand, agile and PPM process and tables. Discovery Specialist elicits the scope. This skill owns the sizing methodology and the number. Estimation is advisory and creates no objects; a §1.1 custom path is sized as the higher-effort, higher-risk option it is.',
  },
  'flow-designer-specialist': {
    description: 'Use when designing or troubleshooting Flow Designer flows, subflows, custom Actions in Action Designer, decision tables and IntegrationHub spoke consumption patterns. Produces production-quality flow design specifications with explicit triggers, error handling and transaction strategy, and clear handoffs to Developer for Action server scripts and to Integration Specialist for the plumbing the flow orchestrates.',
    keywords: 'Flow Designer, flow, subflow, custom action, Action Designer, decision table, trigger when, fires on, runs when X happens, orchestration, approval step',
    fires: 'On dispatch from the Chief Architect after routing approval.',
    notThis: 'Integration Specialist owns the integration a flow calls. Developer owns the JavaScript inside a custom Action.',
  },
  'hld-lld-writer': {
    description: 'Use when authoring a High-Level Design, Low-Level Design or Process Design Document for a ServiceNow programme. Produces enterprise-grade Word-ready markdown structured for architectural review boards and sign-off panels, consuming Technical Designer component specs and synthesising them into programme-level documents.',
    keywords: 'write the HLD, draft an LLD, design document, solution design doc, process design document, architecture document, PDD, review board, sign-off pack',
    fires: 'On dispatch from the Chief Architect, typically downstream of Technical Designer.',
    notThis: 'Operational Documentation writes for operators and end users; this skill writes for architects. Technical Designer produces the component specs it consumes. Diagramming Specialist renders its figures.',
  },
  'hrsd-specialist': {
    description: 'Mandatory gateway for ServiceNow HR Service Delivery work — HR case lifecycle, Lifecycle Events, HR Profile, Employee Center and Employee Center Pro, scoped HR data policies, HR document templates and HR Knowledge. Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4.',
    keywords: 'HR case, Lifecycle Event, Employee Center, Employee Center Pro, HR Profile, HR document, HR service, onboarding, offboarding, HR Knowledge, sn_hr_core_case, sn_hr_le_case',
    fires: 'Phase 1 Step 5 (before any builder dispatch) and Phase 2 Step 4 (review mode).',
    notThis: 'Australia publishes HRSD under "Employee Service Management" and "Core Business Suite"; the underlying tables are unchanged. Enforces the §1.1 halt protocol when custom objects appear necessary.',
  },
  'integration-specialist': {
    description: 'Use when designing or troubleshooting integration architecture between ServiceNow and an external system — outbound REST and SOAP, inbound Scripted REST APIs, IntegrationHub spokes, MID Server placement, authentication including OAuth2, JWT, mutual TLS and Connection & Credential Aliases, retry and dead-letter patterns, and payload security. Produces integration architecture specifications with explicit auth, topology, error handling and observability.',
    keywords: 'REST, SOAP, API, webhook, MID Server, ECC queue, IntegrationHub, spoke, OAuth2, JWT, mutual TLS, Scripted REST API, credential alias, retry, dead-letter, outbound, inbound',
    fires: 'On dispatch from the Chief Architect after routing approval.',
    notThis: 'Flow Designer Specialist owns the orchestration that uses the integration. Developer owns the JavaScript inside a Scripted REST API or spoke Action. Integration Specialist owns the plumbing even when the user asks for "a flow that calls X".',
  },
  'itom-discovery-specialist': {
    description: 'Mandatory gateway for ServiceNow IT Operations Management work — MID Server, Discovery, CMDB Discovery, Service Mapping, Event Management, Identification and Reconciliation Engine rules, CSDM phase alignment, Service Graph Connectors and Cloud Discovery. Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4. Owns CI population; CMDB & CSDM owns the model.',
    keywords: 'MID Server, Discovery, CMDB Discovery, Service Mapping, Event Management, alert correlation, IRE, Service Graph Connector, Cloud Discovery, pattern, probe, sensor, credential-less discovery',
    fires: 'Phase 1 Step 5 (before any builder dispatch) and Phase 2 Step 4 (review mode).',
    notThis: 'CMDB & CSDM Specialist owns the model — class and CSDM placement, IRE design. For a pure data-model task this gateway is at most a consult flag. Refuses to ratify custom CMDB tables, custom dedup logic or custom service-map tables without approval.',
  },
  'itsm-specialist': {
    description: 'Mandatory gateway for ServiceNow IT Service Management work — incident, problem, change, request and RITM, major incident management, on-call scheduling, SLAs, assignment group rules and Service Operations Workspace. Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4.',
    keywords: 'incident, problem, change, change request, RITM, request, MIM, major incident, on-call, SLA, OLA, assignment group, Service Operations Workspace, CAB, resolution code',
    fires: 'Phase 1 Step 5 (before any builder dispatch) and Phase 2 Step 4 (review mode).',
    notThis: 'CSM Specialist owns cases. CMDB & CSDM Specialist owns the shared service and CI layer. Refuses to ratify custom tables, custom scoped apps or custom state extensions without explicit Chief Architect approval.',
  },
  'licensing-specialist': {
    description: 'Use when a ServiceNow design has a licensing consequence — fulfiller versus requester subscription impact, product SKU and tier coverage, the App Engine footprint of custom tables and scoped apps, Now Assist Assists consumption, and third-party SaaS entitlement. Produces a licensing constraint note before builders run and a licensing review of the returned artefact. Always flags SKU and tier claims as "verify against the engagement’s subscription"; never quotes prices.',
    keywords: 'licence, license, licensing, entitlement, subscription, fulfiller, requester, SKU, Pro, Enterprise, App Engine units, application subscription unit, Assists, SAM, SaaS License Management, overage',
    fires: 'As a §3.1 routing-time consult on custom objects, a new fulfiller-granting role, a Now Assist or premium-SKU capability, or third-party SaaS consumption — and again post-build as a licensing review.',
    notThis: 'DevOps/Release Manager owns how to deploy. App Engine Specialist owns how to build the app. Estimation & Sizing owns the effort number. This skill owns what the design costs to license — advisory, creating no objects.',
  },
  'migration-specialist': {
    description: 'Use when a one-time ServiceNow data migration or cutover is in scope — data sources, import sets and staging tables, transform maps with coalesce, dedup and reference resolution, data profiling and cleansing, dependency sequencing, reconciliation, cutover planning from rehearsal through freeze, delta, load, reconcile, sign-off and hypercare, and rollback. Produces a migration design and runbook.',
    keywords: 'migrate, migration, data load, import from, transform map, import set, data source, coalesce, cutover, historical data, legacy, reconciliation, staging table, delta load',
    fires: 'On demand, in the main thread, when a one-time or historical data load is in scope.',
    notThis: 'Integration Specialist owns ongoing integration architecture. Technical Designer and the domain gateway own the target data model. Import sets, staging tables and transform maps are baseline mechanics; a permanent shadow table or custom dedup engine needs approval.',
  },
  'now-assist-genai': {
    description: 'Use when answering what ServiceNow Now Assist and the generative-AI platform layer can do — the out-of-box Now Assist skill catalogue, Now Assist Skill Kit, the Now LLM Service and Generative AI Controller for bring-your-own-LLM, AI Agents and agentic experiences, Now Assist admin enablement, and AI Control Tower governance. Reference knowledge only — the builder is now-assist-specialist.',
    keywords: 'what is Now Assist, Now Assist catalogue, Skill Kit, Now LLM Service, Generative AI Controller, BYO-LLM, AI Control Tower, Now Assist Center, AI capability question, AI governance',
    fires: 'On demand, to answer capability, tier and governance questions and to ground the builder.',
    notThis: 'Now Assist Specialist produces buildable capability designs; this skill produces none. Out-of-box and Skill-Kit skills over baseline tables are configuration; new tables, scopes or Connection Aliases behind them are custom objects requiring approval.',
  },
  'now-assist-specialist': {
    description: 'Use when designing or troubleshooting a ServiceNow Now Assist capability — AI Agents, Now Assist skills, agentic workflows, Virtual Agent topics, Now LLM Service consumption, AI Search and AI Control Tower governance. Produces capability designs at the right level with explicit confidence routing, human-in-the-loop boundaries and governance attestations, handing off to Flow Designer Specialist for invocation orchestration and Developer for backing logic.',
    keywords: 'AI Agent, Now Assist skill, agentic workflow, Virtual Agent, VA topic, AI Control Tower, Now LLM, AI Search, Skill Builder, prompt for ServiceNow, confidence threshold, human in the loop',
    fires: 'On dispatch from the Chief Architect after routing approval.',
    notThis: 'now-assist-genai is the reference-knowledge companion; this skill is the builder. Custom Skill Builder skills over baseline tables are configuration; new tables, scopes or Connection Aliases behind them are custom objects requiring approval.',
  },
  'operational-documentation': {
    description: 'Use when a delivered ServiceNow capability needs operator- and end-user-facing documentation — runbooks covering operational procedure, on-call response and rollback; Knowledge Base Articles including knowledge bases, article templates, versioning and validity, review-and-publish and KCS create-from-incident; training material and user guides. Audience is operators, support engineers and end users.',
    keywords: 'runbook, KBA, knowledge article, kb_knowledge, knowledge base, article template, KCS, training material, user guide, operational procedure, on-call response, handover pack',
    fires: 'Post-build per taxonomy §6.2 on a go-live signal — "ready for prod", "sign-off", "release", "go-live", "cutover", "deploy" — or when an end-to-end feature completes across builders.',
    notThis: 'HLD/LLD Writer writes for architects; this skill writes for operators and end users. KBAs use the baseline knowledge model; a custom documentation table is a §1.1 halt.',
  },
  'performance-scale-specialist': {
    description: 'Use when a ServiceNow design has to hold at volume — query design, large-table patterns, asynchronous and batch processing, data growth and archival, transaction quotas and semaphores, ACL and list-rendering cost at scale, and Performance Analytics at volume. Produces a scale constraint note before builders run and a scale audit of the returned artefact.',
    keywords: 'performance, scale, volume, millions of records, slow query, GlideAggregate, indexed field, async business rule, batch, chunking, pagination, archival, semaphore, transaction quota, large table',
    fires: 'As a §3.1 routing-time consult on volumes above a million records, async or batch design choices, large-table query patterns or high transaction rates — and again post-build as a scale audit.',
    notThis: 'Code Reviewer does line-level review of one artefact; this skill owns design-level scale. Indexes, async patterns and PA indicators are configuration; a custom archive, staging or summary table needs Chief Architect approval.',
  },
  'reporting-analytics-specialist': {
    description: 'Use when reporting, dashboards, KPIs or analytics are in scope — reports across the baseline visualisation types, dashboards and responsive canvas, and Performance Analytics with indicators, breakdowns, scores, snapshots, widgets, scorecards, targets and data-collection jobs. Decides report versus Performance Analytics, designs the metric model and sets visibility. Produces report and analytics design specifications, not implementation code and not the underlying data model.',
    keywords: 'report, dashboard, Performance Analytics, PA, indicator, KPI, metric, breakdown, scorecard, trend, data visualisation, chart, analytics, snapshot, target, threshold',
    fires: 'On demand, in the main thread, when reporting or analytics are in scope.',
    notThis: 'Technical Designer owns the data model being reported on. Reports, dashboards and PA indicators are baseline configuration; a custom reporting, rollup or data-mart table needs Chief Architect approval — try a PA indicator first.',
  },
  'security-grc-specialist': {
    description: 'Use when a ServiceNow design raises an architectural security or compliance question — ACL strategy and evaluation order, the role model and separation of duties, field-level security, data classification and PII handling, encryption and masking, audit and logging design, secure integration, and GRC control and regulatory mapping. Produces a security constraint note before builders run and an architectural-security review of the returned artefact.',
    keywords: 'ACL, access control, role model, separation of duties, field-level security, PII, sensitive data, GDPR, encryption, masking, audit log, SecOps, Policy and Compliance, risk, attestation, least privilege',
    fires: 'As a §3.1 routing-time consult on non-trivial ACL design, PII handling, SecOps patterns, regulatory controls or sensitive integrations — and again post-build as an architectural-security review.',
    notThis: 'Code Reviewer does code-level security on one JavaScript artefact; this skill owns architecture-level security. Designing ACLs and roles is configuration; new security tables, scoped apps or group structures where baseline suffices require approval.',
  },
  'spm-specialist': {
    description: 'Use when Strategic Portfolio Management work is in scope — demand and idea management, project and program management, portfolio planning and investment funding, resource management, the goal and OKR framework, and agile or Enterprise Agile Planning including stories, epics, sprints and program increments. Produces baseline-process guidance, data-model alignment, a §1.1 verdict, anti-patterns and routing recommendations for downstream builders.',
    keywords: 'demand, idea, project, program, portfolio, resource plan, resource management, investment funding, goal, OKR, agile, scrum, story, epic, sprint, SAFe, PPM, SPM, PMO, ITBM',
    fires: 'On demand, in the main thread, when an SPM, portfolio, project, demand, resource or agile task is in scope.',
    notThis: 'Estimation & Sizing owns the sizing methodology and the number; this skill owns the demand, agile and PPM process and tables. Baseline SPM tables are configuration; custom demand, project, portfolio or resource tables need Chief Architect approval.',
  },
  'story-writer': {
    description: 'Use when authoring ServiceNow user stories, acceptance criteria or Gherkin Feature files — including extracting requirements from a workshop transcript, converting Discovery Output into sprint-ready stories, or breaking a feature into a story map. Produces ServiceNow-aware Gherkin with explicit OPEN QUESTIONS blocks, real role and table names, observable acceptance criteria and proposed supporting stories.',
    keywords: 'user story, acceptance criteria, Gherkin, Feature file, sprint-ready story, story map, extract from this transcript, convert these requirements into stories, backlog',
    fires: 'On dispatch from the Chief Architect, typically downstream of Discovery Specialist.',
    notThis: 'Discovery Specialist elicits the requirements this skill converts. Technical Designer designs what the stories describe. ATF Author covers them with tests.',
  },
  'technical-designer': {
    description: 'Use when designing the technical implementation of a ServiceNow capability — table models, field types, ACL matrices, business rule lists, client-side logic, UI policies, flow outlines, scoped-app structure and persona or role models. Produces design specifications — the what and the why — not implementation code, and hands off to Developer, Flow Designer Specialist and Integration Specialist for the how.',
    keywords: 'design the table model, ACL matrix, business rules for, design the flow, structure the scoped app, field model, data model for, role model, component design, technical design',
    fires: 'On dispatch from the Chief Architect, typically downstream of Story Writer.',
    notThis: 'Developer writes the code this skill specifies. HLD/LLD Writer synthesises these component specs into programme-level documents. Raises consult flags for Performance & Scale, Security & GRC and Licensing as their triggers fire.',
  },
  'ui-ux-specialist': {
    description: 'Use when a ServiceNow user-experience surface needs designing — configurable Workspaces on the Next Experience and UI Builder framework, Service Portal pages, widgets, themes and branding, or classic UI form layout, related lists, list views, UI policies and UI actions. Produces UI/UX design specifications — the what and why of the experience — not implementation code and not the table or ACL model.',
    keywords: 'workspace, Configurable Workspace, Agent Workspace, UI Builder, UX page, Next Experience, Service Portal, widget, theme, branding, form layout, list view, UI policy, UI action, declarative action, accessibility, WCAG',
    fires: 'On demand, in the main thread, when a UI surface is in scope.',
    notThis: 'Developer implements the widget or component. Technical Designer owns the table and ACL model behind the screen. Configuring baseline workspaces, portals and forms is configuration; a new UX app scope or a net-new portal where a baseline surface suffices needs approval.',
  },
};
