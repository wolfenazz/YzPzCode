// The report types the commission wizard offers. Each one carries the
// structure, fields and writing rules a professional version of it needs.
// Dependency-free (tested by `npm run test:writing`).

import type { CitationStyle, OutlineSection, Tone } from './types';

export type ReportCategory = 'academic' | 'business' | 'financial' | 'technical' | 'public' | 'general';

export const REPORT_CATEGORIES: Array<{ id: ReportCategory; label: string }> = [
  { id: 'academic', label: 'Academic' },
  { id: 'business', label: 'Business' },
  { id: 'financial', label: 'Financial' },
  { id: 'technical', label: 'Technical' },
  { id: 'public', label: 'Public & policy' },
  { id: 'general', label: 'General' },
];

export interface ReportField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface SectionTemplate {
  title: string;
  notes: string;
  /** Share of the report's target words. Shares are normalised, so they need not sum to 1. */
  share: number;
  subsections?: string[];
  unnumbered?: boolean;
}

export interface ReportTypeDef {
  id: string;
  name: string;
  category: ReportCategory;
  description: string;
  /** Phosphor icon name, mapped to a component by the UI. */
  icon: string;
  themeId: string;
  citationStyle: CitationStyle;
  tone: Tone;
  targetWords: number;
  fields: ReportField[];
  sections: SectionTemplate[];
  /** Type-specific rules added to every prompt for this report type. */
  guidance: string;
  includeToc?: boolean;
}

const STUDENT_FIELDS: ReportField[] = [
  { key: 'institution', label: 'University / institution', placeholder: 'e.g. King Fahd University of Petroleum & Minerals' },
  { key: 'department', label: 'Department / college', placeholder: 'e.g. Department of Computer Engineering' },
  { key: 'course', label: 'Course code & name', placeholder: 'e.g. COE 485 — Senior Design Project' },
  { key: 'supervisor', label: 'Supervisor / instructor', placeholder: 'e.g. Dr. Sara Al-Harbi' },
  { key: 'term', label: 'Term / semester', placeholder: 'e.g. Fall 2026' },
];

