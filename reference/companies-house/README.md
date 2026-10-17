# Companies House XML Gateway schemas

Downloaded from https://xmlgw.companieshouse.gov.uk/SchemaStatus on 17 October 2026.
All four schemas were marked "live" on that page.

| File | What it checks |
|---|---|
| Egov_ch-v2-0.xsd | The GovTalk envelope around every message |
| FormSubmission-v2-11.xsd | The form header of an accounts filing |
| GetSubmissionStatus-v2-9.xsd | Status requests and Companies House's replies |
| GetStatusAck-v1-1.xsd | The acknowledgement sent after a general poll |
| GetSubmissionStatus_response.xml | Companies House's example reply (test mode) |

GetSubmissionStatus-v2-9.xsd includes `../baseTypes-v3-4.xsd`, and GetStatusAck-v1-1.xsd
includes `../baseTypes-v1-1.xsd`. Neither was downloaded, so those two were checked for
structure using stand-ins.

Companies House's example reply leaves `<SubmissionStatus>` in the envelope's namespace
rather than theirs. lib/companies-house.ts therefore reads replies by element name, not
by namespace.
