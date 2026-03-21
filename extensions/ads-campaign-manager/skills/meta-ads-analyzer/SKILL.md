---
name: meta-ads-analyzer
description: Provides expert-level analysis and diagnosis for Meta Ads campaigns. Use this skill to interpret performance data, identify root causes of issues, and generate actionable recommendations — especially for the Breakdown Effect, Learning Phase, and Ad Relevance Diagnostics.
---

# Meta Ads Analysis & Diagnosis Skill

> [!IMPORTANT]
> **SCOPE: These rules apply to EVERY analysis, report, and tool call. Compliance is required at all times.**

---

## 1. The Non-Negotiable Rules (MANDATORY)

These are **absolute requirements**, not guidelines. Violation = task failure.

### 1.1. Audience Terminology: "Accounts Center accounts"

**NEVER** use "people" or "users" when referring to reach, audiences, or targets.

- ✅ **Correct**: "The campaign reached 10,000 Accounts Center accounts."
- ❌ **WRONG**: "The campaign reached 10,000 people."
- ✅ **Correct for Reach**: "The number of Accounts Center accounts that saw your ads at least once."
- ❌ **WRONG**: "Unique users who saw your ad."

### 1.2. Clicks Metrics: Always Specify Type

**NEVER** use the word "clicks" alone. Always use either `"Clicks (all)"` or `"Link clicks"`.

- ✅ "The ad received 1,500 Clicks (all) and 800 Link clicks."
- ❌ "The ad received 1,500 clicks."

### 1.3. Metric Naming: Use Exact Standardized Names

Use the exact `Standardized display name` from Section 2. **NEVER** add `Total`, `Overall`, or `Average` as prefixes.

- ❌ "Total Impressions" → ✅ "Impressions"
- ❌ "Video views" → ✅ "3-second video plays"
- ❌ "Average CPC" → ✅ "CPC (all)"

### 1.4. Data Integrity: Currency and Dates

- **Currency**: Use values returned by the API directly with the account's `currency` field. If `spend: 150.50` and currency is `VND`, report as `150,500 VND`.
- **Partial dates**: If the date range includes today, **MUST state** that data is partial and subject to change.

### 1.5. Data Scope: Account vs. Asset Level

Never mix account-level data with campaign/ad set/ad-level data. If a user asks about a specific campaign, return ONLY that campaign's data.

### 1.6. Cross-Objective Aggregation

When aggregating across mixed objectives (e.g., Sales + Lead), display `"N/A"` for "Cost per result" and "Results". Do NOT compute these metrics.

### 1.7. No Data Fabrication

If a metric returns `null`, display `"Data not available"` or `"N/A"`. **NEVER** estimate, guess, or invent any data values.

---

## 2. Standardized Metric Glossary

**This is the single source of truth.** Always use the exact `Standardized display name`.

| Raw metric name | Standardized display name | Definition |
| :--- | :--- | :--- |
| `impressions` | Impressions | The number of times your ads were on screen. |
| `reach` | Reach | The number of Accounts Center accounts that saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same Accounts Center accounts. |
| `clicks` | Clicks (all) | The number of clicks, taps or swipes on your ads. |
| `inline_link_clicks` | Link clicks | The number of clicks on links within the ad that led to advertiser-specified destinations, on or off Meta technologies. |
| `video_thruplay_watched_actions` | ThruPlays | The number of times your video was played to completion, or for at least 15 seconds. |
| `video_views` | 3-second video plays | The number of times your video played for at least 3 seconds, or for nearly its total length if it's shorter than 3 seconds. |
| `spend` | Amount spent | The approximate total amount of money you've spent on your campaign, ad set or ad during its schedule. |
| `purchase_roas` | Purchase ROAS (return on ad spend) | The total return on ad spend (ROAS) from purchases. |
| `cpm` | CPM (cost per 1,000 impressions) | The average cost for 1,000 impressions. |
| `cpc` | CPC (all) | The average cost for each click (all). |
| `ctr` | CTR (all) | The percentage of impressions where a click (all) occurred out of the total number of impressions. |
| `cost_per_result` | Cost per result | The average cost per result from your ads. |
| `inline_link_click_ctr` | CTR (link click-through rate) | The percentage of times Accounts Center accounts saw your ads and performed a link click. |
| `cost_per_inline_link_click` | CPC (cost per link click) | The average cost for each link click. |
| `actions:onsite_conversion.messaging_conversation_started_7d` | Messaging conversations started (MCS) | The number of times a messaging conversation was started with your business after at least 7 days of inactivity, attributed to your ads. |
| `cost_per_action_type` | Cost per 3-second video play | The average cost of each 3-second video play. |
| `unique_video_continuous_2_sec_watched_actions` | Unique 2-second continuous video plays | The number of Accounts Center accounts that performed a 2-second continuous video view. |
| `video_continuous_2_sec_watched_actions` | 2-second continuous video plays | The number of times your video was played for 2 continuous seconds or more. |
| `cost_per_2_sec_continuous_video_view` | Cost per 2-second continuous video play | The average cost for each 2-second continuous video play. |
| `video_30_sec_watched_actions` | 30-second video views | The number of times your video played for at least 30 seconds. |
| `quality_ranking` | Quality ranking | A ranking of your ad's perceived quality vs. competitors for the same audience. |
| `conversion_rate_ranking` | Conversion rate ranking | A ranking of your ad's expected conversion rate vs. competitors with the same optimization goal. |
| `engagement_rate_ranking` | Engagement rate ranking | A ranking of your ad's expected engagement rate vs. competitors. |

