variable "ses_sender_domain" {
  description = "Domain for SES outbound email (e.g. ariaeval.io). Leave empty to skip SES setup. After apply, add DKIM CNAME records from 'ses_dkim_tokens' output to your DNS zone, add the MAIL FROM MX record, and request SES production access via AWS Support."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region for the bootstrap resources"
  type        = string
  default     = "eu-west-2"
}

variable "bucket_suffix" {
  description = "Globally unique suffix appended to the Terraform state bucket"
  type        = string
}

variable "tags" {
  description = "Additional tags applied to bootstrap resources"
  type        = map(string)
  default     = {}
}
