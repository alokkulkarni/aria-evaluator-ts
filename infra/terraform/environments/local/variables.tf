# Most local configuration lives in the repo-root `.env` (copy from
# `.env.example`) which docker compose loads automatically. These few variables
# control what Terraform passes through to `docker compose`.

variable "aws_region" {
  description = "AWS region for the Bedrock judge (passed to the stack as AWS_REGION)."
  type        = string
  default     = "eu-west-2"
}

variable "enable_bedrock_proxy" {
  description = "Also start the local Bedrock proxy container (docker compose --profile bedrock), letting the app call Bedrock via a local HTTP proxy using your ~/.aws credentials."
  type        = bool
  default     = false
}
