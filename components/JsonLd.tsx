/**
 * Structured data for search engines, as a JSON-LD script. "<" is escaped so
 * no text in the data can close the script tag early.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
