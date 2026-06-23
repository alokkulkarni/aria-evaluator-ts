/**
 * Renders a Schema.org JSON-LD <script> block.
 *
 * Use in server components so the markup is part of the initial server-rendered
 * HTML (crawlable by Google and AI engines without JS execution).
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inject here; data is built from
      // trusted, static app sources (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
