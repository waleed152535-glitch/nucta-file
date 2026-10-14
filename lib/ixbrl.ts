/**
 * Generates iXBRL accounts and a Corporation Tax computation.
 *
 * iXBRL is ordinary HTML with XBRL facts embedded in it, so one file is both
 * readable by a person and machine-readable by HMRC. Every figure carries a
 * taxonomy element name, a context (who and when) and a unit.
 *
 * Scope here is deliberately narrow: FRS 105 micro-entity accounts for a
 * single-trade company. That covers almost every Amazon-seller formation and
 * avoids the bulk of the taxonomy.
 *
 * IMPORTANT: element names follow the FRC's published taxonomy, but the exact
 * names and the taxonomy version must be checked against the schema HMRC
 * gives registered developers. Nothing here has been validated against their
 * test service yet.
 */

/** The taxonomy this is written against. Bump when HMRC accepts a newer one. */
export const TAXONOMY_VERSION = "2023-01-01";

/**
 * Which taxonomy the accounts are tagged against.
 *
 * `schemaRef` is a real URL that HMRC's validator fetches. If it can't be
 * obtained, every element from that taxonomy becomes unrecognised and the
 * errors look like tagging mistakes when the only fault is a bad address.
 *
 * Every value here is read out of the FRC's own taxonomy package rather than
 * inferred, and two things about it are easy to get wrong.
 *
 * First, the schemes differ. The entry point is addressed over **https**,
 * while the namespaces inside the schemas are **http**. They look like the
 * same address and are not: a namespace is compared as a literal string and
 * never fetched, so one spelling of each is correct and the other silently
 * fails. Mixing them up gets the schema loaded but every fact refused, which
 * reads like a tagging fault and isn't one.
 *
 * Second, there is no FRS 105 entry point. The FRC suite ships FRS-101,
 * FRS-102 and IFRS only, so micro-entity accounts under FRS 105 are tagged
 * against the FRS-102 entry point. Pointing at an invented FRS-105 address
 * produces "an error in the Taxonomy reference".
 *
 * FRC 2023 covers periods ending to 31 March 2026; FRC 2024 to 31 March 2027.
 */
export interface AccountsTaxonomy {
  key: string;
  label: string;
  schemaRef: string;
  core: string;
  bus: string;
}

export const ACCOUNT_TAXONOMIES: AccountsTaxonomy[] = [
  {
    key: "frs102-2023",
    label: "FRS 102 (FRC 2023)",
    schemaRef: "https://xbrl.frc.org.uk/FRS-102/2023-01-01/FRS-102-2023-01-01.xsd",
    core: "http://xbrl.frc.org.uk/fr/2023-01-01/core",
    bus: "http://xbrl.frc.org.uk/cd/2023-01-01/business",
  },
  {
    key: "frs101-2023",
    label: "FRS 101 (FRC 2023)",
    schemaRef: "https://xbrl.frc.org.uk/FRS-101/2023-01-01/FRS-101-2023-01-01.xsd",
    core: "http://xbrl.frc.org.uk/fr/2023-01-01/core",
    bus: "http://xbrl.frc.org.uk/cd/2023-01-01/business",
  },
  {
    key: "core-2023",
    label: "Core only (FRC 2023)",
    schemaRef: "https://xbrl.frc.org.uk/fr/2023-01-01/core/frc-core-2023-01-01.xsd",
    core: "http://xbrl.frc.org.uk/fr/2023-01-01/core",
    bus: "http://xbrl.frc.org.uk/cd/2023-01-01/business",
  },
  {
    key: "frs102-2024",
    label: "FRS 102 (FRC 2024)",
    schemaRef: "https://xbrl.frc.org.uk/FRS-102/2024-01-01/FRS-102-2024-01-01.xsd",
    core: "http://xbrl.frc.org.uk/fr/2024-01-01/core",
    bus: "http://xbrl.frc.org.uk/cd/2024-01-01/business",
  },
];

/**
 * Which taxonomy the computation is tagged against.
 *
 * This is the least certain part of the whole submission. HMRC publish the CT
 * computational taxonomies only as zip packages, and neither the accepted-
 * taxonomies list nor the computations format document gives the entry point
 * URL. Each candidate below is a reading of the naming conventions, not a
 * documented fact, which is why the computation can be left off entirely
 * while the accounts are proved first.
 */
export interface CompTaxonomy {
  key: string;
  label: string;
  schemaRef: string;
  ct: string;
}

