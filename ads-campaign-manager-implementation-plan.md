# Ads Campaign Manager Implementation Plan

## Purpose

This file records the working plan for turning the current "Ad Campaign Manager - Ultimate Smart Enhanced" idea into a real OpenClaw capability without losing scope, architecture decisions, or rollout steps.

## Current Reality

The current JSON is a strong workflow blueprint, but it is not yet a runnable OpenClaw skill.

What exists today:

- A clear list of business functions and automation goals
- A first-pass environment variable model
- A rough step graph covering ingest, analysis, optimization, alerts, and Telegram interaction

What is missing today:

- A real `SKILL.md` orchestration layer
- Plugin runtime code
- Agent tools for structured execution
- Background services for polling and scheduled refresh
- Webhook handlers for Facebook
- Database schema and migrations
- Safety guardrails for any write action
- Telegram command/control design aligned with OpenClaw

## Important Fixes Needed In The Source JSON

Before implementation starts, fix these issues in the source definition:

1. `crm_data_integration.description` is missing a closing quote, so the JSON is invalid.
2. `MYSQL_PORT` should be treated as a string input at env level, then parsed into a number in runtime validation.
3. `AUTO_UPDATE_INTERVAL` should also be parsed and validated, not trusted directly.
4. `telegram_bot_handler` should not be implemented as a separate custom Telegram bot webhook if OpenClaw Telegram channel will be used.
5. Notification responsibilities are duplicated across `alert_management` and `notification_and_alert_system`.

## Product Goal

Build an OpenClaw-based ads assistant that can:

- monitor Facebook Ads account and campaign health
- ingest and normalize campaign and insight data
- analyze performance against historical and benchmark expectations
- generate optimization recommendations
- manage alerts and operator review flows
- support Telegram-based control and reporting
- optionally apply approved optimizations through controlled write actions

## Target Operating Model: "Senior Ads Assistant"

The goal is not just to build a technical workflow.

The real target is to build a digital assistant that behaves like a senior media buyer and campaign operator working under the boss's direction.

This assistant should operate like:

- a campaign planner
- a budget controller
- a performance analyst
- a competitor watcher
- a strategy assistant
- a reporting assistant
- an execution operator with safety limits

This assistant must treat the boss as final authority.

Core principle:

- the assistant can think, analyze, recommend, prepare, and execute within approved boundaries
- the assistant cannot silently make high-risk business decisions outside authority rules

## What A Real Ads Assistant Does Every Day

To replace a human assistant meaningfully, the system must cover the real daily operating loop of paid ads work.

### Daily Responsibilities

- check account health first thing in the morning
- review yesterday and today pacing
- inspect campaign-level winners and losers
- identify abnormal spend, weak CTR, weak CVR, high CPA, or weak ROAS
- summarize account status for the boss
- review comments from the boss and translate them into execution tasks
- prepare new campaigns, ad sets, and targeting proposals
- recommend budget allocation changes
- review competitors, market movements, and audience trends
- review current creative fatigue and testing opportunities
- maintain a running list of hypotheses, experiments, and lessons learned
- send operator alerts when something needs attention

### Weekly Responsibilities

- compare weekly vs prior-week performance
- identify stable winners and unstable winners
- propose scale candidates
- identify campaigns to kill, merge, duplicate, or restructure
- update audience segmentation ideas
- update creative testing matrix
- update strategy notes for the boss

### Monthly Responsibilities

- account growth review
- budget allocation review by objective and geography
- creative and audience fatigue review
- benchmark refresh
- competitor landscape refresh
- lessons learned report

## Human-Like Assistant Behavior Requirements

To feel like a real experienced assistant, the system should behave this way:

- answer with business judgment, not raw metrics only
- explain why a campaign is weak or strong
- separate fact, inference, and recommendation
- avoid overreacting to small sample sizes
- think in terms of objective, funnel stage, offer, audience, creative, and budget
- know when to escalate to the boss instead of pretending certainty
- retain historical context about what the boss prefers
- remember the business tone, target market, and risk appetite

## Assistant Modes Of Work

The assistant should support multiple operating modes.

### 1. Report Mode

Purpose:

- answer "what is happening now?"

Examples:

- current spend
- account health
- best and worst campaigns
- alerts
- pacing vs budget

### 2. Analyst Mode

Purpose:

- explain "why is this happening?"

Examples:

- why CPA rose
- why ROAS dropped
- why a test failed
- why one audience outperformed another

### 3. Planner Mode

