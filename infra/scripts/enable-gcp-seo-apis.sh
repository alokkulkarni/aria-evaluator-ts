#!/usr/bin/env bash
# enable-gcp-seo-apis.sh — enable the Google Cloud APIs used by the /seo google tooling
#
# Enables the six free APIs the seo-google analyst tooling reads from for ariaeval.io:
#   PageSpeed Insights, Chrome UX Report (CrUX), Search Console, Web Search Indexing,
#   Google Analytics Data (GA4), and Knowledge Graph Search.
#
# Idempotent — re-running is safe (already-enabled APIs are left as-is).
# None of these require billing. After enabling, the service account still needs
# adding to the Search Console property (Full/Owner) and the GA4 property (Viewer).
#
# Usage:
#   ./infra/scripts/enable-gcp-seo-apis.sh                 # uses current gcloud project
#   ./infra/scripts/enable-gcp-seo-apis.sh my-project-id   # targets a specific project
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (`gcloud auth login`)
#   - The Service Usage API caller / Editor role on the target project

set -euo pipefail

# ── APIs to enable ─────────────────────────────────────────────────────────────
APIS=(
  pagespeedonline.googleapis.com   # PageSpeed Insights (Tier 0)
  chromeuxreport.googleapis.com    # Chrome UX Report / CrUX + CrUX History (Tier 0)
  searchconsole.googleapis.com     # Search Console Search Analytics + URL Inspection (Tier 1)
  indexing.googleapis.com          # Web Search Indexing API (Tier 1)
  analyticsdata.googleapis.com     # Google Analytics Data API / GA4 (Tier 2)
  kgsearch.googleapis.com          # Knowledge Graph Search (entity check, Tier 0)
)

# ── Resolve project ────────────────────────────────────────────────────────────
PROJECT_ID="${1:-}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "error: gcloud CLI not found. Install it: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  echo "error: no active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "error: no project specified and none set in gcloud config." >&2
  echo "       Pass it as an argument or run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

# ── Enable ─────────────────────────────────────────────────────────────────────
echo "==> Enabling ${#APIS[@]} SEO APIs on project: ${PROJECT_ID}"
gcloud services enable "${APIS[@]}" --project "${PROJECT_ID}"

# ── Verify ─────────────────────────────────────────────────────────────────────
echo "==> Enabled APIs on ${PROJECT_ID}:"
gcloud services list --enabled --project "${PROJECT_ID}" \
  --filter="config.name:( pagespeedonline OR chromeuxreport OR searchconsole OR indexing OR analyticsdata OR kgsearch )" \
  --format="table(config.name, config.title)"

cat <<EOF

==> Done. Next steps (not handled by this script):
    1. Create an API key (restrict to PageSpeed Insights + Chrome UX Report + Knowledge Graph).
    2. Create a service account + JSON key.
    3. Add the service account email to the Search Console property (Full/Owner)
       and the GA4 property (Viewer).
    4. Put the values into ~/.config/claude-seo/google-api.json (and Secrets Manager
       /aria/website/prod/seo-google-api for the as-code copy).
EOF