---

## 3. Core Analysis Principles

### 3.1. How to Think

- Verify data scope, units, and timeframes before presenting.
- Evaluate at aggregate level **before** drilling down.
- Analyze **trends over time**, not single snapshots.
- The system prioritizes **marginal cost** (cost of next result), not average cost.

### 3.2. Analysis Workflow

1. **For CBO campaigns (Advantage+ Campaign Budget):** Evaluate at Campaign level — do NOT break down by placement/demographic as the primary metric.
2. **For non-CBO ad sets:** Evaluate at Ad Set level.
3. Investigate: marginal efficiency, ad relevance diagnostics, learning phase status.
4. Never judge system decisions by average CPA in breakdown reports alone.

---

## 4. The Breakdown Effect (CRITICAL)

The "breakdown effect" is the **misinterpretation** that Meta shifts budget into underperforming segments. In reality, the system optimizes for **marginal efficiency**, not average efficiency.

| Automation Type | Evaluation Level |
|-----------------|-----------------|
| Advantage+ Campaign Budget (CBO) | Campaign level |
| Automatic placements (without CBO) | Ad Set level |
| Multiple ads in 1 ad set | Ad Set level |

**How it works:** The system combines **pacing** (even distribution) with **ML-driven delivery optimization**.

> A segment with higher average CPA may be protecting overall campaign efficiency by preventing even higher marginal costs elsewhere.

**Example:**
- Day 1: Facebook Stories at $0.35 CPA vs Instagram at $0.72.
- System finds inflection point where Facebook CPA rises faster, shifts budget.
- Final: Instagram ($1.46 CPA, $450 spend), Facebook ($1.10 CPA, $50 spend).
- Looks wrong — but the system optimized for marginal efficiency over time.

**→ NEVER recommend pausing a placement based solely on its higher average CPA in breakdown reports.**

---

## 5. The Learning Phase

New or significantly edited ad sets enter learning phase.

- **Exits after ~50 optimization events** within 7 days of last significant edit.
- **Shops ads exception**: Requires 17 website purchases + 5 Meta purchases.
- Performance is volatile: CPA higher, results not indicative of long-term results.

**Significant edits that RESET learning**: budget, bid, targeting, creative, optimization goal.

**Best practices:**
1. Don't edit during learning — resets the process.
2. Avoid high ad volumes — fragments learning across too many ad sets.
3. Use realistic budgets — too small gives inaccurate signals.
4. **"Learning limited"** = ad set can't get enough results to exit learning.

**Analysis rule**: Do NOT make definitive judgments about an ad set still in learning phase.

---

## 6. Ad Relevance Diagnostics

**These are diagnostic tools, NOT auction inputs.**

| Diagnostic | Measures |
|------------|----------|
| **Quality ranking** | Perceived quality vs. competitors for same audience |
| **Engagement rate ranking** | Expected engagement vs. competitors |
| **Conversion rate ranking** | Expected conversion vs. competitors with same optimization goal |

**Rankings scale**: Above Average → Average → Below Average (Bottom 35%) → Below Average (Bottom 20%) → Below Average (Bottom 10%).

**Not available** for ads with <500 impressions.

### Diagnosis Guide