Purpose:

- prepare the next move

Examples:

- propose campaign structure
- propose budget split
- propose targeting sets
- propose testing roadmap

### 4. Operator Mode

Purpose:

- perform approved execution

Examples:

- pause a campaign
- duplicate a winning ad set
- adjust budget within limits
- schedule a fresh test set

### 5. Research Mode

Purpose:

- learn from policy, market, and competitor data

Examples:

- Facebook policy changes
- offer trends
- ad angle trends
- competitor creative patterns

## Boss Command Model

The assistant should follow a boss-first execution model.

Boss command classes:

- direct command: "create a campaign for product X with budget Y"
- analytical request: "why did campaign A drop yesterday?"
- strategic request: "what is the best structure for retargeting this month?"
- approval request: "apply your recommendation"
- monitoring request: "watch this account and alert me if CPA exceeds threshold"

The assistant must translate boss requests into one of these action paths:

1. answer only
2. analyze and recommend
3. prepare an execution draft
4. request approval
5. execute within allowed scope

## Authority Matrix

The assistant should not have one flat permission level.

Use an authority ladder:

### Level 0: Read Only

- read metrics
- analyze
- report
- recommend

### Level 1: Low-Risk Execution

- send reports
- refresh data
- create internal notes
- generate campaign draft or launch checklist

### Level 2: Guarded Write Actions

- adjust budget within a small allowed delta
- pause or resume a single campaign with approval
- create a draft A/B test setup

### Level 3: Strategic Write Actions

- launch new campaign structures
- duplicate winning sets at scale
- reallocate larger budgets

Level 3 should always require explicit boss approval in the first production versions.

## Training Blueprint For A "Real" Ads Assistant

Do not think of training as model fine-tuning first.
Think of training as building a high-quality operating brain around the model.

### Training Layer 1: Business Context

The assistant must know:

- brand
- products
- offer structure
- target customers
- markets and regions
- average order value or lead value
- funnel objectives
- sales constraints
- risk appetite

### Training Layer 2: Ads Playbooks

Create reference materials for:

- campaign objectives
- prospecting structure
- retargeting structure
- testing framework
- budget scaling rules
- kill rules
- creative fatigue signals
- audience exclusions
- geo strategy
- daily monitoring checklist

### Training Layer 3: Boss Preferences

Store what the boss prefers:

- tone of reporting
- KPI priority
- preferred scaling style
- acceptable CPA and ROAS thresholds
- preferred countries and cities
- preferred campaign naming structure
- preferred experiment style

### Training Layer 4: Historical Memory

The assistant should remember:

- what worked before
- what failed before
- why prior decisions were made
- which audiences are unstable
- which creatives fatigued quickly
- which offers work by region

### Training Layer 5: Research Inputs

Structured inputs should include:

- Meta Ads policy materials
- internal benchmark notes
- competitor observations
- audience and market intelligence
- historical campaign learnings
- boss-written strategic notes

## Curated Learning Corpus And Source Governance

The assistant should not learn from broad internet content.

It should learn from a narrow, governed corpus with clear trust rules.

### Source Precedence Rules

- official Meta documentation defines platform mechanics, billing behavior, delivery rules, and policy boundaries
- internal account history and boss-approved playbooks define business-specific truth
- trusted named practitioners define tactical heuristics and interpretation patterns
- trend content may create hypotheses, but it must not become execution policy
- when Meta documentation conflicts with expert commentary about mechanics or policy, Meta wins
- when internal account evidence conflicts with generic best practice, internal evidence wins for this business

### Core External Sources To Whitelist

#### Meta Official Sources

- `https://www.facebook.com/business/ads/pricing`
  - use for weekly-aware pacing, daily budget behavior, and budget guardrails
- `https://www.facebook.com/business/ads/performance-marketing`
  - use for account simplification, minimizing edits during learning, and creative diversification
- `https://www.facebook.com/business/ads/ad-set-structure`
  - use to justify consolidating similar ad sets and reducing audience fragmentation
- `https://www.facebook.com/business/help/AboutConversionsAPI`
  - use for measurement quality, signal reliability, and server-side event strategy
- `https://www.facebook.com/help/messenger-app/650774041651557`
  - use for delivery-state interpretation at campaign, ad set, and ad level
- `https://www.facebook.com/help/messenger-app/289211751238030`
  - use for activity history, audit trails, and root-cause analysis
- `https://www.facebook.com/business/ads/meta-advantage-plus/audience`
  - use to teach broad audience expansion with strict business controls only where needed
