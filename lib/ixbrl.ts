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
export const NS = {
  ix: "http://www.xbrl.org/2013/inlineXBRL",
  ixt: "http://www.xbrl.org/inlineXBRL/transformation/2020-02-12",
  xbrli: "http://www.xbrl.org/2003/instance",
  xlink: "http://www.w3.org/1999/xlink",
  link: "http://www.xbrl.org/2003/linkbase",
  iso4217: "http://www.xbrl.org/2003/iso4217",
  core: `https://xbrl.frc.org.uk/fr/${TAXONOMY_VERSION}/core`,
  bus: `https://xbrl.frc.org.uk/cd/${TAXONOMY_VERSION}/business`,
  ct: `http://www.hmrc.gov.uk/schemas/ct/comp/${TAXONOMY_VERSION}`,
};

export interface AccountsInput {
  companyName: string;
  companyNo: string;
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
}

const esc = (v: string): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const n2 = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const show = (v: number): string =>
  Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
 * One tagged figure. `sign` marks a value shown in brackets but held as a
 * positive in the taxonomy — creditors and expenses work that way.
 */
function fact(
  name: string,
  value: number,
  ctx: string,
  opts: { negated?: boolean; decimals?: string } = {},
): string {
  const v = Math.abs(value);
  const attrs = [
    `name="${name}"`,
    `contextRef="${ctx}"`,
    `unitRef="GBP"`,
    `decimals="${opts.decimals ?? "0"}"`,
    `format="ixt:numdotdecimal"`,
    opts.negated ? `sign="-"` : "",
  ].filter(Boolean).join(" ");
  return `<ix:nonFraction ${attrs}>${show(v)}</ix:nonFraction>`;
}

const textFact = (name: string, value: string, ctx: string): string =>
  `<ix:nonNumeric name="${name}" contextRef="${ctx}">${esc(value)}</ix:nonNumeric>`;

/** A row in the accounts, with this year and last year side by side. */
function row(label: string, thisYear: string, lastYear: string, bold = false): string {
  return `<tr${bold ? ' class="b"' : ""}>
      <td class="lbl">${esc(label)}</td>
      <td class="num">${thisYear}</td>
      <td class="num">${lastYear}</td>
    </tr>`;
}

export function buildAccounts(i: AccountsInput): string {
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
      xmlns:ix="${NS.ix}" xmlns:ixt="${NS.ixt}" xmlns:xbrli="${NS.xbrli}"
      xmlns:xlink="${NS.xlink}" xmlns:link="${NS.link}" xmlns:iso4217="${NS.iso4217}"
      xmlns:core="${NS.core}" xmlns:bus="${NS.bus}">
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
      ${textFact("bus:UKCompaniesHouseRegisteredNumber", i.companyNo, D)}
    </ix:hidden>
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="${NS.core}/core-${TAXONOMY_VERSION}.xsd"/>
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
  ${row("Creditors: amounts falling due after more than one year",
      fact("core:Creditors", i.creditorsAfter, E, { negated: true }), py(i.pyCreditorsAfter))}
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
    unitRef="pure" decimals="0" format="ixt:numdotdecimal">${show(i.employees)}</ix:nonFraction>.
</p>
<p class="note"><b>2. Off balance sheet arrangements.</b> None.</p>

<p class="stmt">
  Approved by the board on ${esc(longDate(i.approvedOn))} and signed on its behalf by
  ${textFact("core:NameEntityOfficer", i.approvedBy, D)}.
</p>

</body>
</html>`;
}

/** The Corporation Tax computation, also as iXBRL. */
export function buildComputation(i: AccountsInput & { taxRate: number; taxPayable: number }): string {
  const D = "D";
  const adjusted = i.profitBeforeTax;

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="${NS.ix}" xmlns:ixt="${NS.ixt}" xmlns:xbrli="${NS.xbrli}"
      xmlns:xlink="${NS.xlink}" xmlns:link="${NS.link}" xmlns:iso4217="${NS.iso4217}"
      xmlns:ct="${NS.ct}" xmlns:bus="${NS.bus}">
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
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="${NS.ct}/ct-comp-${TAXONOMY_VERSION}.xsd"/>
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
    <td class="num">${fact("ct:ProfitLossPerAccounts", i.profitBeforeTax, D)}</td></tr>
  <tr><td class="lbl">Add back: disallowable expenditure</td><td class="num">0</td></tr>
  <tr><td class="lbl">Less: capital allowances</td><td class="num">0</td></tr>
  <tr class="b"><td class="lbl">Adjusted trading profit</td>
    <td class="num">${fact("ct:AdjustedTradingProfitLoss", adjusted, D)}</td></tr>
</table>

<h2>Tax payable</h2>
<table>
  <tr><td class="lbl">Profits chargeable to Corporation Tax</td>
    <td class="num">${fact("ct:ProfitsChargeableToCorporationTax", adjusted, D)}</td></tr>
  <tr><td class="lbl">Rate applied</td><td class="num">${n2(i.taxRate)}%</td></tr>
  <tr class="b"><td class="lbl">Corporation Tax payable</td>
    <td class="num">${fact("ct:CorporationTaxPayable", i.taxPayable, D)}</td></tr>
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
