/**
 * Talks to HMRC's Transaction Engine.
 *
 * Submitting a return is not a single request. You post the envelope, HMRC
 * acknowledges it and hands back a correlation ID and a poll interval, you
 * poll until a real response arrives, and then you delete the message from
 * their queue. Skipping the delete leaves it sitting there, and HMRC asks
 * developers not to do that.
 *
 *   submit  ->  acknowledgement (correlation ID, poll interval, endpoint)
 *   poll    ->  acknowledgement ... until response or error
 *   delete  ->  clears it from the queue
 */

export interface GovTalkConfig {
  /** Where to post. Test and live endpoints come from HMRC's technical pack. */
  endpoint: string;
  senderId: string;
  password: string;
  vendorId: string;
  productName: string;
  productVersion: string;
  /** 1 for the test services, 0 for a real filing. */
  gatewayTest: boolean;
  email?: string;
}

export interface GovTalkResult {
  ok: boolean;
  /** acknowledgement = still processing, response = finished, error = rejected. */
  qualifier: string;
  correlationId: string | null;
  /** Seconds to wait before polling again. */
  pollSeconds: number | null;
  /** Where to send the next poll, which can differ from the submission URL. */
  pollEndpoint: string | null;
  errors: GovTalkError[];
  /** HMRC's own receipt, when the submission succeeded. */
  receipt: string | null;
  /** The whole reply, kept so a rejection can be read in full. */
  raw: string;
  httpStatus: number;
}

export interface GovTalkError {
  /** fatal stops the submission; business and recoverable may be retried. */
  type: string;
  number: string | null;
  text: string;
  location: string | null;
}

/** Pulls the first match out of a tag, ignoring namespace prefixes. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].trim() : null;
}

function tagAll(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

const unescape = (v: string): string =>
  v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Reads whatever came back, whether an acknowledgement, a response or a refusal. */
export function parseReply(xml: string, httpStatus: number): GovTalkResult {
  const qualifier = (tag(xml, "Qualifier") ?? "").toLowerCase();
  const correlationId = tag(xml, "CorrelationID") || null;

  const errors: GovTalkError[] = tagAll(xml, "Error").map((block) => ({
    type: (tag(block, "Type") ?? "").toLowerCase(),
    number: tag(block, "Number"),
    text: unescape(tag(block, "Text") ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    location: tag(block, "Location"),
  }));

  // The poll interval arrives as an attribute on ResponseEndPoint.
  const endPointMatch = xml.match(/<(?:\w+:)?ResponseEndPoint\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?ResponseEndPoint>/i);
  let pollSeconds: number | null = null;
  let pollEndpoint: string | null = null;
  if (endPointMatch) {
    const attrs = endPointMatch[1];
    const poll = attrs.match(/PollInterval\s*=\s*"(\d+)"/i);
    pollSeconds = poll ? Number(poll[1]) : null;
    pollEndpoint = endPointMatch[2].trim() || null;
  }

  return {
    ok: httpStatus >= 200 && httpStatus < 300 && qualifier !== "error" && errors.every((e) => e.type !== "fatal"),
    qualifier: qualifier || "unknown",
    correlationId,
    pollSeconds,
    pollEndpoint,
    errors,
    receipt: tag(xml, "IRmarkReceipt") ?? tag(xml, "Message") ?? null,
    raw: xml,
    httpStatus,
  };
}

async function post(url: string, body: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      Accept: "text/xml",
    },
    body,
    cache: "no-store",
  });
  return { status: res.status, text: await res.text() };
}

/** Sends a prepared envelope and returns HMRC's first reply. */
export async function submit(config: GovTalkConfig, envelope: string): Promise<GovTalkResult> {
  const ready = applyCredentials(config, envelope);
  const { status, text } = await post(config.endpoint, ready);
  return parseReply(text, status);
}

/** Asks HMRC whether a submission has finished processing. */
export async function poll(
  config: GovTalkConfig,
  correlationId: string,
  endpoint?: string,
): Promise<GovTalkResult> {
  const body = controlMessage(config, "poll", correlationId);
  const { status, text } = await post(endpoint || config.endpoint, body);
  return parseReply(text, status);
}

/** Clears a finished submission from HMRC's queue. */
export async function remove(
  config: GovTalkConfig,
  correlationId: string,
  endpoint?: string,
): Promise<GovTalkResult> {
  const body = controlMessage(config, "delete", correlationId);
  const { status, text } = await post(endpoint || config.endpoint, body);
  return parseReply(text, status);
}