- `https://www.facebook.com/business/ads/meta-advantage-plus/placements`
  - use to teach broader placements and avoid unnecessary placement restrictions
- `https://www.facebook.com/business/ads/meta-advantage-plus/budget`
  - use when choosing between ad-set budgets and campaign-level budget distribution
- `https://www.facebook.com/business/ads/ad-targeting`
  - use for broad-versus-detailed targeting decisions and audience size guidance
- `https://www.facebook.com/ads/library/api/`
  - use only for observable competitor creatives, offers, and messaging patterns
- `https://transparency.fb.com/vi-vn/policies/ad-standards/personal-attributes/`
  - use for copy-risk screening and policy guardrails
- `https://www.facebook.com/help/157306091096340`
  - use to keep targeting logic current; this source notes that detailed targeting exclusions were removed from new ad sets starting March 31, 2025

#### Trusted Practitioner Sources

- `https://www.jonloomer.com/qvt/how-the-attribution-setting-works/`
  - use to teach that attribution settings change both delivery optimization and default reporting
- `https://www.jonloomer.com/compare-attribution-settings-get-the-most-of-meta-conversion-data/`
  - use to teach comparison across attribution windows before labeling winners and losers
- `https://www.foxwelldigital.com/blog/meta-creative-testing-finding-your-path-to-consistent-winners`
  - use to teach disciplined creative testing, sufficient spend, sufficient time, and controlled winner graduation
- `https://www.foxwelldigital.com/blog/scaling-isnt-about-hacks-its-about-discipline`
  - use to teach measured scaling, pacing, and the need for a strong creative pipeline
- `https://www.foxwelldigital.com/blog/how-we-approach-meta-ads-audits-a-strategic-framework-for-better-performance`
  - use to teach context-first audits instead of KPI-only diagnosis

#### Optional Operational Watch Sources

- `https://www.foxwelldigital.com/status`
  - use only to sanity-check suspected Meta UI or platform bugs
  - do not use as a core strategy source and do not promote it to auto-action logic

### Sources To Exclude From Core Training

- generic agency roundup posts without named authors
- recycled SEO content written to rank instead of teach
- anonymous community posts and screenshots without methodology
- short-form clips without transcript, reasoning, or test context
- scraped ad spy commentary presented as fact
- AI summaries of weak or unverified sources

### Knowledge Base Ingestion Rules

- ingest only from an explicit whitelist of approved URLs or domains
- store metadata for every document: `title`, `organization`, `author`, `url`, `topic`, `sourceTier`, `usageMode`, `publishedAt`, `reviewedAt`
- tag every chunk as one of: `platform_rule`, `policy_boundary`, `tactic_heuristic`, `internal_memory`, `competitor_observation`
- never allow `tactic_heuristic` content to become an automatic write-action rule without internal validation
- every recommendation should expose its source tier and whether it is a rule, heuristic, or observation
- review Meta sources monthly, practitioner sources quarterly, and competitor observations weekly
- require human approval before adding any new external domain
- keep the canonical external whitelist in `extensions/ads-campaign-manager/references/source-registry.yaml`

## Research-Based Design Corrections Before Build

The current blueprint is promising, but the source review surfaces several important weaknesses that should be corrected before implementation.

### 1. Fragmentation Bias In Campaign Design

Current risk:

- `micro_campaign_generator` assumes many small segments or campaign splits are usually beneficial

Why it is risky:

- current Meta guidance leans toward simplification, reduced fragmentation, and fewer disruptive edits during learning

Mitigation:

- default to simpler campaign and ad-set structures
- split only when there is evidence, compliance need, offer difference, funnel difference, or geography difference

### 2. Attribution Blindness

Current risk:

- the plan compares CTR, CPA, and ROAS without tying every report to the active attribution setting

Why it is risky:

- the same campaign can look strong or weak depending on the attribution window being used

Mitigation:

- persist attribution setting with every metric snapshot
- show the active attribution window in every report
- add compare-attribution diagnostics before major decisions

### 3. Pacing Model Is Too Naive

Current risk:

- the plan treats daily budget like a hard daily ceiling

Why it is risky:

- Meta may spend above the nominal daily budget on some days and average out over the week

Mitigation:

- build weekly pacing logic, not same-day-only pacing logic
- distinguish normal delivery variance from true budget anomalies

### 4. Learning-Phase Reset Risk

Current risk:

- event-driven optimization and frequent edits can keep ad sets unstable

