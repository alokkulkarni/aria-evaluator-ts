// CloudFront Function — Session Auth Redirect (v1.0)
// Runs at viewer-request time for every request.
// If the request has no valid session cookie, redirect to the main website sign-in page.
// Exempt paths: /health, /auth/*, /api/auth/* (must be reachable without a session)

function handler(event) {
  var request = event.request;
  var uri     = request.uri;

  // Exempt paths that must be reachable unauthenticated
  if (
    uri === '/health' ||
    uri.indexOf('/auth/')     === 0 ||
    uri.indexOf('/api/auth/') === 0
  ) {
    return request;
  }

  var cookies = request.cookies || {};

  // Check both production (__Host- prefix) and dev/local cookie names
  var secureCookie = cookies['__Host-aria_session'];
  var devCookie    = cookies['aria_session'];

  var hasSession =
    (secureCookie && secureCookie.value && secureCookie.value !== '') ||
    (devCookie    && devCookie.value    && devCookie.value    !== '');

  if (hasSession) {
    return request;
  }

  // No session found — redirect to main website sign-in
  var host      = request.headers && request.headers.host ? request.headers.host.value : '';
  var queryStr  = request.querystring ? '?' + request.querystring : '';
  var returnUrl = encodeURIComponent('https://' + host + uri + queryStr);

  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: {
      location:       { value: '${main_website_url}/sign-in?return=' + returnUrl },
      'cache-control': { value: 'no-store, no-cache, must-revalidate' }
    }
  };
}