export const COMP_TAXONOMIES: CompTaxonomy[] = [
  {
    key: "ct-2024",
    label: "HMRC CT computations (2024)",
    schemaRef: "http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/ct-comp-2024.xsd",
    ct: "http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01",
  },
  {
    key: "ct-2023",
    label: "HMRC CT computations (2023)",
    schemaRef: "http://www.hmrc.gov.uk/schemas/ct/comp/2023-01-01/ct-comp-2023.xsd",
    ct: "http://www.hmrc.gov.uk/schemas/ct/comp/2023-01-01",
  },
];

export const NS = {
  ix: "http://www.xbrl.org/2013/inlineXBRL",
  /**
   * Transformation Registry 2.
   *
   * HMRC's processor accepts only Registry 1 (2010-04-20) and Registry 2
   * (2011-07-31). The later registries exist, but HMRC's iXBRL processor
   * doesn't know them, and a format from one is refused as undefined. Note
   * that "numdotdecimal" belongs to Registry 3 onwards; the Registry 2 name
   * for a comma-grouped, dot-decimal number is "numcommadot".
   */
  ixt: "http://www.xbrl.org/inlineXBRL/transformation/2011-07-31",
  xbrli: "http://www.xbrl.org/2003/instance",
  xbrldi: "http://xbrl.org/2006/xbrldi",
  xlink: "http://www.w3.org/1999/xlink",
  link: "http://www.xbrl.org/2003/linkbase",
  iso4217: "http://www.xbrl.org/2003/iso4217",
  core: `http://xbrl.frc.org.uk/fr/${TAXONOMY_VERSION}/core`,
  bus: `http://xbrl.frc.org.uk/cd/${TAXONOMY_VERSION}/business`,
  ct: `http://www.hmrc.gov.uk/schemas/ct/comp/${TAXONOMY_VERSION}`,
};

export interface AccountsInput {
  companyName: string;
  companyNo: string;
  /** The Corporation Tax UTR, which the computation must carry. */
  utr?: string;
  periodFrom: string;
  periodTo: string;
  priorFrom?: string;
  priorTo?: string;
  dormant: boolean;

  // Profit and loss, from the ledger
  turnover: number;
  costOfSales: number;
  grossProfit: number;
  adminExpenses: number;
  staffCosts: number;
  otherIncome: number;
  profitBeforeTax: number;
  taxCharge: number;

  // Balance sheet at the period end, entered by hand
  shareCapitalNotPaid: number;
  fixedAssets: number;
  currentAssets: number;
  prepayments: number;
  creditorsWithin: number;
  creditorsAfter: number;
  provisions: number;
  accruals: number;
  shareCapital: number;
  employees: number;

  // Last year, for the comparative column
  pyFixedAssets?: number;
  pyCurrentAssets?: number;
  pyCreditorsWithin?: number;
  pyCreditorsAfter?: number;
  pyNetAssets?: number;
  pyTurnover?: number;
  pyProfit?: number;
  pyEmployees?: number;

  approvedBy: string;
  approvedOn: string;
  /** Which accounts taxonomy to reference. Defaults to FRS 105, FRC 2023. */
  taxonomy?: AccountsTaxonomy;
  /** Which computation taxonomy to reference. */
  compTaxonomy?: CompTaxonomy;

  /**
   * The facts HMRC require on every set of accounts, beyond the figures.
   *
   * These are the "cover page" of a filing: which standards were applied,
   * whether the company traded, its legal form, who signed and when. HMRC
   * list each one by name if it is missing, so none is optional.
   */
  principalActivities?: string;
  /**
   * Trading status.
   *
   * "trading" is the taxonomy's default, and XBRL forbids stating a
   * dimension's default member explicitly — a context carrying it is invalid,
   * because the default is what absence already means. So a trading company
   * gets the plain period context with no trading dimension at all, and only
   * the exceptions name a member.
   */
  tradingStatus?: "trading" | "neverTraded" | "ceased";
  /** Members read from the FRC taxonomy; see FIXED_MEMBERS. */
  accountingStandard?: "FRS102" | "FRS101" | "FullIFRS" | "OtherStandards";
  accountsType?: "FullAccounts" | "AbridgedAccounts" | "FilletedAccounts" | "SmallCompaniesRegimeForAccounts";
  accountsStatus?: "AuditExemptWithAccountantsReport" | "Audited";
  legalForm?: "PrivateLimitedCompanyLtd" | "CompanyLimitedByGuarantee" | "LimitedLiabilityPartnershipLLP";
}