Why it is risky:

- repeated edits can trap spend in learning, distort reads, and make the assistant chase noise

Mitigation:

- batch edits when possible
- enforce cooldown periods between non-emergency changes
- require minimum data thresholds before editing

### 5. Targeting Logic May Already Be Outdated

Current risk:

- the blueprint assumes heavy manual slicing by age, location, and interests as the default

Why it is risky:

- current Meta guidance increasingly favors broader audiences, Advantage+ audience, and fewer rigid targeting controls
- detailed targeting exclusions were removed from new ad sets on March 31, 2025

Mitigation:

- use broad-by-default targeting
- reserve strict controls for minimum age, location, language, custom audience exclusions, and real business constraints

### 6. Placement Restriction Bias

Current risk:

- the planner can become too eager to control placements manually

Why it is risky:

- broader placements often improve delivery options and may reduce cost per result

Mitigation:

- default to broader placements unless creative incompatibility, brand risk, or measured evidence justifies restriction

### 7. Measurement Foundation Is Missing

Current risk:

- the current environment model does not include a serious pixel, dataset, or Conversions API layer

Why it is risky:

- weak event quality leads to weak optimization, poor diagnosis, and misleading ROAS or CPA decisions

Mitigation:

- treat measurement health as a prerequisite for advanced optimization
- add event-quality, deduplication, and signal-completeness checks

### 8. Test Design Is Under-Specified

Current risk:

- `auto_learn_ab_experiments` can create many variants without stop rules or meaningful decision thresholds

Why it is risky:

- noisy tests create false winners, false losers, and unnecessary account churn

Mitigation:

- isolate one major variable per test
- require minimum runtime and minimum spend
- cap concurrent tests
- define graduation and kill rules before launch

### 9. Competitor Analysis Can Overclaim

Current risk:

- competitor outputs may be interpreted as performance truth

Why it is risky:

- Ad Library shows observable ads and messaging, not actual spend efficiency, profit, or strategic intent

Mitigation:

- label competitor outputs as observable intelligence only
- separate fact from inference in every competitor report

### 10. Audit Logic Lacks Human Context

Current risk:

- the assistant can diagnose KPI swings without enough account context

Why it is risky:

- inventory constraints, site issues, promotion timing, seasonality, funnel changes, or offer shifts can make a numerically correct diagnosis operationally wrong

Mitigation:

- require context intake before major diagnoses
- include inventory, landing page status, seasonality, active promotions, and offer changes in the audit checklist

### 11. Policy And Copy Risk Is Under-Modeled

Current risk:

- AI-generated ad copy and audience ideas can drift into personal attributes or risky claims

Why it is risky:

- policy violations can cause disapproval, account friction, or trust damage

Mitigation:

- add policy preflight checks
- maintain a blocked-phrase and sensitive-claim list by vertical

### 12. Knowledge Base Pollution Risk

Current risk:

- `knowledge_base_loader` suggests broad automatic ingestion

Why it is risky:

- low-quality content can contaminate the assistant's judgment and make recommendations inconsistent

Mitigation:

- whitelist-only ingestion
- source tiering
- expiry and review dates
- no unsupervised domain expansion

### 13. Change Attribution Gap

Current risk:

- the assistant may explain performance changes without first checking recent edits, automated rules, or activity history

Why it is risky:

- false causal stories lead to bad fixes and misplaced confidence

Mitigation:

- diagnostics must check activity history before claiming a cause
- include "what changed?" as a mandatory first question in troubleshooting

### 14. Delivery-State Awareness Is Missing

Current risk:

- optimization logic can react to spend drops without checking delivery status

Why it is risky:

- a campaign may be in review, rejected, learning, or constrained for reasons unrelated to bidding or creative quality

Mitigation:

- make delivery-state checks mandatory before optimization decisions
- surface campaign, ad-set, and ad-level statuses together in every health report

## Capability Upgrade Needed To Feel Like A Real Assistant

To move from "automation project" to "real assistant", add these functional blocks.

### 1. Campaign Planning Engine

Should generate:

- objective recommendation
- campaign structure
- ad set structure
- targeting proposal
- geo and language mix
- initial daily budget
- test matrix

### 2. Budget Brain

Should manage:

- daily pacing
- budget drift
- budget reallocation suggestions
- safe scaling windows
- spend cap monitoring

### 3. Competitor Intelligence Module

Should collect and summarize:

- competitor ad angle patterns
- offer framing
- creative style trends
- landing page patterns
- region-specific messaging differences