const esc = (v: string): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** A poll or delete carries no return — just the header identifying the message. */
function controlMessage(config: GovTalkConfig, qualifier: string, correlationId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>${esc(qualifier)}</Qualifier>
      <Function>submit</Function>
      <CorrelationID>${esc(correlationId)}</CorrelationID>
      <Transformation>XML</Transformation>
      <GatewayTest>${config.gatewayTest ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(config.senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${esc(config.password)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

/**
 * Drops the real credentials into a generated envelope.
 *
 * The generator leaves placeholders rather than holding secrets, so the
 * password only ever exists at the moment of sending.
 */
export function applyCredentials(config: GovTalkConfig, envelope: string): string {
  return envelope
    .replace(/__PASSWORD__/g, esc(config.password))
    .replace(/<Value>[\s\S]*?<\/Value>/, `<Value>${esc(config.password)}</Value>`)
    .replace(/<SenderID>[\s\S]*?<\/SenderID>/, `<SenderID>${esc(config.senderId)}</SenderID>`)
    .replace(/<URI>[\s\S]*?<\/URI>/, `<URI>${esc(config.vendorId)}</URI>`)
    .replace(/<Product>[\s\S]*?<\/Product>/, `<Product>${esc(config.productName)}</Product>`)
    .replace(/<Version>[\s\S]*?<\/Version>/, `<Version>${esc(config.productVersion)}</Version>`)
    .replace(/<GatewayTest>[\s\S]*?<\/GatewayTest>/, `<GatewayTest>${config.gatewayTest ? "1" : "0"}</GatewayTest>`);
}

export interface RunResult {
  /** What happened overall, for someone reading a screen. */
  outcome: "accepted" | "rejected" | "timeout" | "error";
  correlationId: string | null;
  receipt: string | null;
  errors: GovTalkError[];
  /** Each exchange, so a failure can be traced afterwards. */
  steps: { stage: string; at: string; qualifier: string; httpStatus: number; raw: string }[];
}

/**
 * Runs the whole cycle: submit, poll until finished, then delete.
 *
 * HMRC's poll interval is a minimum, not a suggestion — polling faster than
 * asked can have a submission throttled, so this waits as instructed.
 */
export async function submitAndWait(
  config: GovTalkConfig,
  envelope: string,
  opts: { maxWaitSeconds?: number; onStep?: (stage: string, r: GovTalkResult) => void } = {},
): Promise<RunResult> {
  const steps: RunResult["steps"] = [];
  const record = (stage: string, r: GovTalkResult) => {
    steps.push({ stage, at: new Date().toISOString(), qualifier: r.qualifier, httpStatus: r.httpStatus, raw: r.raw });
    opts.onStep?.(stage, r);
  };

  let r: GovTalkResult;
  try {
    r = await submit(config, envelope);
  } catch (e) {
    return {
      outcome: "error",
      correlationId: null,
      receipt: null,
      errors: [{ type: "fatal", number: null, text: `Couldn't reach HMRC: ${String(e).slice(0, 180)}`, location: null }],
      steps,
    };
  }
  record("submit", r);

  if (r.qualifier === "error" || r.errors.some((e) => e.type === "fatal")) {
    return { outcome: "rejected", correlationId: r.correlationId, receipt: null, errors: r.errors, steps };
  }

  const correlationId = r.correlationId;
  if (!correlationId) {
    return {
      outcome: "error",
      correlationId: null,
      receipt: null,
      errors: [{ type: "fatal", number: null, text: "HMRC accepted the message but returned no correlation ID.", location: null }],
      steps,
    };
  }

  const deadline = Date.now() + (opts.maxWaitSeconds ?? 120) * 1000;
  let endpoint = r.pollEndpoint ?? config.endpoint;

  while (r.qualifier === "acknowledgement" && Date.now() < deadline) {
    const wait = Math.max(1, r.pollSeconds ?? 5);
    await new Promise((res) => setTimeout(res, wait * 1000));
    try {
      r = await poll(config, correlationId, endpoint);
    } catch (e) {
      return {
        outcome: "error", correlationId, receipt: null,
        errors: [{ type: "fatal", number: null, text: `Polling failed: ${String(e).slice(0, 180)}`, location: null }],
        steps,
      };
    }
    record("poll", r);
    if (r.pollEndpoint) endpoint = r.pollEndpoint;
  }

  const finished = r.qualifier === "response";
  const rejected = r.qualifier === "error" || r.errors.length > 0;

  // Tidy up after ourselves either way — HMRC asks for this.
  if (finished || rejected) {
    try {
      const d = await remove(config, correlationId, endpoint);
      record("delete", d);
    } catch {
      // A failed delete doesn't change the filing's outcome.
    }
  }

  if (rejected) return { outcome: "rejected", correlationId, receipt: null, errors: r.errors, steps };
  if (!finished) return { outcome: "timeout", correlationId, receipt: null, errors: [], steps };
  return { outcome: "accepted", correlationId, receipt: r.receipt, errors: [], steps };
}

/** Turns HMRC's error codes into something a person can act on. */
export function explain(e: GovTalkError): string {
  const n = e.number ?? "";
  const known: Record<string, string> = {
    "1046": "Authentication failed — the sender ID or password is wrong, or the account isn't enabled for this service.",
    "1george": "",
    "3001": "The message failed schema validation. The XML doesn't match HMRC's CT600 schema.",
    "5012": "Authentication failure — check the sender ID and password against the credentials HMRC issued.",
    "1001": "The submission is a duplicate of one already received.",
    "9001": "The IRmark doesn't match what HMRC calculated. The digest or canonicalisation is wrong.",
  };
  const hint = known[n];
  return hint ? `${e.text} — ${hint}` : e.text;
}
