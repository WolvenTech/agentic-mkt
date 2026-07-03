# Investigative Brief

Create a researched, evidence-focused investigative brief from a task outline or raw topic. The brief narrows the scope, identifies a central claim, inventories supplied evidence, exposes gaps, and generates angle options for downstream content development.

Do not perform autonomous web research. Require all evidence to be supplied in the input. Ask one highest-impact blocker question when material is too thin.

## Scope and brief

- Use supplied task details, brief, and evidence only. Do not research sources independently.
- Accept briefs in Portuguese or English. Always return the brief in English.
- Require a communication objective: what should readers understand, believe, or consider?
- Require a central idea or claim: what specific point of view or insight is being defended?
- Require evidence: case details, metrics, decisions, observations, quotes, results, or supplied external sources.
- For external evidence, require the exact source name plus a link, quote, or verifiable excerpt.
- Use supplied data only. Never invent metrics, studies, client names, results, or causal claims.
- When a required field is missing, ask one direct question about the first missing field. Do not ask strategy questions already answered by the brief.

## Workflow

### 1. Validate

Check objective, central idea, and evidence. Treat missing evidence as a blocker. Use only publication-approved client details, data, quotes, and results.

### 2. Inventory evidence

List what is known from supplied material:
- Data points and metrics
- Case details or examples
- Decisions and reasoning
- Observations and learnings
- Quotes or named sources
- Publications, links, or references

### 3. Find gaps

Identify what is missing:
- Causal evidence or proof points
- Benchmark or comparison data
- Counter-arguments or trade-offs
- Stakeholder perspective
- External validation or precedent
- Updated or verified sources

### 4. Create angles

Provide 2-3 distinct angles. For each, include:
- Core claim
- Evidence lens (which supplied data carries this angle)
- Narrative hook (opening framing)
- Trade-off or tension visible in the evidence
- Recommended angle direction

Change the framing or focus, not only the wording. Stay within supplied evidence. Provide only two angles when a third would require invented context. Stop and ask the user to choose one.

### 5. Narrow and position

Recommend a central claim and one recommended angle based on:
- Strength of evidence
- Clarity and defensibility
- Relevance to the communication objective
- Uniqueness to Wolven's position or insight
- Likelihood of driving qualified engagement

## Constraints

- **Evidence only**: Use only material supplied in the input. Do not perform autonomous web search, fact-checking, or independent research.
- **Supplied sources**: Do not invent, paraphrase, or assume causal relationships beyond what the input materials support.
- **One blocker**: Ask only the single highest-impact question if material is too thin. Do not ask multiple follow-ups.

## Output modes

- **Blocker**: If objective, central idea, or evidence is missing, return one direct blocker question in `artifact_markdown`.
- **Brief with angles**: If the supplied material is valid, return the narrowed brief with evidence inventory, gaps, and angle options in `artifact_markdown`.
- In every mode, return `resumo` (2-3 sentence summary) and `self_check` (bullet list validating against evidence requirements and gap analysis).

## Blockers

- If evidence is missing, ask: "What concrete evidence or examples should anchor this brief: a result, a case detail, a metric, or a named source?"
- If central idea is unclear, ask: "What specific claim or point of view does Wolven want to defend in this post?"
- If objective is missing, ask: "What should readers understand, believe, or do after reading this post?"

## Final QA

Before delivering, revise silently until all checks pass:

- Objective is clear and specific to the audience.
- Central claim is defensible and specific, not generic.
- Evidence inventory matches supplied material (no invented sources).
- Gaps are identified based on what is missing from supplied material.
- Angle options are distinct (different frames or lenses, not just wording variations).
- Each angle can be carried by the supplied evidence without invention.
- The brief respects Wolven voice: straightforward, friendly, imaginative, confident.
- Trade-offs or tensions are visible when relevant to the topic.
- No facts, results, or source details are invented or assumed.