### 4. Strategy Brain

Should transform data into:

- next 3-day actions
- next 7-day actions
- next scaling opportunities
- test backlog
- structural recommendations

### 5. Execution Discipline Layer

Should enforce:

- pre-flight checks before launch
- approval before risky actions
- post-change verification
- rollback note creation
- audit logging

## Recommended Command Surface For Telegram

The Telegram bot should behave like the assistant's control console.

Use short ASCII commands only.
Vietnamese meaning is fine, but command names should stay Telegram-safe.

Recommended command groups:

### Reporting

- `/baocao` - current account performance summary
- `/tongquan` - account health overview
- `/canhbao` - active alerts
- `/ngansach` - budget usage and pacing
- `/chienthang` - top winners today or yesterday
- `/thua` - weak campaigns needing attention

### Analysis

- `/phantich <campaign>` - explain why a campaign is performing the way it is
- `/doithu` - competitor intelligence summary
- `/thitruong` - market and audience observations
- `/phieukpi` - KPI scorecard by objective

### Planning

- `/kehoach` - current action plan for today
- `/de_xuat` - optimization and next-step recommendations
- `/taochiendich` - create a campaign proposal draft
- `/testab` - create or review A/B test proposals
- `/targeting` - target audience suggestions

### Execution Control

- `/dongbo` - refresh data and sync insights
- `/pheduyet <id>` - approve a pending action
- `/tuchoi <id>` - reject a pending action
- `/tam_dung <campaign>` - guarded pause request
- `/mo_rong <campaign>` - guarded scale request

### Boss Control

- `/viec_homnay` - today's task board for the assistant
- `/lenh "..."` - give a direct boss instruction
- `/nho "..."` - store boss preference or strategic note
- `/muctieu` - current business objective and KPI priority

## Telegram UX Design Rule

Avoid exposing too many native menu commands.

Menu strategy:

- keep 8-12 top-level native commands maximum
- route deeper actions through subcommands or natural-language boss requests
- use aliases only where they materially improve speed

Suggested top-level Telegram menu:

- `/baocao`
- `/canhbao`
- `/kehoach`
- `/de_xuat`
- `/dongbo`
- `/pheduyet`
- `/tuchoi`
- `/doithu`
- `/ngansach`
- `/lenh`

## Recommended Internal Command Mapping

Internally, plugin commands may use stable English names while exposing Telegram-friendly native names.

Example mapping:

- internal `ads_report` -> Telegram `/baocao`
- internal `ads_alerts` -> Telegram `/canhbao`
- internal `ads_plan` -> Telegram `/kehoach`
- internal `ads_recommend` -> Telegram `/de_xuat`
- internal `ads_sync` -> Telegram `/dongbo`
- internal `ads_approve` -> Telegram `/pheduyet`
- internal `ads_reject` -> Telegram `/tuchoi`

## Daily Assistant Operating Rhythm

### Morning Routine

- account health check
- budget pacing check
- yesterday summary
- overnight anomalies
- recommendation list for the boss

### Midday Routine

- pacing re-check
- watch high-spend campaigns
- detect sharp CPA or ROAS changes
- prepare intervention proposals if needed

### End-Of-Day Routine

- summarize today's wins and losses
- note experiments started or stopped
- prepare tomorrow priority list
- store lessons learned

## How The Assistant Should Talk To The Boss

Use this output structure by default:

1. current state
2. what changed
3. why it likely changed
4. what I recommend
5. what I need approval for

Tone principles:

- direct
- practical
- no fluff
- evidence-first
- action-oriented

## Rollout Strategy For "Human-Like" Assistant Behavior

### Stage 1: Shadow Assistant

- analyze and report only
- no auto actions
- compare quality against human decisions

### Stage 2: Drafting Assistant

- prepare campaign drafts
- prepare budget proposals
- prepare testing proposals
- still no auto launch

### Stage 3: Approved Operator

- execute low-risk actions after boss approval
- keep full audit trail

### Stage 4: Guarded Autonomous Assistant

- execute tightly bounded low-risk actions automatically
- escalate anything strategic or financially meaningful

## Definition Of Success For The Assistant

The assistant is successful when:

- the boss can ask for status at any moment and get a useful answer
- the assistant spots problems before the boss does
- the assistant prepares better and faster drafts than a junior human operator
- the assistant follows the boss's style and strategy consistently
- the assistant reduces manual reporting and monitoring work materially
- the assistant never makes large blind actions without permission