const esc = (v: string): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const n2 = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const show = (v: number): string =>
  Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * A number as XBRL itself accepts it: digits, an optional decimal point, and
 * nothing else. No grouping separators.
 */
const plain = (v: number, decimals = 0): string =>
  decimals > 0 ? Math.abs(v).toFixed(decimals) : String(Math.round(Math.abs(v)));

/** Accounts show a negative in brackets rather than with a minus sign. */
const shown = (v: number): string => (v < 0 ? `( ${show(v)} )` : show(v));

/** Dates read better to a client as "31 January 2024" than as an ISO string. */
const longDate = (v: string): string => {
  const d = new Date(String(v ?? "") + "T12:00:00Z");
  return Number.isNaN(d.getTime())
    ? String(v ?? "")
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
};

/**
 * One tagged figure.
 *
 * There is deliberately no `format` attribute. A format names a
 * transformation that turns display text such as "400,000" into the number
 * 400000, and those transformations live in versioned registries that HMRC's
 * processor only partly supports — it rejected both the current registry and
 * an older one as undefined. Inline XBRL allows the attribute to be omitted
 * provided the element's text is already a valid numeric literal, so that is
 * what we write. No registry, nothing to be unsupported.
 *
 * The cost is cosmetic: figures read 400000 rather than 400,000. Worth
 * revisiting once a submission is accepted and a registry can be tested on
 * its own.
 *
 * `negated` marks a value shown as a deduction but held as a positive in the
 * taxonomy — creditors and expenses work that way.
 */
function fact(
  name: string,
  value: number,
  ctx: string,
  opts: { negated?: boolean; decimals?: string } = {},
): string {
  const dp = Number(opts.decimals ?? "0");
  const attrs = [
    `name="${name}"`,
    `contextRef="${ctx}"`,
    `unitRef="GBP"`,
    `decimals="${opts.decimals ?? "0"}"`,
    opts.negated ? `sign="-"` : "",
  ].filter(Boolean).join(" ");
  return `<ix:nonFraction ${attrs}>${plain(value, dp > 0 ? dp : 0)}</ix:nonFraction>`;
}

/**
 * A fact whose meaning comes from a dimension rather than its text.
 *
 * The FRC taxonomy types these as fixedItemType, whose content is restricted
 * to zero characters — the value is carried entirely by the dimension member
 * on the context. So the element is deliberately empty, and lives in the
 * hidden section where an empty element does no harm.
 */
const fixedFact = (name: string, ctx: string): string =>
  `<ix:nonNumeric name="${name}" contextRef="${ctx}"></ix:nonNumeric>`;

/** A date fact, written in the only form XBRL accepts without a transform. */
const dateFact = (name: string, iso: string, ctx: string): string =>
  `<ix:nonNumeric name="${name}" contextRef="${ctx}">${esc(String(iso).slice(0, 10))}</ix:nonNumeric>`;

/** A true/false fact. */
const boolFact = (name: string, value: boolean, ctx: string): string =>
  `<ix:nonNumeric name="${name}" contextRef="${ctx}">${value ? "true" : "false"}</ix:nonNumeric>`;

/**
 * A context carrying one dimension member.
 *
 * Every fixed fact needs its own, because the member is what distinguishes
 * "FRS 102 was applied" from "IFRS was applied" — the fact itself is blank.
 */
function dimContext(
  id: string, companyNo: string, dimension: string, member: string,
  period: { from: string; to: string } | { at: string },
): string {
  const when = "at" in period
    ? `<xbrli:period><xbrli:instant>${esc(period.at)}</xbrli:instant></xbrli:period>`
    : `<xbrli:period><xbrli:startDate>${esc(period.from)}</xbrli:startDate><xbrli:endDate>${esc(period.to)}</xbrli:endDate></xbrli:period>`;
  return `<xbrli:context id="${id}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(companyNo)}</xbrli:identifier>
          <xbrli:segment>
            <xbrldi:explicitMember dimension="${dimension}">${member}</xbrldi:explicitMember>
          </xbrli:segment>
        </xbrli:entity>
        ${when}
      </xbrli:context>`;
}

const textFact = (name: string, value: string, ctx: string): string =>
  `<ix:nonNumeric name="${name}" contextRef="${ctx}">${esc(value)}</ix:nonNumeric>`;

/**
 * A member of a dimension, as it appears inside a context's segment.
 *
 * Most of HMRC's dimensions are "explicit": the member is one of a fixed list
 * of names in the taxonomy, like ct:Company. BusinessNameDimension is "typed"
 * instead — there's no list of permitted trade names, so the value is written
 * out inside the dimension's own domain element.
 */
