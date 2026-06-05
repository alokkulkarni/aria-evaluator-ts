output "guardduty_detector_id" {
  description = "GuardDuty detector ID"
  value       = aws_guardduty_detector.this.id
}

output "guardduty_detector_arn" {
  description = "GuardDuty detector ARN"
  value       = aws_guardduty_detector.this.arn
}

output "findings_bucket_arn" {
  description = "ARN of the S3 bucket receiving GuardDuty findings"
  value       = aws_s3_bucket.findings.arn
}

output "findings_bucket_name" {
  description = "Name of the S3 bucket receiving GuardDuty findings"
  value       = aws_s3_bucket.findings.id
}

output "alerts_sns_arn" {
  description = "ARN of the SNS topic receiving HIGH/CRITICAL security alerts"
  value       = aws_sns_topic.alerts.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key used to encrypt GuardDuty findings"
  value       = aws_kms_key.findings.arn
}