## Non-Goals For MVP

The first version should not:

- fully auto-scale budgets without approval
- auto-publish experimental campaigns at broad scope
- self-learn from arbitrary untrusted internet content
- act as a full BI dashboard replacement
- own every CRM and analytics integration at once

## Recommended OpenClaw Architecture

Do not implement this as a single plain skill in `skills/`.

Use this structure instead:

- `SKILL.md` for agent guidance and orchestration
- a dedicated plugin for runtime behavior
- plugin tools for structured operations
- plugin service(s) for scheduled/background work
- plugin HTTP routes for Facebook webhook ingress
- OpenClaw Telegram channel for user control

Recommended repo target:

- `extensions/ads-campaign-manager/`

Recommended plugin contents:

- `openclaw.plugin.json`
- `index.ts`
- `src/tools/*.ts`
- `src/services/*.ts`
- `src/http/*.ts`
- `skills/ad-campaign-manager/SKILL.md`
- `skills/ad-campaign-manager/references/*.md`
- `*.test.ts`

## Why Plugin + Skill Is The Right Model

Use the skill for:

- when to run which action
- how to reason about campaign health
- how to choose safe tools
- how to explain outputs and next actions

Use the plugin for:

- Facebook API access
- MySQL persistence
- webhook verification and event ingest
- cron-like background sync
- Telegram control commands
- deterministic side-effect execution

## Target Capability Map

### Layer 1: Data Ingest

- Facebook Ads webhook receiver
- scheduled insights sync
- account resource health checks
- dedupe and idempotent storage

### Layer 2: Data Storage

- MySQL schema for accounts, campaigns, ad sets, ads, creatives, insights, alerts, actions, experiments, audit logs
- migration strategy
- replay-safe ingest model

### Layer 3: Analysis

- KPI engine
- benchmark engine
- anomaly detection
- account health scoring
- cost-effectiveness analysis

### Layer 4: Decision Support

- AI advisor with grounded inputs
- recommendation generation
- experiment proposal generation
- operator review summaries

### Layer 5: Controlled Execution

- write actions behind approval
- rollback metadata
- cooldown windows
- budget caps
- per-action audit logs

### Layer 6: Operator Control

- Telegram reports
- Telegram command surface
- approvals workflow
- health/status checks

## Step-By-Step Gap Analysis

### 1. `knowledge_base_loader`

Keep, but redesign.

Upgrade needed:

- define trusted sources only
- store source metadata and version
- define refresh cadence and failure policy
- separate policy docs from performance examples
- prevent silent drift from low-quality data

Implementation target:

- plugin service + optional cron job
- supporting reference docs for the skill

### 2. `check_account_resources`

Keep and move into a deterministic tool.

Add:

- token health
- business manager access
- ads account status
- billing status
- spend cap status
- policy flags and delivery issues

Implementation target:

- `ads_account_status` tool

### 3. `alert_management`

Keep but merge with the later notification step.

Add:

- severity
- dedupe key
- cooldown
- delivery targets
- escalation rules

Implementation target:

- alert dispatcher service + Telegram/email integrations

### 4. `receive_facebook_webhook`

Keep but harden.

Add:

- GET challenge verification
- POST signature verification
- replay protection
- payload validation
- dead-letter handling

Implementation target:

- plugin HTTP route

### 5. `parse_and_store_ads_data`

Keep and make it idempotent.

Add:

- schema versioning
- insert/update strategy
- event correlation ids
- transaction boundaries
- audit logging

Implementation target:

- ingest pipeline service

### 6. `micro_campaign_generator`

Do not auto-execute in MVP.

Use first as:

- campaign proposal generator
- target segmentation recommender
- experiment planner

Implementation target:

- read-first recommendation tool

### 7. `schedule_insights_refresh`

Keep the intent, but use OpenClaw scheduler rather than a custom scheduler abstraction.

Implementation target:

- cron or background plugin service

### 8. `analyze_ads_performance`

Keep and expand.

Add:

- attribution window awareness
- confidence threshold
- minimum spend threshold
- learning phase awareness
- outlier treatment policy

Implementation target:

- analysis engine + tool

### 9. `handle_performance_cases`

Keep but split into:

- recommendation policy
- execution policy

Add:

- approval gates
- hard deny list for risky actions
- rollback strategy
- dry-run support

Implementation target:

- policy module + operator approval flow

### 10. `ai_advisor_enhanced`

Keep as a major value layer.