type DimMember =
  | { dimension: string; member: string }
  | { dimension: string; typedElement: string; value: string };

const memberXml = (m: DimMember): string =>
  "member" in m
    ? `<xbrldi:explicitMember dimension="${m.dimension}">${m.member}</xbrldi:explicitMember>`
    : `<xbrldi:typedMember dimension="${m.dimension}"><${m.typedElement}>${esc(m.value)}</${m.typedElement}></xbrldi:typedMember>`;

/**
 * A context carrying one or more dimension members.
 *
 * HMRC's computational taxonomy puts every reportable concept inside a
 * hypercube, and a hypercube's dimensions have to be answered or the fact is
 * "not dimensionally valid". A dimension with a declared default is answered
 * by saying nothing — stating the default explicitly is itself an error — so
 * only the dimensions without a default are written here.
 */
function multiContext(
  id: string, companyNo: string,
  members: DimMember[],
  period: { from: string; to: string } | { at: string },
): string {
  const when = "at" in period
    ? `<xbrli:period><xbrli:instant>${esc(period.at)}</xbrli:instant></xbrli:period>`
    : `<xbrli:period><xbrli:startDate>${esc(period.from)}</xbrli:startDate><xbrli:endDate>${esc(period.to)}</xbrli:endDate></xbrli:period>`;
  return `<xbrli:context id="${id}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(companyNo)}</xbrli:identifier>
          <xbrli:segment>
            ${members.map(memberXml).join("\n            ")}
          </xbrli:segment>
        </xbrli:entity>
        ${when}
      </xbrli:context>`;
}

/** A row in the accounts, with this year and last year side by side. */
function row(label: string, thisYear: string, lastYear: string, bold = false): string {
  return `<tr${bold ? ' class="b"' : ""}>
      <td class="lbl">${esc(label)}</td>
      <td class="num">${thisYear}</td>
      <td class="num">${lastYear}</td>
    </tr>`;
}