| Ranking Scenario | Likely Issue | Action |
|-----------------|--------------|--------|
| Low Quality ranking | Creative perceived as low quality | Improve creative, reduce clickbait |
| Low Engagement ranking | Ad not compelling | Test new angles, improve hook |
| Low Conversion ranking | Post-click experience issues | Optimize landing page, check audience-offer fit |
| All rankings low | Audience-creative mismatch | Reconsider targeting AND creative strategy |

---

## 7. Ad Auctions

Every ad opportunity triggers an auction. Winner = **Highest Total Value**:

> **Total Value = (Advertiser Bid) × (Estimated Action Rate) + (Ad Quality)**

- **Key insight**: An ad more relevant to Accounts Center accounts can win against higher bids.
- High CPAs may result from low estimated action rates or quality, NOT just low bid.
- **Improving creative quality is often more effective than increasing bids.**

---

## 8. Bid Strategies

### Spend-Based
| Strategy | Goal |
|----------|------|
| **Highest volume** | Maximize conversions within budget |
| **Highest value** | Maximize purchase value within budget |

### Goal-Based
| Strategy | Goal |
|----------|------|
| **Cost per result goal** | Keep costs around a target amount |
| **ROAS goal** | Maintain target return on ad spend |

### Manual
| Strategy | Function |
|----------|----------|
| **Bid cap** | Sets maximum bid; requires understanding of predicted conversion rates |

---

## 9. Pacing

| Type | Function |
|------|----------|
| **Budget pacing** | Distributes budget evenly across schedule |
| **Bid pacing** | Adjusts bids to meet cost goals while maintaining delivery |

**Why it matters**: Without pacing, campaigns starting during high-competition periods exhaust budget on expensive results early. Pacing reserves budget for cheaper opportunities later.

**Analysis implication**: Daily spend variation is NORMAL. Evaluate cost efficiency over the full campaign schedule, not daily snapshots.

---

## 10. Auction Overlap

When ad sets share overlapping audiences, Meta chooses only the highest total value ad from your account — others are excluded (you don't compete against yourself, but you also only get one shot).

**Impact:**
- Can prevent ad sets from spending their full budget.
- Can prevent reaching ~50 results needed to exit learning.
- Results in less predictable scaling behavior.

**Solutions:**
1. **Combine similar ad sets** — consolidates learning, achieves stable results faster.
2. **Turn off overlapping ad sets** — typically the learning-limited or lowest-result ones.

---

## 11. Performance Fluctuations

### Common Causes
| Cause | Action |
|-------|--------|
| Learning phase | Wait for ~50 results |
| Audience saturation | Expand audience or refresh creative |
| Auction dynamics / competition | Monitor trends over 7+ days |
| Seasonality | Compare to historical same periods |
| Creative fatigue | Rotate creative regularly |
| External factors | Account for context (news, events) |

### Normal vs. Concerning
**Normal:** Day-to-day CPA variation within 20-30%, weekend vs. weekday differences, gradual changes over weeks.

**Concerning:**
- Sudden, sustained cost increases (>50% for multiple days)
- Delivery dropping to near zero
- Conversion rate declining while spend increases
- Performance degradation after no changes

### Before Diagnosing Problems — Check:
1. Is the ad set still in learning phase?
2. What is the baseline for normal variation?
3. Are there external factors?
4. Is the sample size sufficient? (Typically need 7+ days for stable ad sets)

---

## 12. Final Report Rules

- **NEVER** recommend pausing or reducing budget based solely on higher average CPA/CPM in breakdown reports.
- **ALWAYS** justify recommendations with data and system mechanics.
- **EVERY** insight must include data evidence and an explanation.
- **All output** MUST be in a single, consistent language (match the user's language).
- In narrative text, use sentence case for metrics (e.g., "Link clicks", not "LINK CLICKS").
- Frame budget/placement changes as **testable hypotheses**, not definitive fixes.
- When in doubt, frame at the level that avoids the breakdown effect (campaign level for CBO).

---

## 13. When to Use This Skill

Use this skill when the user wants to:
- Analyze campaign performance data and interpret metrics.
- Diagnose why an ad set is underperforming.
- Understand the learning phase, breakdown effect, or relevance diagnostics.
- Generate data-backed recommendations for bid strategy, creative, or targeting.
- Evaluate budget pacing and auction overlap issues.
- Interpret fluctuating CPA, CPM, or ROAS trends.

**Do NOT use** for general bot operations (brief, proposals, sync) — those are in the `ad-campaign-manager` skill.
