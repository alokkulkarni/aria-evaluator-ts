export async function GET() {
  return Response.json({ status: 'ok', service: 'auth-backend', timestamp: new Date().toISOString() })
}
