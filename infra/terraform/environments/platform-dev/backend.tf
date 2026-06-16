# Remote state for the shared platform. Supply the concrete values at init time:
#   terraform init \
#     -backend-config="bucket=aria-evaluator-tf-state-<account>" \
#     -backend-config="key=platform-dev/terraform.tfstate" \
#     -backend-config="region=eu-west-2" \
#     -backend-config="dynamodb_table=aria-evaluator-tf-lock" \
#     -backend-config="encrypt=true"
# For validate-only (no remote state), use:  terraform init -backend=false
terraform {
  backend "s3" {}
}