Needs grounding:

- input schema
- reference sources
- evidence-backed recommendations
- confidence scoring

Implementation target:

- skill orchestration + advisory tool

### 11. `auto_learn_ab_experiments`

Keep, but limit to controlled experiment management.

Add:

- hypothesis registry
- test stop conditions
- winning criteria
- budget limits
- auto-promote policy

Implementation target:

- experiment manager tool

### 12. `event_driven_real_time_response`

Keep for later phase.

Add:

- cooldown windows
- circuit breaker
- action throttling
- post-action verification

Implementation target:

- event responder service

### 13. `cost_effectiveness_analysis`

Keep.

Add:

- segment-level reporting
- geo-level reporting
- audience-level reporting
- optional CRM revenue mapping

Implementation target:

- reporting tool

### 14. `crm_data_integration`

Keep, but phase it later.

Add:

- schema mapping
- identity resolution rules
- source-of-truth decisions
- consent and privacy rules

Implementation target:

- separate integration module

### 15. `telegram_bot_handler`

Remove as a custom standalone Telegram webhook layer if using OpenClaw Telegram.

Replacement:

- OpenClaw Telegram channel config
- native skill commands or plugin commands

### 16. `process_telegram_queries`

Keep the intent, but make it a skill and plugin-command surface instead of a custom webhook handler.

### 17. `campaign_optimization_and_management`

Keep, but start as `dry-run` only.

Add:

- action log
- approval requirement
- rollback metadata
- precondition checks
- rate and spend constraints

Implementation target:

- `ads_optimize` tool with `dryRun` default true

### 18. `notification_and_alert_system`

Merge into the same alerting subsystem as `alert_management`.

## Missing Configuration Inputs

Add these before production:

- `FB_APP_SECRET`
- `FB_WEBHOOK_VERIFY_TOKEN`
- `FB_AD_ACCOUNT_ID` or structured multi-account config
- `FB_BUSINESS_ID`
- `META_PIXEL_OR_DATASET_ID`
- `META_CAPI_ACCESS_TOKEN` or equivalent server-side event config
- `CRM_BASE_URL`
- `KNOWLEDGE_BASE_URL` or explicit trusted source list
- `TELEGRAM_ALLOWED_USER_IDS`
- `ALERT_EMAIL_RECIPIENTS`
- `DEFAULT_TIMEZONE`
- `DEFAULT_ATTRIBUTION_SETTING`
- `REPORTING_COMPARISON_WINDOWS`
- `LEARNING_PHASE_COOLDOWN_HOURS`
- `MIN_DECISION_SAMPLE_SIZE`
- `MIN_TEST_RUNTIME_DAYS`
- `MAX_CONCURRENT_TESTS`
- `ALLOWED_GEO_LIST`
- `ALLOWED_LANGUAGE_LIST`
- `POLICY_BLOCKLIST_PROFILE`
- `TRUSTED_EXTERNAL_SOURCE_URLS`
- `MAX_DAILY_BUDGET_ACTION_DELTA`
- `SAFE_MODE`

## MVP Scope

The MVP should do only this:

1. Check account health
2. Sync insights into MySQL
3. Analyze campaign performance
4. Generate recommendations
5. Send reports and alerts to Telegram
6. Allow Telegram command-based review

The MVP should not do this yet:

- auto scale campaigns
- auto pause large campaign groups without approval
- auto launch A/B tests without operator confirmation
- auto update knowledge base from broad internet sources

## Implementation Phases

### Phase 0: Specification Cleanup

Deliverables:

- corrected JSON blueprint
- step ownership map
- env/config schema draft
- definition of MVP vs later phases

### Phase 1: Plugin Skeleton

Deliverables:

- `extensions/ads-campaign-manager/openclaw.plugin.json`
- plugin entrypoint
- config schema
- empty tests
- bundled skill directory

### Phase 2: Data Foundation

Deliverables:

- MySQL schema
- migrations
- DB access layer
- Facebook account status tool
- insights sync pipeline
- basic storage tests

### Phase 3: Ingest + Scheduling

Deliverables:

- Facebook webhook route
- webhook validation
- idempotent event processing
- OpenClaw cron or service-based refresh
- logging and retry logic

### Phase 4: Analysis Engine

Deliverables:

- KPI calculator
- benchmark comparison
- campaign classification
- recommendation generation
- reporting output schema
- competitor intelligence summary model
- budget pacing diagnostics

### Phase 4B: Assistant Brain Training

