// Auth backend — no UI pages, just API routes.
// This page exists only to satisfy Next.js App Router requirement.
export default function Page() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>ARIA Auth Backend</h1>
      <p>This service handles authentication API routes only.</p>
      <p>Visit <a href="/api/health">/api/health</a> to check status.</p>
    </div>
  )
}
