import type { PatentLifecycleState } from './patent-lifecycle'

export type KnowledgeTopic =
  | 'provisional_filing'
  | 'nonprovisional_filing'
  | 'claims'
  | 'prior_art'
  | 'office_actions'
  | 'continuation_strategy'
  | 'maintenance'
  | 'entity_status'
  | 'inventors'
  | 'assignments'
  | 'pct'
  | 'ids'
  | 'examination'
  | 'post_grant'

export interface KnowledgeChunk {
  id: string
  topic: KnowledgeTopic
  title: string
  content: string
  lifecycle_states: PatentLifecycleState[]
  tags: string[]
  urgency_boost: boolean
}

export const PATTIE_KNOWLEDGE: KnowledgeChunk[] = [
  // ── PROVISIONAL FILING ────────────────────────────────────────────────────

  {
    id: 'prov_001',
    topic: 'provisional_filing',
    title: 'What a provisional patent application is and isn\'t',
    content: 'A provisional application establishes a priority date but never becomes a patent by itself. It gives 12 months to file a corresponding non-provisional. The provisional is never examined by the USPTO. It establishes "patent pending" status and buys time to develop the invention, find investors, or assess commercial viability. Crucially, a provisional that is never followed by a non-provisional simply expires — it has no direct legal effect beyond the priority date it creates.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'FILED_PROVISIONAL'],
    tags: ['provisional', 'priority date', 'patent pending', '12 months'],
    urgency_boost: false,
  },

  {
    id: 'prov_002',
    topic: 'provisional_filing',
    title: 'The 12-month conversion deadline (critical)',
    content: 'The non-provisional must be filed within exactly 12 months of the provisional filing date — not one day later. This is a statutory bar under 35 USC 119(e). There is no USPTO extension for this deadline. Missing it means the provisional expires and the priority date is permanently lost. Any public disclosure of the invention during the gap between the provisional expiry and a new filing becomes prior art against the new application. There is no cure — once the deadline passes, the priority date is gone.',
    lifecycle_states: ['PROVISIONAL_ACTIVE', 'CONVERTING'],
    tags: ['conversion deadline', '12 months', 'statutory bar', 'priority date', '119(e)'],
    urgency_boost: true,
  },

  {
    id: 'prov_003',
    topic: 'provisional_filing',
    title: 'What must be in a provisional to support later claims',
    content: 'A provisional must adequately describe the invention in enough detail to support the claims that will be filed in the non-provisional. If the non-provisional claims cover something not disclosed in the provisional, those claims do not get the provisional\'s priority date — they effectively have a new filing date. Drawings, even informal ones, are strongly recommended. The best provisionals describe the invention thoroughly enough that a skilled engineer could build it from the description alone.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'FILED_PROVISIONAL', 'PROVISIONAL_ACTIVE'],
    tags: ['written description', 'support', 'enablement', 'drawings', 'claims'],
    urgency_boost: false,
  },

  // ── CLAIMS ────────────────────────────────────────────────────────────────

  {
    id: 'claims_001',
    topic: 'claims',
    title: 'Independent vs. dependent claims',
    content: 'An independent claim stands alone and defines the broadest version of the invention. A dependent claim refers back to another claim and adds additional limitations, making it narrower. Broader independent claims are harder to get but more valuable — they cover more ground and are harder to design around. A good claim set has 1–3 independent claims covering the core invention from different angles (method, system, device), with dependent claims adding specific embodiments. The independent claims set the outer boundary of protection; dependent claims provide fallback positions if the independent claims are narrowed during prosecution.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE'],
    tags: ['independent claim', 'dependent claim', 'claim scope', 'claim drafting'],
    urgency_boost: false,
  },

  {
    id: 'claims_002',
    topic: 'claims',
    title: 'Claim structure and the one-sentence rule',
    content: 'Each claim must be a single sentence. Independent claims typically follow the pattern: "[Preamble], comprising: [element A]; [element B]; wherein [relationship]." The word "comprising" is open-ended (other elements may be present). "Consisting of" is closed (no additional elements). Every element recited in a claim must appear in the specification. Never use "and/or" in a claim — it creates indefiniteness under 35 USC 112(b) and will draw an objection. Avoid relative terms like "large," "small," or "about" unless they are defined in the specification.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE'],
    tags: ['claim drafting', '112(b)', 'indefiniteness', 'comprising', 'preamble'],
    urgency_boost: false,
  },

  {
    id: 'claims_003',
    topic: 'claims',
    title: '35 USC 101: Patent-eligible subject matter',
    content: 'To be patentable, an invention must be a process, machine, manufacture, or composition of matter. Abstract ideas, laws of nature, and natural phenomena are not patentable. Software and business method claims are frequently rejected under 101. The Alice/Mayo two-step test applies: (1) is the claim directed to an abstract idea or law of nature? (2) if so, does it add "something more" — a specific technical implementation that amounts to significantly more than the abstract idea itself? Claims should be written to emphasize the concrete technical means and measurable improvements, not the abstract result. Ex Parte Desjardins (2023) provides important guidance for AI/ML patents: claims that recite a specific technical architecture with measurable improvements to model performance survive 101.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'EXAMINATION', 'OFFICE_ACTION'],
    tags: ['101', 'Alice', 'Mayo', 'abstract idea', 'patent eligibility', 'software patents'],
    urgency_boost: false,
  },

  {
    id: 'claims_004',
    topic: 'claims',
    title: '35 USC 102: Novelty',
    content: 'A claim is anticipated (not novel) under 35 USC 102 if every element of the claim is disclosed in a single prior art reference. If one document shows exactly what you claimed, the claim is invalid. The solution is to identify what makes your invention different from that reference and add that distinguishing element to the claim — but the distinguishing element must be supported by the specification. Under AIA, prior art includes any disclosure made before the filing date, with a one-year grace period for the inventor\'s own disclosures.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'EXAMINATION', 'OFFICE_ACTION'],
    tags: ['102', 'novelty', 'anticipation', 'prior art', 'prior art reference'],
    urgency_boost: false,
  },

  {
    id: 'claims_005',
    topic: 'claims',
    title: '35 USC 103: Obviousness',
    content: 'Even if no single reference anticipates a claim, a combination of references might render it obvious under 35 USC 103. The examiner must show (1) each element of the claim exists somewhere in the prior art, and (2) a person of ordinary skill in the art would have been motivated to combine those elements with a reasonable expectation of success. The KSR decision expanded the obviousness analysis beyond the old TSM (teaching-suggestion-motivation) test. To overcome a 103 rejection: argue the prior art teaches away from the combination, that the combination would not have worked as the examiner suggests, or that the claimed combination produces unexpected results not predictable from the prior art.',
    lifecycle_states: ['EXAMINATION', 'OFFICE_ACTION'],
    tags: ['103', 'obviousness', 'KSR', 'TSM test', 'prior art combination', 'unexpected results'],
    urgency_boost: false,
  },

  {
    id: 'claims_006',
    topic: 'claims',
    title: '35 USC 112: Written description and enablement',
    content: 'The specification must satisfy two independent requirements under 35 USC 112(a): (1) enablement — a person of ordinary skill in the art must be able to make and use the claimed invention without undue experimentation; (2) written description — the specification must demonstrate that the inventor actually possessed the claimed invention at the time of filing. Claims broader than what the specification describes will be rejected under 112(a). Claims that are ambiguous or unclear will be rejected under 112(b) for indefiniteness. The gold standard: every claim element should appear in the specification with sufficient detail that it is clear what that element means and how it functions.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'EXAMINATION', 'OFFICE_ACTION'],
    tags: ['112', 'written description', 'enablement', 'indefiniteness', 'specification support'],
    urgency_boost: false,
  },

  // ── IDS ───────────────────────────────────────────────────────────────────

  {
    id: 'ids_001',
    topic: 'ids',
    title: 'The duty of disclosure',
    content: 'Everyone involved in filing a patent application — inventors, attorneys, and anyone substantively involved in prosecution — has a duty to disclose all information known to be material to patentability. This duty arises under 37 CFR 1.56 and is not optional. Intentional failure to disclose known material prior art is inequitable conduct, which can render the entire patent unenforceable — even if the patent would have been valid had the prior art been disclosed. When in doubt about whether something is material, disclose it. The cost of an extra IDS entry is trivial compared to the risk of unenforceability.',
    lifecycle_states: ['READY_TO_FILE', 'FILED_PROVISIONAL', 'PROVISIONAL_ACTIVE', 'FILED_NONPROVISIONAL', 'EXAMINATION'],
    tags: ['IDS', 'duty of disclosure', 'inequitable conduct', 'materiality', 'candor'],
    urgency_boost: false,
  },

  {
    id: 'ids_002',
    topic: 'ids',
    title: 'When to file an IDS and what goes in it',
    content: 'An IDS lists patents, patent applications, and non-patent literature (articles, websites, product manuals, conference papers) that the applicant is aware of. File the first IDS with the non-provisional application or within 3 months of filing to avoid fees. An IDS filed before the first Office Action costs nothing extra. Filed after first action but before final: $280 small entity fee (verify current amount at USPTO.gov). Filed after final rejection or Notice of Allowance: additional certification and fee requirements apply. The examiner reviews each reference and marks it as considered — this is important for establishing the patent\'s prosecution history.',
    lifecycle_states: ['READY_TO_FILE', 'FILED_NONPROVISIONAL', 'EXAMINATION'],
    tags: ['IDS', 'prior art', 'SB/08', 'filing timing', 'fees', 'non-patent literature'],
    urgency_boost: false,
  },

  // ── OFFICE ACTIONS ────────────────────────────────────────────────────────

  {
    id: 'oa_001',
    topic: 'office_actions',
    title: 'What a non-final Office Action means',
    content: 'A non-final Office Action is the examiner\'s first substantive response to the application. It lists all rejections (statutory grounds under 101, 102, 103, 112) and objections (formal issues). The applicant has 3 months to respond without extension fees (extendable to 6 months with escalating fees — verify current fee schedule at USPTO.gov). A response must address every rejection — either amend the claims to overcome it, argue why the rejection is legally wrong, or do both. Ignoring any rejection means it will be made final in the next action. Every argument made in response becomes part of the prosecution history and may affect claim scope in litigation.',
    lifecycle_states: ['OFFICE_ACTION'],
    tags: ['office action', 'non-final', '3 months', 'response', 'amendment', 'rejection'],
    urgency_boost: true,
  },

  {
    id: 'oa_002',
    topic: 'office_actions',
    title: 'What a final Office Action means and the options',
    content: 'A final Office Action means the examiner has considered the applicant\'s response and maintains the rejections. Options: (1) File an RCE (Request for Continued Examination) — reopens prosecution and allows a new round of amendments; small entity fee approximately $1,320 (verify at USPTO.gov). (2) Appeal to the Patent Trial and Appeal Board (PTAB) — expensive and slow (18–24 months) but the right choice for a strong legal position. (3) File a continuation application to pursue different or narrower claims. (4) File an after-final amendment — the examiner is not required to enter it, but may do so if it places the application in condition for allowance. (5) Abandon the application. Time from final OA to action: typically 2 months for response without fees.',
    lifecycle_states: ['FINAL_REJECTION'],
    tags: ['final OA', 'RCE', 'appeal', 'PTAB', 'continuation', 'after-final', 'abandon'],
    urgency_boost: true,
  },

  // ── CONTINUATION STRATEGY ─────────────────────────────────────────────────

  {
    id: 'cont_001',
    topic: 'continuation_strategy',
    title: 'Continuation, continuation-in-part, and divisional applications',
    content: 'A continuation claims priority to a parent application and pursues different claims on the same disclosure — useful for pursuing narrower claims after the parent is allowed, or for a second pass at the examiner. A continuation-in-part (CIP) adds new matter not in the parent; the new matter gets a later priority date. A divisional is required when an examiner restricts an application to one of multiple independent inventions — the other inventions must be pursued separately. Continuations must be filed while the parent is still pending (before it issues or is abandoned). Filing continuations is a core portfolio strategy: the parent establishes the priority date; continuations expand or refine protection as the product evolves and competitors emerge.',
    lifecycle_states: ['EXAMINATION', 'OFFICE_ACTION', 'FINAL_REJECTION', 'ALLOWANCE', 'GRANTED'],
    tags: ['continuation', 'CIP', 'divisional', 'portfolio', 'prosecution strategy', 'new matter'],
    urgency_boost: false,
  },

  // ── ENTITY STATUS ─────────────────────────────────────────────────────────

  {
    id: 'entity_001',
    topic: 'entity_status',
    title: 'Small entity vs. micro entity qualification',
    content: 'Small entity status (60% USPTO fee discount as of 2023 fee schedule — verify at USPTO.gov) requires that all rights are held by: an individual inventor, a small business with fewer than 500 employees, or a nonprofit. If any rights are assigned or obligated to be assigned to a large entity, small entity status is lost. Micro entity status (80% discount) requires small entity qualification PLUS: (1) no inventor has been named on more than 4 previously filed US patent applications (provisionals do not count toward this limit); AND (2) the inventor\'s gross income in the prior calendar year did not exceed 3x the median household US income (approximately $271,900 for 2025 — verify annually at USPTO.gov); AND (3) no rights have been assigned to an entity exceeding that income threshold. Note: having a prior granted patent does NOT by itself disqualify from micro entity — the limit is 4 prior non-provisional applications filed, not grants. If an inventor has filed exactly 4 prior non-provisionals and this is the 5th, micro entity is not available.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE'],
    tags: ['small entity', 'micro entity', 'fees', 'discount', 'qualification', '500 employees'],
    urgency_boost: false,
  },

  {
    id: 'entity_002',
    topic: 'entity_status',
    title: 'Loss of entity status and obligations',
    content: 'Entity status must be reassessed at each fee payment. If circumstances change — a startup is acquired by a large company, an inventor\'s income exceeds the micro entity threshold, or rights are assigned to a large entity — the status must be updated before the next fee payment. Paying fees at a reduced rate when not qualified requires a corrective payment (the fee deficiency) plus a surcharge. Knowingly paying reduced fees when not entitled is a serious matter that can affect patent enforceability. When entity status changes, it changes for all future fee payments in that application.',
    lifecycle_states: ['FILED_NONPROVISIONAL', 'EXAMINATION', 'GRANTED', 'MAINTENANCE_DUE'],
    tags: ['entity status', 'fee payment', 'large entity', 'status change', 'underpayment'],
    urgency_boost: false,
  },

  // ── INVENTORS ─────────────────────────────────────────────────────────────

  {
    id: 'inv_001',
    topic: 'inventors',
    title: 'Who must be named as an inventor',
    content: 'An inventor is anyone who contributed to the conception of at least one claim that will be in the application. Conception means having the definite and permanent idea of the complete and operative invention. People who only built, tested, or reduced the invention to practice without contributing to the conception of any claim are NOT inventors. People who only suggested the problem to solve, without contributing to the solution, are NOT inventors. Incorrectly naming inventors (misjoinder) or omitting inventors (nonjoinder) can render a patent unenforceable if done with deceptive intent. The inventor list should match the claims — if a claim is cancelled during prosecution, inventorship may need to be corrected. When in doubt, consult a patent attorney before filing.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE'],
    tags: ['inventorship', 'conception', 'claims', 'AIA/01', 'misjoinder', 'nonjoinder'],
    urgency_boost: false,
  },

  {
    id: 'inv_002',
    topic: 'inventors',
    title: 'The inventor declaration requirement (AIA/01)',
    content: 'Each inventor must sign an AIA/01 declaration (or combined ADS with declaration) before the non-provisional application can be examined or issued. The declaration is a sworn statement that the inventor believes they are the original inventor of the claimed invention. For applications with remote or multiple inventors, collecting signatures early is strongly recommended — delays at allowance are costly in both time and fees. S-signatures (/First Last/) are acceptable under 37 CFR 1.4(d)(2) and can be collected electronically. The declaration can be submitted with the application or within the time period set by the Office, but the application will not be granted until all declarations are received.',
    lifecycle_states: ['READY_TO_FILE', 'FILED_NONPROVISIONAL'],
    tags: ['AIA/01', 'declaration', 'signature', 'oath', 'inventor', 'sb0015a'],
    urgency_boost: true,
  },

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────

  {
    id: 'assign_001',
    topic: 'assignments',
    title: 'Recording an assignment with the USPTO',
    content: 'An assignment transfers ownership of a patent application from the inventor(s) to another party (typically a company). Assignments must be in writing and signed by the assignor. They should be recorded with the USPTO Assignment Division (assignment.uspto.gov) within 3 months of execution to establish priority against subsequent purchasers. An unrecorded assignment is valid between the parties but may not be enforceable against a bona fide purchaser without notice. For patent applications where rights are being assigned to a business entity (e.g., an LLC), record the assignment before the patent issues — recording after grant still works but creates a gap in the public record.',
    lifecycle_states: ['READY_TO_FILE', 'FILED_PROVISIONAL', 'PROVISIONAL_ACTIVE', 'FILED_NONPROVISIONAL'],
    tags: ['assignment', 'recordation', 'ownership', 'assignee', 'chain of title'],
    urgency_boost: false,
  },

  // ── MAINTENANCE ───────────────────────────────────────────────────────────

  {
    id: 'maint_001',
    topic: 'maintenance',
    title: 'Post-grant maintenance fee schedule',
    content: 'Utility patents require maintenance fees to stay in force at 3.5, 7.5, and 11.5 years from the date of grant. Small entity fees (2025, verify at USPTO.gov): approximately $800 / $1,800 / $3,700. There is a 6-month grace period after each due date with a late surcharge. After the grace period, the patent lapses. A lapsed patent can be revived with a petition showing the delay was unintentional, but revival is not guaranteed, requires fees, and delays the maintenance clock. Design patents do not require maintenance fees. Plant patents do not require maintenance fees.',
    lifecycle_states: ['GRANTED', 'MAINTENANCE_DUE'],
    tags: ['maintenance fees', '3.5 years', '7.5 years', '11.5 years', 'lapse', 'revival', 'surcharge'],
    urgency_boost: true,
  },

  // ── ADDITIONAL CHUNKS ─────────────────────────────────────────────────────

  {
    id: 'nonp_001',
    topic: 'nonprovisional_filing',
    title: 'What a non-provisional application requires',
    content: 'A non-provisional utility patent application requires: (1) a specification including a written description and an enabling disclosure; (2) at least one claim; (3) an abstract of no more than 150 words; (4) drawings where necessary to understand the invention; (5) an inventor\'s declaration (AIA/01); (6) an application data sheet (ADS); and (7) payment of filing, search, and examination fees. The USPTO assigns a filing date when it receives the specification (including at least one claim) and the basic filing fee. Missing the abstract or drawings does not delay the filing date but will require a corrective filing.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'CONVERTING'],
    tags: ['nonprovisional', 'filing requirements', 'abstract', 'specification', 'filing date'],
    urgency_boost: false,
  },

  {
    id: 'exam_001',
    topic: 'examination',
    title: 'What happens during USPTO examination',
    content: 'After filing, a non-provisional application is assigned to an art unit and a patent examiner. The examiner conducts a prior art search, reviews the claims for compliance with 35 USC 101, 102, 103, and 112, and issues an Office Action. Total pendency from filing to first action averages 16–24 months (varies by technology area — check the USPTO\'s Patent Pending Report for current averages). Total time to grant averages 24–36 months. Expedited examination is available via Track One (prioritized examination, additional fee) which targets a final disposition within 12 months. // TODO: verify current Track One fee and pendency data at USPTO.gov',
    lifecycle_states: ['FILED_NONPROVISIONAL', 'EXAMINATION'],
    tags: ['examination', 'art unit', 'pendency', 'Track One', 'examiner', 'prior art search'],
    urgency_boost: false,
  },

  {
    id: 'pct_001',
    topic: 'pct',
    title: 'PCT applications and international filing',
    content: 'A PCT (Patent Cooperation Treaty) application is a single international filing that preserves the right to seek patent protection in over 150 countries. It must be filed within 12 months of the priority date (same deadline as a US non-provisional). The PCT process has two phases: the international phase (PCT application, international search report, optional preliminary examination) and the national/regional phase (entering individual countries, typically by 30 months from priority date). A PCT application does not result in an "international patent" — patents are still granted country by country. The PCT buys time and defers national-phase costs while keeping international options open.',
    lifecycle_states: ['PROVISIONAL_ACTIVE', 'CONVERTING', 'FILED_NONPROVISIONAL'],
    tags: ['PCT', 'international filing', 'national phase', '30 months', 'WIPO', 'foreign filing'],
    urgency_boost: false,
  },

  {
    id: 'prior_art_001',
    topic: 'prior_art',
    title: 'What counts as prior art under AIA',
    content: 'Under the America Invents Act (AIA, effective March 2013), the US moved to a first-inventor-to-file system. Prior art under 35 USC 102(a)(1) includes any disclosure — patent, publication, public use, sale, or other disclosure — made before the effective filing date of the claimed invention. The key exception (102(b)(1)): disclosures made 1 year or less before the filing date that were made by the inventor, or by others who obtained the information from the inventor, do not count as prior art. This is the inventor\'s "grace period." Disclosures by third parties more than 1 year before filing ARE prior art with no exception. Document all public disclosures carefully and keep a timeline.',
    lifecycle_states: ['DRAFT', 'READY_TO_FILE', 'FILED_NONPROVISIONAL', 'EXAMINATION'],
    tags: ['prior art', 'AIA', 'grace period', 'first to file', '102(a)', '102(b)', 'disclosure'],
    urgency_boost: false,
  },

  {
    id: 'post_grant_001',
    topic: 'post_grant',
    title: 'Post-grant proceedings: IPR, PGR, and Ex Parte Reexamination',
    content: 'After a patent grants, its validity can be challenged through several USPTO proceedings. Inter Partes Review (IPR): a third party can petition the PTAB to cancel claims based on prior art patents or publications; must be filed within 1 year of being served with an infringement suit. Post-Grant Review (PGR): broader challenge on any validity ground; must be filed within 9 months of grant. Ex Parte Reexamination: the patent owner or a third party can request reexamination based on prior art; less adversarial than IPR. These proceedings are significantly less expensive than district court litigation and are frequently used by accused infringers as a defense strategy.',
    lifecycle_states: ['GRANTED', 'MAINTENANCE_DUE'],
    tags: ['IPR', 'PGR', 'reexamination', 'PTAB', 'validity challenge', 'post-grant'],
    urgency_boost: false,
  },
]