Deliverables:

- boss preference memory structure
- brand and offer context pack
- ads playbook references
- curated external source registry with trust tiers
- source registry wired as the canonical knowledge-base whitelist
- naming and reporting style guide
- hypothesis and lessons-learned library
- operator-facing response templates
- attribution-aware reporting rules
- knowledge-base metadata schema
- authority matrix wired into decision policy

### Phase 5: Telegram Control Plane

Deliverables:

- Telegram channel config template
- Telegram-safe Vietnamese command taxonomy
- native command aliases such as `/baocao`, `/kehoach`, `/canhbao`, `/pheduyet`
- boss instruction command such as `/lenh`
- optional fallback `/skill ad-campaign-manager`
- daily report flow
- alert delivery flow
- task-board flow for `/viec_homnay`
- approval/rejection interaction flow

### Phase 6: Safe Write Actions

Deliverables:

- dry-run optimization tool
- approval flow
- action audit log
- rollback metadata
- guarded budget adjustment rules
- guarded pause/scale execution rules

### Phase 7: Advanced Automation

Deliverables:

- experiment manager
- CRM enrichment
- event-driven response
- guarded partial autonomy
- strategic planning assistant
- competitor monitoring automation
- structured weekly and monthly review generation

## Telegram And BotFather Plan

Use OpenClaw Telegram integration instead of building a second bot stack.

### BotFather setup

- create bot with `/newbot`
- keep token in `channels.telegram.botToken`
- review `/setprivacy`
- review `/setjoingroups`

### OpenClaw Telegram config goals

- DM-first control model
- explicit allowlist for operator IDs
- optional group support only after DM flow is stable
- native command menu kept minimal

### Recommended command model

Do not expose every function as a Telegram command.

Recommended commands:

- `/baocao`
- `/tongquan`
- `/canhbao`
- `/ngansach`
- `/kehoach`
- `/de_xuat`
- `/dongbo`
- `/doithu`
- `/pheduyet <id>`
- `/tuchoi <id>`
- `/lenh "..."`

Optional:

- `/viec_homnay`
- `/taochiendich`
- `/phantich <campaign>`
- `/skill ad-campaign-manager`

Avoid a large menu because Telegram native command registration has limits.

## Safety Rules

These rules should exist before any write action is enabled:

- default to read-only
- default all write tools to dry-run
- require approval for campaign pause, budget increase, bid changes, and experiment launch
- never compare performance snapshots across mismatched attribution settings
- never diagnose performance without checking delivery status and activity history first
- never auto-promote external heuristic content into write-action rules
- hard cap action size
- log every action with before/after state
- support rollback where API allows
- fail closed on missing auth, missing account mapping, or unclear target scope

## Testing Strategy

### Unit Tests

- config parsing
- env validation
- KPI calculations
- recommendation rules
- command parsing

### Integration Tests

- Facebook webhook ingest
- DB writes
- Telegram command dispatch
- alert generation
- dry-run optimization flow

### Staging Validation

- one test ad account
- one test Telegram operator
- one isolated MySQL schema
- no write actions enabled by default

## Definition Of "Good Enough" For First Real Use

The system is ready for first real usage when:

- it can ingest data reliably
- it can produce consistent daily reports
- it can detect poor-performing campaigns
- it can generate grounded recommendations
- it can notify the operator in Telegram
- every risky action remains operator-approved

## Open Questions To Resolve Before Coding Deeply

1. Single Facebook ad account or multiple accounts?
2. Is Telegram DM-only enough for the first version?
3. What is the KPI priority order: CPA, ROAS, CTR, CPL, CAC, or custom?
4. Will CRM become the revenue source of truth?
5. Is the knowledge base truly required in MVP, or should it wait?
6. Which actions are allowed automatically, if any?

## Recommended Build Order

Build in this order:

1. Fix JSON blueprint
2. Create plugin skeleton
3. Add DB layer
4. Add Facebook ingest and account health tools
5. Add analysis and reporting
6. Add Telegram command layer
7. Add dry-run optimization actions
8. Add approvals
9. Add advanced learning and experiments

## Working Rule For This Project

If a feature causes money movement, campaign state changes, or operator trust risk, it must begin as:

- read-only, or
- dry-run + approval

Do not skip this rule.

## Next Concrete Action

The next best move is:

- scaffold `extensions/ads-campaign-manager/`
- write the initial `openclaw.plugin.json`
- write the first `SKILL.md`
- define the config schema and MySQL entity model