export const REPORT_TYPES: ReportTypeDef[] = [
  // Academic
  {
    id: 'senior-project',
    name: 'Senior / Capstone Project',
    category: 'academic',
    description: 'Final-year design project report with requirements, design, implementation and evaluation.',
    icon: 'GraduationCap',
    themeId: 'classic-academic',
    citationStyle: 'ieee',
    tone: 'formal',
    targetWords: 9000,
    includeToc: true,
    fields: [
      ...STUDENT_FIELDS,
      { key: 'team', label: 'Team members & IDs', placeholder: 'One per line: Name — ID', multiline: true },
      { key: 'sponsor', label: 'Industry sponsor (optional)' },
    ],
    sections: [
      { title: 'Abstract', notes: 'A single 200–250 word paragraph: problem, approach, key results, significance. No citations.', share: 0.03, unnumbered: true },
      { title: 'Acknowledgements', notes: 'Brief and sincere: supervisor, sponsor, department, family.', share: 0.015, unnumbered: true },
      { title: 'Introduction', notes: 'Background, problem statement, motivation, objectives, scope and report organisation.', share: 0.1, subsections: ['Background', 'Problem Statement', 'Objectives', 'Scope and Limitations', 'Report Organisation'] },
      { title: 'Literature Review', notes: 'Survey existing solutions and research; compare them in a table; identify the gap this project fills.', share: 0.14, subsections: ['Existing Solutions', 'Related Research', 'Comparison and Gap Analysis'] },
      { title: 'Requirements and Constraints', notes: 'Functional and non-functional requirements, engineering standards, realistic constraints (economic, safety, ethical, environmental).', share: 0.1, subsections: ['Functional Requirements', 'Non-Functional Requirements', 'Engineering Standards', 'Design Constraints'] },
      { title: 'System Design', notes: 'Architecture, design alternatives and the selection rationale (decision matrix), detailed design of each subsystem.', share: 0.17, subsections: ['System Architecture', 'Design Alternatives', 'Detailed Design'] },
      { title: 'Implementation', notes: 'Tools, technologies, how each component was built, challenges met and how they were resolved.', share: 0.15 },
      { title: 'Testing and Evaluation', notes: 'Test plan, test cases in a table, results with numbers, comparison against the requirements.', share: 0.12, subsections: ['Test Plan', 'Results', 'Discussion'] },
      { title: 'Project Management', notes: 'Timeline (table of milestones), task allocation among members, budget and bill of materials, risks.', share: 0.06 },
      { title: 'Conclusion and Future Work', notes: 'Summary of achievements against objectives, lessons learned, concrete future improvements.', share: 0.06 },
      { title: 'References', notes: 'Every source cited in the text, formatted in the chosen citation style.', share: 0.03, unnumbered: true },
    ],
    guidance:
      'Write as the student team ("we"). Tie every design decision to a requirement or constraint. Use tables for requirements, comparisons, test results and the timeline. Quantify results. Mention relevant engineering standards (IEEE, ISO) only where they genuinely apply.',
  },
  {
    id: 'research-paper',
    name: 'Research Paper',
    category: 'academic',
    description: 'Journal-style empirical paper: IMRaD structure with a rigorous method and discussion.',
    icon: 'Flask',
    themeId: 'classic-academic',
    citationStyle: 'apa',
    tone: 'analytical',
    targetWords: 7000,
    fields: [
      { key: 'field', label: 'Discipline / field', placeholder: 'e.g. Educational psychology' },
      { key: 'researchQuestion', label: 'Research question(s)', multiline: true },
      { key: 'method', label: 'Method & data', placeholder: 'e.g. Survey of 412 undergraduates, regression analysis', multiline: true },
      { key: 'keywords', label: 'Keywords', placeholder: 'Comma separated' },
      { key: 'institution', label: 'Affiliation' },
    ],
    sections: [
      { title: 'Abstract', notes: '150–250 words: purpose, method, results, conclusion. Then a "Keywords:" line.', share: 0.04, unnumbered: true },
      { title: 'Introduction', notes: 'Context, the gap in the literature, the research questions or hypotheses, contribution.', share: 0.13 },
      { title: 'Literature Review', notes: 'Synthesise (do not list) prior work around themes; build the case for the hypotheses.', share: 0.2 },
      { title: 'Method', notes: 'Participants or data, materials, procedure, analysis plan. Enough detail to replicate.', share: 0.17, subsections: ['Participants', 'Materials', 'Procedure', 'Analysis'] },
      { title: 'Results', notes: 'Report findings with statistics and tables; no interpretation here.', share: 0.17 },
      { title: 'Discussion', notes: 'Interpret results against the literature, implications, limitations, future research.', share: 0.2, subsections: ['Interpretation', 'Implications', 'Limitations', 'Future Research'] },
      { title: 'Conclusion', notes: 'Short and decisive.', share: 0.05 },
      { title: 'References', notes: 'Full reference list in the chosen style.', share: 0.04, unnumbered: true },
    ],
    guidance:
      'Use precise, measured claims proportional to the evidence. Report statistics in standard form (e.g. t(48) = 2.31, p = .025). Prefer synthesis over summary in the review. Do not invent studies; if real sources are not supplied, cite only well-known foundational works and mark any uncertain reference with [verify].',
  },
  {
    id: 'thesis-chapter',
    name: 'Thesis / Dissertation Chapter',
    category: 'academic',
    description: 'A single long-form chapter with deep argument, signposting and scholarly apparatus.',
    icon: 'BookOpen',
    themeId: 'classic-academic',
    citationStyle: 'apa',
    tone: 'analytical',
    targetWords: 8000,
    fields: [
      { key: 'chapter', label: 'Chapter number & purpose', placeholder: 'e.g. Chapter 2 — Literature Review' },
      { key: 'thesisTitle', label: 'Thesis title' },
      { key: 'degree', label: 'Degree', placeholder: 'e.g. MSc Data Science' },
      { key: 'institution', label: 'Institution' },
      { key: 'supervisor', label: 'Supervisor' },
    ],
    sections: [
      { title: 'Chapter Introduction', notes: 'What the chapter does and how it connects to the thesis argument.', share: 0.08 },
      { title: 'Main Discussion I', notes: 'First major theme or strand of argument.', share: 0.28 },
      { title: 'Main Discussion II', notes: 'Second major theme, building on the first.', share: 0.28 },
      { title: 'Main Discussion III', notes: 'Third theme, tensions and debates.', share: 0.22 },
      { title: 'Chapter Summary', notes: 'What was established and how it sets up the next chapter.', share: 0.08 },
      { title: 'References', notes: 'Reference list in the chosen style.', share: 0.06, unnumbered: true },
    ],
    guidance: 'Rename the discussion sections to their real themes. Signpost the argument at the start and end of each section. Engage critically with sources rather than reporting them.',
  },
  {
    id: 'literature-review',
    name: 'Literature Review',
    category: 'academic',
    description: 'Thematic, critical synthesis of research on a topic, ending in clear gaps.',
    icon: 'Books',
    themeId: 'classic-academic',
    citationStyle: 'apa',
    tone: 'analytical',
    targetWords: 5000,
    fields: [
      { key: 'scope', label: 'Scope & time period', placeholder: 'e.g. Peer-reviewed studies 2015–2026' },
      { key: 'searchStrategy', label: 'Search strategy (optional)', multiline: true },
      { key: 'institution', label: 'Institution / course' },
    ],
    sections: [
      { title: 'Introduction', notes: 'Topic, why it matters, scope, and how the review is organised.', share: 0.12 },
      { title: 'Methodology of the Review', notes: 'Databases, search terms, inclusion criteria.', share: 0.08 },
      { title: 'Thematic Review', notes: 'Three to four themes, each synthesising agreement, disagreement and quality of evidence.', share: 0.55, subsections: ['Theme One', 'Theme Two', 'Theme Three'] },
      { title: 'Gaps and Future Directions', notes: 'What is missing and which questions deserve study.', share: 0.15 },
      { title: 'Conclusion', notes: 'Concise synthesis.', share: 0.05 },
      { title: 'References', notes: 'Full list.', share: 0.05, unnumbered: true },
    ],
    guidance: 'Organise by theme, never source by source. Compare methodologies. Rename theme subsections to their actual themes.',
  },
  {
    id: 'lab-report',
    name: 'Lab Report',
    category: 'academic',
    description: 'Scientific laboratory report with procedure, data tables, analysis and error discussion.',
    icon: 'TestTube',
    themeId: 'technical',
    citationStyle: 'ieee',
    tone: 'analytical',
    targetWords: 3000,
    fields: [
      ...STUDENT_FIELDS.slice(0, 4),
      { key: 'experiment', label: 'Experiment title & number' },
      { key: 'data', label: 'Measured data / observations', multiline: true },
    ],
    sections: [
      { title: 'Abstract', notes: 'Aim, method, key result with numbers.', share: 0.05, unnumbered: true },
      { title: 'Introduction and Theory', notes: 'Aim, underlying theory and equations.', share: 0.17 },
      { title: 'Apparatus and Procedure', notes: 'Equipment list and numbered procedure.', share: 0.15 },
      { title: 'Results', notes: 'Data tables, calculations, figure placeholders.', share: 0.25 },
      { title: 'Discussion', notes: 'Interpretation, comparison with theory, sources of error and uncertainty.', share: 0.25 },
      { title: 'Conclusion', notes: 'Whether the aim was met, with the key number.', share: 0.08 },
      { title: 'References', notes: 'Sources used.', share: 0.05, unnumbered: true },
    ],
    guidance: 'Use past tense passive for the procedure. Put all measurements in tables with units. Compute percentage error against theoretical values.',
  },
  {
    id: 'research-proposal',
    name: 'Research Proposal',
    category: 'academic',
    description: 'Persuasive plan for a study: questions, method, timeline, budget and expected impact.',
    icon: 'Lightbulb',
    themeId: 'classic-academic',
    citationStyle: 'apa',
    tone: 'persuasive',
    targetWords: 4500,
    fields: [
      { key: 'field', label: 'Field' },
      { key: 'funder', label: 'Programme / funder (optional)' },
      { key: 'duration', label: 'Duration', placeholder: 'e.g. 24 months' },
      { key: 'institution', label: 'Institution' },
    ],
    sections: [
      { title: 'Summary', notes: 'One-paragraph pitch.', share: 0.05, unnumbered: true },
      { title: 'Background and Rationale', notes: 'Problem, gap, significance.', share: 0.2 },
      { title: 'Aims and Research Questions', notes: 'Numbered aims and questions.', share: 0.1 },
      { title: 'Methodology', notes: 'Design, data, analysis, ethics.', share: 0.25 },
      { title: 'Work Plan and Timeline', notes: 'Milestones table.', share: 0.12 },
      { title: 'Budget', notes: 'Itemised budget table with justification.', share: 0.08 },
      { title: 'Expected Outcomes and Impact', notes: 'Contributions, dissemination.', share: 0.12 },
      { title: 'References', notes: 'Reference list.', share: 0.05, unnumbered: true },
    ],
    guidance: 'Be concrete about feasibility. Every aim must map to a method and a milestone.',
  },
  {
    id: 'case-study',
    name: 'Case Study',
    category: 'academic',
    description: 'In-depth analysis of a real organisation, event or decision, with recommendations.',
    icon: 'MagnifyingGlass',
    themeId: 'elegant-serif',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 4000,
    fields: [
      { key: 'subject', label: 'Subject of the case', placeholder: 'e.g. Nokia’s smartphone transition, 2007–2013' },
      { key: 'framework', label: 'Analytical framework (optional)', placeholder: 'e.g. Porter’s Five Forces, SWOT' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'The situation, the finding, the recommendation.', share: 0.07, unnumbered: true },
      { title: 'Background', notes: 'History and context of the case.', share: 0.18 },
      { title: 'Problem Identification', notes: 'Core problem and symptoms.', share: 0.12 },
      { title: 'Analysis', notes: 'Apply the framework with evidence.', share: 0.3 },
      { title: 'Alternatives', notes: 'Two or three options weighed in a table.', share: 0.13 },
      { title: 'Recommendations and Implementation', notes: 'Chosen option, action plan.', share: 0.13 },
      { title: 'References', notes: 'Sources.', share: 0.05, unnumbered: true },
    ],
    guidance: 'Separate facts from judgement. Evaluate alternatives against explicit criteria.',
  },

  // Business
  {
    id: 'business-plan',
    name: 'Business Plan',
    category: 'business',
    description: 'Investor-ready plan: market, model, go-to-market, operations, team and financials.',
    icon: 'Rocket',
    themeId: 'modern-corporate',
    citationStyle: 'harvard',
    tone: 'persuasive',
    targetWords: 7000,
    fields: [
      { key: 'company', label: 'Company / venture name' },
      { key: 'stage', label: 'Stage', placeholder: 'e.g. Pre-seed, revenue-generating' },
      { key: 'ask', label: 'Funding ask (optional)', placeholder: 'e.g. $750k for 18 months runway' },
      { key: 'market', label: 'Target market & geography' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Problem, solution, market, traction, team, ask — one page.', share: 0.08, unnumbered: true },
      { title: 'Company Overview', notes: 'Mission, legal form, location, stage.', share: 0.07 },
      { title: 'Problem and Solution', notes: 'Customer pain with evidence; product and value proposition.', share: 0.12 },
      { title: 'Market Analysis', notes: 'TAM/SAM/SOM table, trends, customer segments.', share: 0.14 },
      { title: 'Competitive Landscape', notes: 'Competitor comparison table and defensibility.', share: 0.1 },
      { title: 'Business Model', notes: 'Revenue streams, pricing, unit economics.', share: 0.1 },
      { title: 'Go-to-Market Strategy', notes: 'Channels, acquisition plan, partnerships.', share: 0.1 },
      { title: 'Operations and Milestones', notes: 'How it runs; milestone table.', share: 0.08 },
      { title: 'Management Team', notes: 'Roles and relevant experience.', share: 0.06 },
      { title: 'Financial Plan', notes: 'Three-year projection table, assumptions, use of funds.', share: 0.11 },
      { title: 'Risks and Mitigation', notes: 'Risk table with likelihood, impact, mitigation.', share: 0.04 },
    ],
    guidance: 'Every claim about the market needs a number and a stated assumption. Keep projections internally consistent.',
  },
  {
    id: 'feasibility-study',
    name: 'Feasibility Study',
    category: 'business',
    description: 'Technical, economic, legal, operational and schedule feasibility with a clear verdict.',
    icon: 'Scales',
    themeId: 'modern-corporate',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 6000,
    fields: [
      { key: 'project', label: 'Proposed project' },
      { key: 'client', label: 'Prepared for' },
      { key: 'budget', label: 'Budget envelope (optional)' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Recommendation first, then the reasons.', share: 0.07, unnumbered: true },
      { title: 'Project Description', notes: 'Objectives and scope.', share: 0.1 },
      { title: 'Market Feasibility', notes: 'Demand evidence.', share: 0.14 },
      { title: 'Technical Feasibility', notes: 'Technology, resources, constraints.', share: 0.16 },
      { title: 'Financial Feasibility', notes: 'Costs, revenues, NPV/IRR/payback in a table.', share: 0.18 },
      { title: 'Legal and Regulatory Feasibility', notes: 'Permits, compliance.', share: 0.09 },
      { title: 'Operational and Schedule Feasibility', notes: 'Staffing, timeline.', share: 0.1 },
      { title: 'Risk Assessment', notes: 'Risk register table.', share: 0.08 },
      { title: 'Conclusion and Recommendation', notes: 'Go / no-go with conditions.', share: 0.08 },
    ],
    guidance: 'Lead with the verdict. Show the financial calculations and their assumptions.',
  },
  {
    id: 'market-analysis',
    name: 'Market Analysis',
    category: 'business',
    description: 'Market size, segments, trends, competitors and opportunities.',
    icon: 'ChartLineUp',
    themeId: 'modern-corporate',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 5000,
    fields: [
      { key: 'market', label: 'Market / industry' },
      { key: 'region', label: 'Region' },
      { key: 'horizon', label: 'Time horizon', placeholder: 'e.g. 2026–2031' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Key numbers and takeaways.', share: 0.08, unnumbered: true },
      { title: 'Market Definition and Size', notes: 'Definition, size, growth (CAGR) table.', share: 0.16 },
      { title: 'Segmentation', notes: 'Segments with size and needs.', share: 0.14 },
      { title: 'Trends and Drivers', notes: 'PESTLE-style drivers.', share: 0.16 },
      { title: 'Competitive Analysis', notes: 'Players, share, positioning table.', share: 0.18 },
      { title: 'Customer Insights', notes: 'Buying behaviour.', share: 0.1 },
      { title: 'Opportunities and Threats', notes: 'Prioritised.', share: 0.1 },
      { title: 'Recommendations', notes: 'Actionable next steps.', share: 0.08 },
    ],
    guidance: 'State the source and year of every figure; mark estimates as estimates.',
  },
  {
    id: 'swot-analysis',
    name: 'SWOT / Strategic Analysis',
    category: 'business',
    description: 'Strengths, weaknesses, opportunities and threats with TOWS strategies.',
    icon: 'SquaresFour',
    themeId: 'swiss-minimal',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 3000,
    fields: [{ key: 'organization', label: 'Organisation / product' }],
    sections: [
      { title: 'Overview', notes: 'Organisation and context.', share: 0.12 },
      { title: 'Strengths', notes: 'Internal advantages with evidence.', share: 0.15 },
      { title: 'Weaknesses', notes: 'Internal limitations.', share: 0.15 },
      { title: 'Opportunities', notes: 'External openings.', share: 0.15 },
      { title: 'Threats', notes: 'External risks.', share: 0.15 },
      { title: 'TOWS Strategies', notes: 'SO/WO/ST/WT strategies in a table.', share: 0.18 },
      { title: 'Recommendations', notes: 'Priorities.', share: 0.1 },
    ],
    guidance: 'Include a 2×2 SWOT summary table near the start.',
  },
  {
    id: 'project-status',
    name: 'Project Status Report',
    category: 'business',
    description: 'Progress, RAG status, milestones, budget, risks and decisions needed.',
    icon: 'Kanban',
    themeId: 'modern-corporate',
    citationStyle: 'harvard',
    tone: 'neutral',
    targetWords: 1800,
    includeToc: false,
    fields: [
      { key: 'project', label: 'Project' },
      { key: 'period', label: 'Reporting period' },
      { key: 'progress', label: 'Progress notes', multiline: true },
    ],
    sections: [
      { title: 'Summary and Overall Status', notes: 'RAG status for scope, schedule, budget, quality in a table.', share: 0.2 },
      { title: 'Accomplishments', notes: 'Completed this period.', share: 0.18 },
      { title: 'Milestones', notes: 'Planned vs forecast table.', share: 0.17 },
      { title: 'Budget', notes: 'Planned vs actual.', share: 0.12 },
      { title: 'Risks and Issues', notes: 'Register with owners.', share: 0.15 },
      { title: 'Next Steps and Decisions Required', notes: 'Clear asks.', share: 0.18 },
    ],
    guidance: 'Be brief and scannable. Use tables. Do not pad.',
  },
  {
    id: 'business-proposal',
    name: 'Business Proposal',
    category: 'business',
    description: 'Client-facing proposal: understanding, solution, deliverables, pricing and terms.',
    icon: 'Handshake',
    themeId: 'modern-corporate',
    citationStyle: 'harvard',
    tone: 'persuasive',
    targetWords: 3500,
    fields: [
      { key: 'client', label: 'Client' },
      { key: 'company', label: 'Your company' },
      { key: 'offer', label: 'What you are proposing', multiline: true },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'The client’s goal and how you meet it.', share: 0.1, unnumbered: true },
      { title: 'Understanding of Requirements', notes: 'Restate the need in the client’s terms.', share: 0.15 },
      { title: 'Proposed Solution', notes: 'Approach and why it works.', share: 0.22 },
      { title: 'Deliverables and Timeline', notes: 'Table of deliverables with dates.', share: 0.15 },
      { title: 'Pricing', notes: 'Itemised pricing table.', share: 0.12 },
      { title: 'Why Us', notes: 'Credentials, case evidence.', share: 0.12 },
      { title: 'Terms and Next Steps', notes: 'Assumptions, validity, call to action.', share: 0.1 },
    ],
    guidance: 'Write to the client ("you"). Keep it benefit-led and specific.',
  },

  // Financial
  {
    id: 'financial-analysis',
    name: 'Financial Analysis Report',
    category: 'financial',
    description: 'Statement analysis with ratios, trends, peer comparison and an investment view.',
    icon: 'ChartBar',
    themeId: 'financial-ledger',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 5500,
    fields: [
      { key: 'company', label: 'Company' },
      { key: 'period', label: 'Periods analysed', placeholder: 'e.g. FY2023–FY2025' },
      { key: 'currency', label: 'Currency & units', placeholder: 'e.g. SAR millions' },
      { key: 'data', label: 'Financial data (paste statements)', multiline: true },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Health verdict, three key numbers, outlook.', share: 0.08, unnumbered: true },
      { title: 'Company and Industry Overview', notes: 'Business model, segments, industry context.', share: 0.1 },
      { title: 'Income Statement Analysis', notes: 'Revenue and margin trends table.', share: 0.15 },
      { title: 'Balance Sheet Analysis', notes: 'Assets, liabilities, capital structure.', share: 0.13 },
      { title: 'Cash Flow Analysis', notes: 'Operating, investing, financing; free cash flow.', share: 0.12 },
      { title: 'Ratio Analysis', notes: 'Liquidity, profitability, leverage, efficiency ratios in tables with formulas and interpretation.', share: 0.2, subsections: ['Liquidity', 'Profitability', 'Leverage', 'Efficiency'] },
      { title: 'Peer Comparison', notes: 'Key metrics against competitors.', share: 0.08 },
      { title: 'Risks', notes: 'Financial and operating risks.', share: 0.07 },
      { title: 'Conclusion and Outlook', notes: 'Overall assessment.', share: 0.07 },
    ],
    guidance: 'Compute ratios correctly from the supplied data and show the formula once. Use consistent units and periods. Never invent figures; if data is missing, say what is missing. Add a short disclaimer that the report is not investment advice.',
  },
  {
    id: 'annual-report',
    name: 'Annual Report',
    category: 'financial',
    description: 'Chair’s letter, year in review, performance, governance and outlook.',
    icon: 'CalendarCheck',
    themeId: 'financial-ledger',
    citationStyle: 'harvard',
    tone: 'formal',
    targetWords: 6000,
    fields: [
      { key: 'company', label: 'Organisation' },
      { key: 'year', label: 'Financial year' },
      { key: 'highlights', label: 'Key highlights & figures', multiline: true },
    ],
    sections: [
      { title: 'Highlights', notes: 'Key figures table.', share: 0.06, unnumbered: true },
      { title: 'Chair’s Letter', notes: 'Personal, reflective, forward-looking.', share: 0.1 },
      { title: 'Year in Review', notes: 'Major events and achievements.', share: 0.16 },
      { title: 'Strategy', notes: 'Strategic priorities and progress.', share: 0.14 },
      { title: 'Financial Performance', notes: 'Results with tables and commentary.', share: 0.2 },
      { title: 'Sustainability and Social Impact', notes: 'ESG performance.', share: 0.1 },
      { title: 'Governance', notes: 'Board, committees, risk management.', share: 0.12 },
      { title: 'Outlook', notes: 'Next year’s priorities.', share: 0.08 },
    ],
    guidance: 'Balance narrative and numbers. Keep the chair’s letter warmer than the rest.',
  },
  {
    id: 'investment-memo',
    name: 'Investment Memo',
    category: 'financial',
    description: 'Investment thesis, valuation, risks and a clear recommendation.',
    icon: 'TrendUp',
    themeId: 'financial-ledger',
    citationStyle: 'harvard',
    tone: 'analytical',
    targetWords: 3500,
    includeToc: false,
    fields: [
      { key: 'target', label: 'Investment target' },
      { key: 'dealTerms', label: 'Deal terms', multiline: true },
      { key: 'currency', label: 'Currency & units' },
    ],
    sections: [
      { title: 'Recommendation', notes: 'Invest / pass and the size, up front.', share: 0.08 },
      { title: 'Investment Thesis', notes: 'Three to five reasons.', share: 0.2 },
      { title: 'Business and Market', notes: 'What it does and where it plays.', share: 0.17 },
      { title: 'Financials and Valuation', notes: 'Key metrics, valuation method, returns table.', share: 0.22 },
      { title: 'Risks and Mitigants', notes: 'Table.', share: 0.15 },
      { title: 'Due Diligence Items', notes: 'Open questions.', share: 0.1 },
      { title: 'Conclusion', notes: 'Restate the call.', share: 0.08 },
    ],
    guidance: 'Be direct and decision-oriented. Quantify the upside and downside cases.',
  },
  {
    id: 'budget-report',
    name: 'Budget / Variance Report',
    category: 'financial',
    description: 'Budget vs actual analysis, variance explanations and forecast.',
    icon: 'Calculator',
    themeId: 'financial-ledger',
    citationStyle: 'harvard',
    tone: 'neutral',
    targetWords: 2500,
    fields: [
      { key: 'unit', label: 'Department / entity' },
      { key: 'period', label: 'Period' },
      { key: 'data', label: 'Budget and actual figures', multiline: true },
    ],
    sections: [
      { title: 'Summary', notes: 'Overall variance and key drivers.', share: 0.15 },
      { title: 'Revenue Variance', notes: 'Table and explanation.', share: 0.2 },
      { title: 'Expense Variance', notes: 'Table and explanation.', share: 0.25 },
      { title: 'Forecast', notes: 'Full-year outlook.', share: 0.2 },
      { title: 'Actions', notes: 'Corrective actions.', share: 0.2 },
    ],
    guidance: 'Show variance as amount and percentage, favourable/unfavourable.',
  },
  {
    id: 'audit-summary',
    name: 'Audit / Compliance Report',
    category: 'financial',
    description: 'Scope, findings with severity, root causes and management responses.',
    icon: 'ShieldCheck',
    themeId: 'financial-ledger',
    citationStyle: 'harvard',
    tone: 'formal',
    targetWords: 3500,
    fields: [
      { key: 'auditee', label: 'Audited entity / process' },
      { key: 'standard', label: 'Standard / framework', placeholder: 'e.g. ISO 27001, SOX' },
      { key: 'findings', label: 'Findings notes', multiline: true },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Overall opinion and critical findings.', share: 0.1, unnumbered: true },
      { title: 'Scope and Methodology', notes: 'What was tested and how.', share: 0.12 },
      { title: 'Findings', notes: 'Each finding: condition, criteria, cause, effect, severity — table plus narrative.', share: 0.45 },
      { title: 'Recommendations', notes: 'Prioritised.', share: 0.18 },
      { title: 'Management Response', notes: 'Owners and dates table.', share: 0.15 },
    ],
    guidance: 'Use condition–criteria–cause–effect for every finding. Severity: High/Medium/Low.',
  },

  // Technical
  {
    id: 'technical-report',
    name: 'Technical Report',
    category: 'technical',
    description: 'Engineering investigation with method, results and recommendations.',
    icon: 'Gear',
    themeId: 'technical',
    citationStyle: 'ieee',
    tone: 'analytical',
    targetWords: 5000,
    fields: [
      { key: 'system', label: 'System / subject' },
      { key: 'client', label: 'Prepared for' },
      { key: 'reportNumber', label: 'Report number (optional)' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Problem, findings, recommendations.', share: 0.08, unnumbered: true },
      { title: 'Introduction', notes: 'Purpose, scope, background.', share: 0.1 },
      { title: 'Technical Background', notes: 'Principles needed to follow the report.', share: 0.15 },
      { title: 'Methodology', notes: 'How the investigation was done.', share: 0.17 },
      { title: 'Results', notes: 'Data, tables, figures.', share: 0.2 },
      { title: 'Discussion', notes: 'Meaning, limitations.', share: 0.15 },
      { title: 'Recommendations', notes: 'Numbered, actionable.', share: 0.1 },
      { title: 'References', notes: 'IEEE list.', share: 0.05, unnumbered: true },
    ],
    guidance: 'Number figures and tables. Define every acronym on first use. Prefer SI units.',
  },
  {
    id: 'white-paper',
    name: 'White Paper',
    category: 'technical',
    description: 'Authoritative explainer that frames a problem and argues for an approach.',
    icon: 'Article',
    themeId: 'swiss-minimal',
    citationStyle: 'harvard',
    tone: 'persuasive',
    targetWords: 4500,
    fields: [
      { key: 'organization', label: 'Publishing organisation' },
      { key: 'thesis', label: 'Core argument', multiline: true },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'The argument in one page.', share: 0.08, unnumbered: true },
      { title: 'The Problem', notes: 'Stakes and evidence.', share: 0.18 },
      { title: 'Current Approaches and Their Limits', notes: 'Fair critique.', share: 0.17 },
      { title: 'A Better Approach', notes: 'The proposal in depth.', share: 0.25 },
      { title: 'Evidence and Case Examples', notes: 'Proof points.', share: 0.15 },
      { title: 'Implementation Considerations', notes: 'How to adopt it.', share: 0.1 },
      { title: 'Conclusion', notes: 'Call to action.', share: 0.07 },
    ],
    guidance: 'Educate first, sell lightly. Support claims with data.',
  },
  {
    id: 'technical-spec',
    name: 'Technical Specification',
    category: 'technical',
    description: 'Design specification with requirements, architecture, interfaces and acceptance criteria.',
    icon: 'Cpu',
    themeId: 'technical',
    citationStyle: 'ieee',
    tone: 'neutral',
    targetWords: 4500,
    fields: [
      { key: 'system', label: 'System / feature' },
      { key: 'version', label: 'Version' },
      { key: 'stakeholders', label: 'Stakeholders' },
    ],
    sections: [
      { title: 'Overview', notes: 'Purpose, scope, definitions.', share: 0.1 },
      { title: 'Requirements', notes: 'Numbered functional and non-functional requirements with MUST/SHOULD.', share: 0.22 },
      { title: 'Architecture', notes: 'Components and data flow.', share: 0.2 },
      { title: 'Interfaces', notes: 'APIs and data formats in tables or code.', share: 0.18 },
      { title: 'Security and Reliability', notes: 'Threats, mitigations, SLOs.', share: 0.12 },
      { title: 'Testing and Acceptance Criteria', notes: 'Verifiable criteria.', share: 0.12 },
      { title: 'Open Questions', notes: 'Unresolved items.', share: 0.06 },
    ],
    guidance: 'Use RFC 2119 keywords. Every requirement must be testable.',
  },
  {
    id: 'post-mortem',
    name: 'Incident Post-mortem',
    category: 'technical',
    description: 'Blameless incident review: timeline, impact, root cause and actions.',
    icon: 'Siren',
    themeId: 'technical',
    citationStyle: 'ieee',
    tone: 'neutral',
    targetWords: 2200,
    includeToc: false,
    fields: [
      { key: 'incident', label: 'Incident' },
      { key: 'timeline', label: 'Timeline notes', multiline: true },
      { key: 'impact', label: 'Impact' },
    ],
    sections: [
      { title: 'Summary', notes: 'What happened, impact, duration.', share: 0.15 },
      { title: 'Timeline', notes: 'Timestamped table.', share: 0.2 },
      { title: 'Root Cause', notes: 'Five whys.', share: 0.2 },
      { title: 'Impact', notes: 'Users, revenue, SLAs.', share: 0.1 },
      { title: 'What Went Well and What Did Not', notes: 'Honest.', share: 0.15 },
      { title: 'Action Items', notes: 'Owner and due date table.', share: 0.2 },
    ],
    guidance: 'Blameless language: describe systems and decisions, not people’s faults.',
  },
  {
    id: 'user-manual',
    name: 'User Manual / Guide',
    category: 'technical',
    description: 'Task-based instructions with steps, tips, troubleshooting and FAQ.',
    icon: 'Notebook',
    themeId: 'technical',
    citationStyle: 'ieee',
    tone: 'friendly',
    targetWords: 4000,
    fields: [
      { key: 'product', label: 'Product' },
      { key: 'audience', label: 'Reader skill level' },
    ],
    sections: [
      { title: 'Getting Started', notes: 'What it is, requirements, installation.', share: 0.18 },
      { title: 'Core Tasks', notes: 'Numbered step-by-step procedures.', share: 0.4 },
      { title: 'Advanced Features', notes: 'Power-user tasks.', share: 0.17 },
      { title: 'Troubleshooting', notes: 'Problem / cause / fix table.', share: 0.15 },
      { title: 'FAQ', notes: 'Short Q&A.', share: 0.1 },
    ],
    guidance: 'Imperative mood for steps. One action per step. Address the reader as "you".',
  },

  // Public & policy
  {
    id: 'policy-brief',
    name: 'Policy Brief',
    category: 'public',
    description: 'Concise, evidence-based brief for decision makers with clear options.',
    icon: 'Bank',
    themeId: 'elegant-serif',
    citationStyle: 'chicago',
    tone: 'persuasive',
    targetWords: 2500,
    includeToc: false,
    fields: [
      { key: 'audience', label: 'Decision makers' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
    ],
    sections: [
      { title: 'Key Messages', notes: 'Three to five bullet points.', share: 0.1 },
      { title: 'The Issue', notes: 'Why it matters now, with data.', share: 0.2 },
      { title: 'Evidence', notes: 'What research shows.', share: 0.25 },
      { title: 'Policy Options', notes: 'Options table with costs and trade-offs.', share: 0.25 },
      { title: 'Recommendations', notes: 'Specific, actionable.', share: 0.2 },
    ],
    guidance: 'Short paragraphs. Plain language. Recommendations must name who acts.',
  },
  {
    id: 'grant-proposal',
    name: 'Grant Proposal',
    category: 'public',
    description: 'Need statement, objectives, methods, evaluation, budget and sustainability.',
    icon: 'HandHeart',
    themeId: 'modern-corporate',
    citationStyle: 'apa',
    tone: 'persuasive',
    targetWords: 4500,
    fields: [
      { key: 'organization', label: 'Applicant organisation' },
      { key: 'funder', label: 'Funder & programme' },
      { key: 'amount', label: 'Amount requested' },
    ],
    sections: [
      { title: 'Executive Summary', notes: 'Need, project, amount, impact.', share: 0.08, unnumbered: true },
      { title: 'Statement of Need', notes: 'Evidence of the problem.', share: 0.17 },
      { title: 'Goals and Objectives', notes: 'SMART objectives.', share: 0.12 },
      { title: 'Project Design and Methods', notes: 'Activities and rationale.', share: 0.22 },
      { title: 'Evaluation Plan', notes: 'Indicators and measurement table.', share: 0.12 },
      { title: 'Organisational Capacity', notes: 'Track record.', share: 0.09 },
      { title: 'Budget and Justification', notes: 'Itemised table.', share: 0.12 },
      { title: 'Sustainability', notes: 'Life after the grant.', share: 0.08 },
    ],
    guidance: 'Align language with the funder’s priorities. Objectives must be SMART.',
  },
  {
    id: 'ngo-impact',
    name: 'Impact / NGO Report',
    category: 'public',
    description: 'Programme outcomes, beneficiary stories, metrics and lessons learned.',
    icon: 'Globe',
    themeId: 'elegant-serif',
    citationStyle: 'apa',
    tone: 'friendly',
    targetWords: 3500,
    fields: [
      { key: 'organization', label: 'Organisation' },
      { key: 'programme', label: 'Programme & period' },
      { key: 'metrics', label: 'Outcome metrics', multiline: true },
    ],
    sections: [
      { title: 'Overview', notes: 'Mission and the year at a glance.', share: 0.12 },
      { title: 'Programmes and Activities', notes: 'What was delivered.', share: 0.22 },
      { title: 'Outcomes and Impact', notes: 'Metrics table and analysis.', share: 0.26 },
      { title: 'Stories from the Field', notes: 'Two or three short, human stories.', share: 0.15 },
      { title: 'Lessons Learned', notes: 'Honest reflection.', share: 0.12 },
      { title: 'Looking Ahead', notes: 'Plans and the support needed.', share: 0.13 },
    ],
    guidance: 'Pair every number with its human meaning. Respect beneficiaries’ dignity.',
  },

  // General
  {
    id: 'meeting-minutes',
    name: 'Meeting Minutes',
    category: 'general',
    description: 'Attendees, agenda, discussion, decisions and action items.',
    icon: 'UsersThree',
    themeId: 'swiss-minimal',
    citationStyle: 'apa',
    tone: 'neutral',
    targetWords: 1200,
    includeToc: false,
    fields: [
      { key: 'meeting', label: 'Meeting & date' },
      { key: 'attendees', label: 'Attendees', multiline: true },
      { key: 'notes', label: 'Raw notes', multiline: true },
    ],
    sections: [
      { title: 'Attendance', notes: 'Present, apologies.', share: 0.1 },
      { title: 'Agenda', notes: 'Numbered.', share: 0.1 },
      { title: 'Discussion', notes: 'Per agenda item, concise.', share: 0.45 },
      { title: 'Decisions', notes: 'Bulleted.', share: 0.15 },
      { title: 'Action Items', notes: 'Action / owner / due table.', share: 0.2 },
    ],
    guidance: 'Neutral, past tense, concise. Record decisions precisely.',
  },
  {
    id: 'essay',
    name: 'Essay / Article',
    category: 'general',
    description: 'A well-argued long-form essay or article with a strong through-line.',
    icon: 'PenNib',
    themeId: 'elegant-serif',
    citationStyle: 'mla',
    tone: 'analytical',
    targetWords: 3000,
    includeToc: false,
    fields: [{ key: 'thesis', label: 'Thesis / angle', multiline: true }],
    sections: [
      { title: 'Introduction', notes: 'Hook, context, thesis.', share: 0.15 },
      { title: 'First Argument', notes: 'Claim, evidence, analysis.', share: 0.25 },
      { title: 'Second Argument', notes: 'Claim, evidence, analysis.', share: 0.25 },
      { title: 'Counterargument and Rebuttal', notes: 'Strongest objection, answered.', share: 0.2 },
      { title: 'Conclusion', notes: 'Synthesis and significance.', share: 0.15 },
    ],
    guidance: 'Rename the argument sections to their real claims. Vary paragraph openings.',
  },
  {
    id: 'custom',
    name: 'Custom Report',
    category: 'general',
    description: 'Describe any document; the AI designs the structure for you.',
    icon: 'Sparkle',
    themeId: 'modern-corporate',
    citationStyle: 'apa',
    tone: 'neutral',
    targetWords: 4000,
    fields: [],
    sections: [],
    guidance: 'Design the most appropriate professional structure for the document described in the brief.',
  },
];

export function getReportType(id: string): ReportTypeDef {
  return REPORT_TYPES.find((type) => type.id === id) ?? REPORT_TYPES[REPORT_TYPES.length - 1];
}

export function searchReportTypes(query: string): ReportTypeDef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return REPORT_TYPES;
  return REPORT_TYPES.filter((type) => {
    const haystack = `${type.name} ${type.description} ${type.category}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

let sectionCounter = 0;
export function newSectionId(): string {
  sectionCounter += 1;
  return `sec-${Date.now().toString(36)}-${sectionCounter.toString(36)}`;
}

/** The type's default outline, with word targets spread by share. */
export function defaultOutline(type: ReportTypeDef, targetWords: number): OutlineSection[] {
  const total = type.sections.reduce((sum, section) => sum + section.share, 0) || 1;
  return type.sections.map((section) => ({
    id: newSectionId(),
    title: section.title,
    notes: section.notes,
    targetWords: Math.max(80, Math.round(((section.share / total) * targetWords) / 10) * 10),
    subsections: section.subsections ? [...section.subsections] : [],
    unnumbered: section.unnumbered,
  }));
}

/** Rough page count at ~420 words a page with headings, tables and white space. */
export const wordsToPages = (words: number): number => Math.max(1, Math.round(words / 420));
export const pagesToWords = (pages: number): number => Math.max(300, Math.round(pages * 420));