export function buildAccounts(i: AccountsInput): string {
  const tx = i.taxonomy ?? ACCOUNT_TAXONOMIES[0];
  const D = "D";        // the period
  const PD = "PD";      // the period before
  const E = "E";        // the period end
  const PE = "PE";      // the previous end

  const netCurrent = i.currentAssets + i.prepayments - i.creditorsWithin;
  const totalLessCurrent = i.fixedAssets + netCurrent;
  const netAssets = totalLessCurrent - i.creditorsAfter - i.provisions - i.accruals;
  const totalExpenses = i.costOfSales + i.adminExpenses + i.staffCosts;

  const py = (v: number | undefined): string => (v === undefined ? "—" : shown(v));

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="${NS.ix}" xmlns:xbrli="${NS.xbrli}"
      xmlns:xlink="${NS.xlink}" xmlns:link="${NS.link}" xmlns:iso4217="${NS.iso4217}"
      xmlns:xbrldi="${NS.xbrldi}" xmlns:core="${tx.core}" xmlns:bus="${tx.bus}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <title>${esc(i.companyName)} — accounts for the period ended ${esc(longDate(i.periodTo))}</title>
  <style type="text/css">
    body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#111;margin:36px auto;max-width:720px;line-height:1.5;}
    h1{font-size:15pt;margin:0 0 2px;} h2{font-size:12pt;margin:26px 0 8px;border-bottom:1px solid #999;padding-bottom:3px;}
    .sub{font-size:10pt;color:#555;margin-bottom:22px;}
    table{width:100%;border-collapse:collapse;margin-bottom:10px;}
    td{padding:4px 0;vertical-align:top;}
    .lbl{width:62%;} .num{text-align:right;width:19%;font-variant-numeric:tabular-nums;}
    tr.b td{font-weight:bold;border-top:1px solid #bbb;}
    .hd td{font-size:9pt;color:#666;border-bottom:1px solid #999;font-weight:normal;}
    .note{font-size:9.5pt;color:#444;margin:8px 0;}
    .stmt{font-size:9.5pt;color:#333;margin:14px 0;line-height:1.6;}
  </style>
</head>
<body>

<div style="display:none">
  <ix:header>
    <ix:hidden>
      ${textFact("bus:EntityCurrentLegalOrRegisteredName", i.companyName, D)}
      ${textFact("bus:UKCompaniesHouseRegisteredNumber", i.companyNo.trim().toUpperCase(), D)}
      ${textFact("bus:DescriptionPrincipalActivities", i.principalActivities ?? "Online retail", D)}
      ${boolFact("bus:EntityDormantTruefalse", i.dormant, D)}
      ${dateFact("bus:StartDateForPeriodCoveredByReport", i.periodFrom, E)}
      ${dateFact("bus:EndDateForPeriodCoveredByReport", i.periodTo, E)}
      ${dateFact("bus:BalanceSheetDate", i.periodTo, E)}
      ${dateFact("core:DateAuthorisationFinancialStatementsForIssue", i.approvedOn, E)}
      ${fixedFact("bus:AccountingStandardsApplied", "DStd")}
      ${fixedFact("bus:AccountsType", "DType")}
      ${fixedFact("bus:AccountsStatusAuditedOrUnaudited", "DStat")}
      ${fixedFact("bus:EntityTradingStatus", (i.tradingStatus ?? "trading") === "trading" ? D : "DTrade")}
      ${fixedFact("bus:LegalFormEntity", "DLegal")}
      ${fixedFact("core:DirectorSigningFinancialStatements", "DDir")}
    </ix:hidden>
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="${tx.schemaRef}"/>
    </ix:references>
    <ix:resources>
      <xbrli:context id="${D}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(i.companyNo)}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(i.periodFrom)}</xbrli:startDate>
          <xbrli:endDate>${esc(i.periodTo)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
      <xbrli:context id="${E}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(i.companyNo)}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(i.periodTo)}</xbrli:instant></xbrli:period>
      </xbrli:context>
      ${i.priorFrom ? `<xbrli:context id="${PD}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(i.companyNo)}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(i.priorFrom)}</xbrli:startDate>
          <xbrli:endDate>${esc(i.priorTo ?? "")}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
      <xbrli:context id="${PE}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${esc(i.companyNo)}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(i.priorTo ?? "")}</xbrli:instant></xbrli:period>
      </xbrli:context>` : ""}
      ${dimContext("DStd", i.companyNo, "bus:AccountingStandardsDimension", `bus:${i.accountingStandard ?? "FRS102"}`, { from: i.periodFrom, to: i.periodTo })}
      ${dimContext("DType", i.companyNo, "bus:AccountsTypeDimension", `bus:${i.accountsType ?? "FullAccounts"}`, { from: i.periodFrom, to: i.periodTo })}
      ${dimContext("DStat", i.companyNo, "bus:AccountsStatusDimension", `bus:${i.accountsStatus ?? "AuditExemptWithAccountantsReport"}`, { from: i.periodFrom, to: i.periodTo })}
      ${(i.tradingStatus ?? "trading") === "trading" ? "" : dimContext("DTrade", i.companyNo, "bus:EntityTradingStatusDimension", i.tradingStatus === "neverTraded" ? "bus:EntityHasNeverTraded" : "bus:EntityNoLongerTradingButTradedInPast", { from: i.periodFrom, to: i.periodTo })}
      ${dimContext("DLegal", i.companyNo, "bus:LegalFormEntityDimension", `bus:${i.legalForm ?? "PrivateLimitedCompanyLtd"}`, { from: i.periodFrom, to: i.periodTo })}
      ${dimContext("DDir", i.companyNo, "bus:EntityOfficersDimension", "bus:Director1", { from: i.periodFrom, to: i.periodTo })}
      <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
      <xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>
    </ix:resources>
  </ix:header>
</div>

<h1>${esc(i.companyName)}</h1>
<div class="sub">
  Company registration number ${esc(i.companyNo)} (England and Wales)<br/>
  Unaudited micro-entity accounts for the period ended ${esc(longDate(i.periodTo))}${i.dormant ? " (dormant)" : ""}
</div>

<h2>Profit and loss account</h2>
${i.dormant
  ? `<p class="stmt">The company was dormant throughout the period. It received no income and incurred no
     expenditure, and therefore made neither a profit nor a loss.</p>`
  : `<table>
  <tr class="hd"><td class="lbl"></td><td class="num">${esc(i.periodTo.slice(0, 4))}<br/>£</td><td class="num">${esc((i.priorTo ?? "").slice(0, 4) || "—")}<br/>£</td></tr>
  ${row("Turnover", fact("core:TurnoverRevenue", i.turnover, D), py(i.pyTurnover))}
  ${row("Cost of sales", fact("core:CostSales", i.costOfSales, D, { negated: true }), "—")}
  ${row("Gross profit", fact("core:GrossProfitLoss", i.grossProfit, D), "—", true)}
  ${row("Administrative expenses", fact("core:AdministrativeExpenses", i.adminExpenses, D, { negated: true }), "—")}
  ${i.staffCosts ? row("Staff costs", fact("core:StaffCostsEmployeeBenefitsExpense", i.staffCosts, D, { negated: true }), "—") : ""}
  ${i.otherIncome ? row("Other income", fact("core:OtherOperatingIncomeFormat1", i.otherIncome, D), "—") : ""}
  ${row("Profit before tax", fact("core:ProfitLossOnOrdinaryActivitiesBeforeTax", i.profitBeforeTax, D), py(i.pyProfit), true)}
  ${row("Tax on profit", fact("core:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", i.taxCharge, D, { negated: true }), "—")}
  ${row("Profit for the period", fact("core:ProfitLoss", i.profitBeforeTax - i.taxCharge, D), py(i.pyProfit), true)}
</table>`}

<h2>Balance sheet as at ${esc(longDate(i.periodTo))}</h2>
<table>
  <tr class="hd"><td class="lbl"></td><td class="num">${esc(i.periodTo.slice(0, 4))}<br/>£</td><td class="num">${esc((i.priorTo ?? "").slice(0, 4) || "—")}<br/>£</td></tr>
  ${row("Called up share capital not paid",
      fact("core:CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset", i.shareCapitalNotPaid, E), "—")}
  ${row("Fixed assets", fact("core:FixedAssets", i.fixedAssets, E), py(i.pyFixedAssets))}
  ${row("Current assets", fact("core:CurrentAssets", i.currentAssets, E), py(i.pyCurrentAssets))}
  ${i.prepayments ? row("Prepayments and accrued income", fact("core:PrepaymentsAccruedIncome", i.prepayments, E), "—") : ""}
  ${row("Creditors: amounts falling due within one year",
      fact("core:Creditors", i.creditorsWithin, E, { negated: true }), py(i.pyCreditorsWithin))}
  ${row("Net current assets (liabilities)", fact("core:NetCurrentAssetsLiabilities", netCurrent, E), "—", true)}
  ${row("Total assets less current liabilities",
      fact("core:TotalAssetsLessCurrentLiabilities", totalLessCurrent, E), "—", true)}
  ${i.creditorsAfter
    ? row("Creditors: amounts falling due after more than one year",
        shown(-i.creditorsAfter), py(i.pyCreditorsAfter))
    : ""}
  ${i.provisions ? row("Provisions for liabilities", fact("core:ProvisionsForLiabilitiesBalanceSheetSubtotal", i.provisions, E, { negated: true }), "—") : ""}
  ${i.accruals ? row("Accruals and deferred income", fact("core:AccruedLiabilitiesDeferredIncome", i.accruals, E, { negated: true }), "—") : ""}
  ${row("Total net assets (liabilities)", fact("core:NetAssetsLiabilities", netAssets, E), py(i.pyNetAssets), true)}
  ${row("Capital and reserves", fact("core:Equity", netAssets, E), py(i.pyNetAssets), true)}
</table>

<p class="stmt">
  For the period ending ${esc(longDate(i.periodTo))} the company was entitled to exemption from audit
  under section ${i.dormant ? "480" : "477"} of the Companies Act 2006 relating to
  ${i.dormant ? "dormant" : "small"} companies.
</p>
<p class="stmt">
  The members have not required the company to obtain an audit of its accounts for the period in
  question in accordance with section 476.
</p>
<p class="stmt">
  The directors acknowledge their responsibilities for complying with the requirements of the Act
  with respect to accounting records and the preparation of accounts.
</p>
<p class="stmt">
  These accounts have been prepared and delivered in accordance with the provisions applicable to
  companies subject to the micro-entity provisions.
</p>

<h2>Notes to the financial statements</h2>
<p class="note">
  <b>1. Employee information.</b> Average number of employees during the period:
  <ix:nonFraction name="core:AverageNumberEmployeesDuringPeriod" contextRef="${D}"
    unitRef="pure" decimals="0">${plain(i.employees)}</ix:nonFraction>.
</p>
<p class="note"><b>2. Off balance sheet arrangements.</b> None.</p>

<p class="stmt">
  Approved by the board on ${esc(longDate(i.approvedOn))} and signed on its behalf by
  ${textFact("bus:NameEntityOfficer", i.approvedBy, "DDir")}.
</p>

</body>
</html>`;
}

/** The Corporation Tax computation, also as iXBRL. */
export function buildComputation(i: AccountsInput & {
  taxRate: number;
  taxPayable: number;
  /** Box 430: tax at the rate, before marginal relief. Defaults to taxPayable. */
  grossTax?: number;
  /** Box 435. */
  marginalRelief?: number;
}): string {
  const cx = i.compTaxonomy ?? COMP_TAXONOMIES[0];
  // Every concept in HMRC's computational taxonomy sits in a hypercube, and
  // the hypercube decides which dimensions its context must answer. There are
  // three shapes here, and they are not interchangeable:
  //
  //   DCo  the company itself over the period   — BusinessType = Company
  //   ECo  the same, at the period end          — for the instant facts
  //   DTr  one trade over the period            — BusinessType = Trade, plus
  //                                               the trade's name as a typed
  //                                               member of BusinessNameDimension
  //
  // Territory, DetailedAnalysis and LossReform all declare defaults, so they
  // are answered by omission; writing the default member out is an error.
  const DCo = "DCo";
  const ECo = "ECo";
  const DTr = "DTr";
  const adjusted = i.profitBeforeTax;
  // HMRC's reference linkbase maps these to CT600 boxes 430, 435 and 475, so the
  // computation and the return carry the same three figures under the same boxes.
  // The relief concept's name mentions ring fence trades for the same historical
  // reason the return's box 435 element does.
  const mr = i.marginalRelief ?? 0;
  const gross = i.grossTax ?? i.taxPayable + mr;
  // The prefix is `ctcomp` rather than `ct` because HMRC's own CT600 tooling
  // binds `ct` to the return's namespace (http://www.govtalk.gov.uk/taxation/CT/5)
  // and this document is nested inside such a return. Redeclaring a prefix is
  // legal XML, so this is tidiness, not a fix: it was suspected of breaking the
  // IRmark and wasn't the cause. The real cause was that HMRC canonicalise
  // with comments — see canonicalWithoutMark in ct600-xml.ts.
  const businessType = "ctcomp:BusinessTypeDimension";
  const businessName = "ctcomp:BusinessNameDimension";

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="${NS.ix}" xmlns:xbrli="${NS.xbrli}"
      xmlns:xlink="${NS.xlink}" xmlns:link="${NS.link}" xmlns:iso4217="${NS.iso4217}"
      xmlns:ctcomp="${cx.ct}" xmlns:bus="${NS.bus}" xmlns:xbrldi="${NS.xbrldi}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <title>${esc(i.companyName)} — Corporation Tax computation</title>
  <style type="text/css">
    body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#111;margin:36px auto;max-width:720px;}
    h1{font-size:15pt;margin:0 0 2px;} h2{font-size:12pt;margin:24px 0 8px;border-bottom:1px solid #999;padding-bottom:3px;}
    .sub{font-size:10pt;color:#555;margin-bottom:20px;}
    table{width:100%;border-collapse:collapse;} td{padding:4px 0;}
    .lbl{width:74%;} .num{text-align:right;font-variant-numeric:tabular-nums;}
    tr.b td{font-weight:bold;border-top:1px solid #bbb;}
    .note{font-size:9.5pt;color:#444;margin-top:14px;line-height:1.6;}
  </style>
</head>
<body>
<div style="display:none">
  <ix:header>
    <ix:hidden>
      ${/*
        The items every computation must carry.

        HMRC's taxonomy makes this a chain: any reportable fact requires
        CompanyName, and CompanyName in turn requires the tax reference, both
        pairs of period dates and the partnership flag. The rule lives in
        ct-comp-2024-definition-mandatoryItems.xml, and HMRC name that file in
        the rejection when one is missing. All six of the dated and referenced
        items are instant facts; only the partnership flag covers a period.

        This note is a code comment, not an XML one, on purpose: anything
        inside <!-- --> is filed with HMRC as part of the client's return and
        is covered by the IRmark. Notes for developers stay in the code.
      */ ""}${textFact("ctcomp:CompanyName", i.companyName, ECo)}
      ${textFact("ctcomp:TaxReference", i.utr ?? "", ECo)}
      ${dateFact("ctcomp:PeriodOfAccountStartDate", i.periodFrom, ECo)}
      ${dateFact("ctcomp:PeriodOfAccountEndDate", i.periodTo, ECo)}
      ${dateFact("ctcomp:StartOfPeriodCoveredByReturn", i.periodFrom, ECo)}
      ${dateFact("ctcomp:EndOfPeriodCoveredByReturn", i.periodTo, ECo)}
      ${boolFact("ctcomp:CompanyIsAPartnerInAFirm", false, DCo)}
    </ix:hidden>
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="${cx.schemaRef}"/>
    </ix:references>
    <ix:resources>
      ${multiContext(DCo, i.companyNo, [{ dimension: businessType, member: "ctcomp:Company" }], { from: i.periodFrom, to: i.periodTo })}
      ${multiContext(ECo, i.companyNo, [{ dimension: businessType, member: "ctcomp:Company" }], { at: i.periodTo })}
      ${multiContext(DTr, i.companyNo, [
        { dimension: businessType, member: "ctcomp:Trade" },
        { dimension: businessName, typedElement: "ctcomp:BusinessNameDomain", value: i.principalActivities?.trim() || i.companyName },
        // Unlike the company-level hypercube, the trade hypercube's territory
        // domain is only UK, Northern Ireland or the rest of the UK — the
        // dimension's default member isn't among them, so it can't be answered
        // by omission and has to be stated.
        { dimension: "ctcomp:TerritoryDimension", member: "ctcomp:UK" },
      ], { from: i.periodFrom, to: i.periodTo })}
      <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
    </ix:resources>
  </ix:header>
</div>

<h1>${esc(i.companyName)}</h1>
<div class="sub">
  Corporation Tax computation for the period ${esc(longDate(i.periodFrom))} to ${esc(longDate(i.periodTo))}<br/>
  Company registration number ${esc(i.companyNo)}
</div>

<h2>Adjustment of profit</h2>
<table>
  <tr><td class="lbl">Profit per the accounts</td>
    <td class="num">${fact("ctcomp:ProfitLossPerAccounts", i.profitBeforeTax, DTr)}</td></tr>
  <tr><td class="lbl">Add back: disallowable expenditure</td><td class="num">0</td></tr>
  <tr><td class="lbl">Less: capital allowances</td><td class="num">0</td></tr>
  <tr class="b"><td class="lbl">Adjusted trading profit</td>
    <td class="num">${fact("ctcomp:AdjustedTradingProfitOfThisPeriod", adjusted, DCo)}</td></tr>
</table>

<h2>Tax payable</h2>
<table>
  <tr><td class="lbl">Profits chargeable to Corporation Tax</td>
    <td class="num">${fact("ctcomp:TotalProfitsChargeableToCorporationTax", adjusted, DCo)}</td></tr>
  <tr><td class="lbl">Corporation Tax at ${n2(i.taxRate)}%</td>
    <td class="num">${fact("ctcomp:CorporationTaxChargeable", gross, DCo)}</td></tr>${mr > 0 ? `
  <tr><td class="lbl">Less: marginal relief</td>
    <td class="num">${fact("ctcomp:MarginalRateReliefForRingFenceTradesPayable", mr, DCo)}</td></tr>` : ""}
  <tr class="b"><td class="lbl">Corporation Tax payable</td>
    <td class="num">${fact("ctcomp:NetCorporationTaxPayable", i.taxPayable, DCo)}</td></tr>
</table>

<p class="note">
  This computation starts from the profit shown in the accounts. Disallowable expenditure and
  capital allowances are shown as nil and must be reviewed before filing — entertaining is
  normally disallowable, and equipment usually attracts capital allowances rather than being
  deducted as an expense.
</p>

</body>
</html>`;
}

export interface IxbrlCheck { ok: boolean; problems: string[]; warnings: string[] }

/** Checks the accounts balance before anything is generated. */
export function checkAccounts(i: AccountsInput): IxbrlCheck {
  const problems: string[] = [];
  const warnings: string[] = [];

  const netCurrent = i.currentAssets + i.prepayments - i.creditorsWithin;
  const netAssets = i.fixedAssets + netCurrent - i.creditorsAfter - i.provisions - i.accruals;

  if (!i.companyNo) problems.push("Company registration number is missing.");
  if (!i.approvedBy?.trim()) problems.push("The accounts need the name of whoever approves them.");
  if (!i.dormant && i.turnover === 0) {
    warnings.push("Turnover is zero but the company isn't marked dormant.");
  }
  if (Math.abs(netAssets) < 0.005 && (i.fixedAssets || i.currentAssets)) {
    warnings.push("Net assets come to zero — check the balance sheet figures.");
  }
  if (i.currentAssets === 0 && i.fixedAssets === 0 && !i.dormant) {
    warnings.push("No assets entered. A trading company usually has at least a bank balance.");
  }
  if (i.shareCapital > 0 && Math.abs(netAssets) > 0 && i.shareCapital > Math.abs(netAssets) * 100) {
    warnings.push("Share capital looks large against net assets — worth checking.");
  }
  return { ok: problems.length === 0, problems, warnings };
}
