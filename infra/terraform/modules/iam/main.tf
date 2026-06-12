locals {
  name_prefix = var.tenant_id != "" ? "${var.app_name}-${var.environment}-${var.tenant_id}" : "${var.app_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      ManagedBy            = "terraform"
      Project              = "aria-evaluator"
      Environment          = var.environment
      AppName              = var.app_name
      "aria:resource_type" = "security"
    },
    var.tenant_id != "" ? { "aria:tenant_id" = var.tenant_id } : {},
    var.pricing_tier != "" ? { "aria:pricing_tier" = var.pricing_tier } : {},
  )

  connect_instance_arn = var.connect_instance_id == "*" ? "*" : "arn:aws:connect:${var.aws_region}:${var.aws_account_id}:instance/${var.connect_instance_id}"
}

data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "s3_state" {
  statement {
    sid       = "ListStateBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.state_bucket_arn]
  }

  statement {
    sid    = "ReadWriteStateObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${var.state_bucket_arn}/*"]
  }
}

resource "aws_iam_policy" "s3_state" {
  name        = "${local.name_prefix}-s3-state"
  description = "Allow ECS task to read and write the tenant state bucket"
  policy      = data.aws_iam_policy_document.s3_state.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "s3_state" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_state.arn
}

data "aws_iam_policy_document" "connect" {
  statement {
    sid    = "ConnectContacts"
    effect = "Allow"
    actions = [
      "connect:StartChatContact",
      "connect:StartWebRTCContact",
      "connect:DescribeContact",
      "connect:DescribeContactFlow",
      "connect:ListContactFlows",
    ]
    resources = [local.connect_instance_arn]
  }

  statement {
    sid    = "ConnectParticipant"
    effect = "Allow"
    actions = [
      "connectparticipant:CreateParticipantConnection",
      "connectparticipant:DisconnectParticipant",
      "connectparticipant:GetTranscript",
      "connectparticipant:SendEvent",
      "connectparticipant:SendMessage",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "connect" {
  name        = "${local.name_prefix}-connect"
  description = "Allow ECS task to interact with Amazon Connect"
  policy      = data.aws_iam_policy_document.connect.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "connect" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.connect.arn
}

data "aws_iam_policy_document" "bedrock" {
  statement {
    sid    = "BedrockInvoke"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "arn:aws:bedrock:*::foundation-model/*",
      "arn:aws:bedrock:*:${var.aws_account_id}:inference-profile/*",
      "arn:aws:bedrock:*:${var.aws_account_id}:provisioned-model/*",
    ]
  }

  statement {
    sid    = "BedrockAgentRuntime"
    effect = "Allow"
    actions = [
      "bedrock-agent-runtime:InvokeAgent",
      "bedrock-agent-runtime:Retrieve",
      "bedrock-agent-runtime:RetrieveAndGenerate",
    ]
    resources = ["arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:agent/*"]
  }
}

resource "aws_iam_policy" "bedrock" {
  name        = "${local.name_prefix}-bedrock"
  description = "Allow ECS task to invoke Bedrock models and agents"
  policy      = data.aws_iam_policy_document.bedrock.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "bedrock" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.bedrock.arn
}

data "aws_iam_policy_document" "polly" {
  statement {
    sid       = "PollySynthesize"
    effect    = "Allow"
    actions   = ["polly:SynthesizeSpeech"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "polly" {
  name        = "${local.name_prefix}-polly"
  description = "Allow ECS task to synthesize speech with Amazon Polly"
  policy      = data.aws_iam_policy_document.polly.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "polly" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.polly.arn
}

data "aws_iam_policy_document" "transcribe" {
  statement {
    sid    = "TranscribeStreaming"
    effect = "Allow"
    actions = [
      "transcribe:StartStreamTranscription",
      "transcribe:StartStreamTranscriptionWebSocket",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "transcribe" {
  name        = "${local.name_prefix}-transcribe"
  description = "Allow ECS task to use Amazon Transcribe streaming"
  policy      = data.aws_iam_policy_document.transcribe.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "transcribe" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.transcribe.arn
}

data "aws_iam_policy_document" "sts" {
  statement {
    sid       = "GetCallerIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "sts" {
  name        = "${local.name_prefix}-sts"
  description = "Allow ECS task to call sts:GetCallerIdentity"
  policy      = data.aws_iam_policy_document.sts.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "sts" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.sts.arn
}

data "aws_iam_policy_document" "xray" {
  statement {
    sid    = "XRayWrite"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "xray" {
  name        = "${local.name_prefix}-xray"
  description = "Allow ECS task to publish traces to X-Ray"
  policy      = data.aws_iam_policy_document.xray.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "xray" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.xray.arn
}

data "aws_iam_policy_document" "custom_metrics" {
  statement {
    sid       = "PutAriaInstanceMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["ARIA/Instance"]
    }
  }
}

resource "aws_iam_policy" "custom_metrics" {
  name        = "${local.name_prefix}-custom-metrics"
  description = "Allow ECS task to publish ARIA instance metrics"
  policy      = data.aws_iam_policy_document.custom_metrics.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "custom_metrics" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.custom_metrics.arn
}

data "aws_iam_policy_document" "heartbeat_table" {
  count = var.heartbeat_table_arn != "" ? 1 : 0

  statement {
    sid    = "HeartbeatTableAccess"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [var.heartbeat_table_arn]
  }
}

resource "aws_iam_policy" "heartbeat_table" {
  count = var.heartbeat_table_arn != "" ? 1 : 0

  name        = "${local.name_prefix}-heartbeat-table"
  description = "Allow ECS task to read and update the shared heartbeat table"
  policy      = data.aws_iam_policy_document.heartbeat_table[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "heartbeat_table" {
  count = var.heartbeat_table_arn != "" ? 1 : 0

  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.heartbeat_table[0].arn
}

data "aws_iam_policy_document" "task_secrets" {
  count = length(var.secrets_arns) > 0 ? 1 : 0

  statement {
    sid    = "ReadTaskSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = var.secrets_arns
  }

  statement {
    sid       = "DecryptTaskSecrets"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "task_secrets" {
  count = length(var.secrets_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-task-secrets"
  description = "Allow ECS task role to read tenant secrets"
  policy      = data.aws_iam_policy_document.task_secrets[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_secrets" {
  count = length(var.secrets_arns) > 0 ? 1 : 0

  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.task_secrets[0].arn
}

data "aws_iam_policy_document" "execution_secret" {
  count = var.god_mode_secret_arn != "" ? 1 : 0

  statement {
    sid    = "ReadExecutionSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [var.god_mode_secret_arn]
  }

  statement {
    sid       = "DecryptExecutionSecret"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "execution_secret" {
  count = var.god_mode_secret_arn != "" ? 1 : 0

  name        = "${local.name_prefix}-execution-secret"
  description = "Allow ECS task execution role to fetch the god mode secret"
  policy      = data.aws_iam_policy_document.execution_secret[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution_secret" {
  count = var.god_mode_secret_arn != "" ? 1 : 0

  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.execution_secret[0].arn
}

# ── Execution-role access to additional task-startup secrets ──────────────────
# When the task definition uses `secrets = [{ valueFrom = "<sm:arn>", ... }]`,
# ECS itself fetches the value before container start using the EXECUTION role.
# These ARNs must be granted to ecs_task_execution (NOT ecs_task).
data "aws_iam_policy_document" "execution_secrets_list" {
  count = length(var.execution_secret_arns) > 0 ? 1 : 0

  statement {
    sid       = "ReadExecutionSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.execution_secret_arns
  }

  statement {
    sid       = "DecryptExecutionSecrets"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "execution_secrets_list" {
  count = length(var.execution_secret_arns) > 0 ? 1 : 0

  name        = "${local.name_prefix}-execution-secrets"
  description = "Allow ECS execution role to fetch task-definition `secrets` from Secrets Manager"
  policy      = data.aws_iam_policy_document.execution_secrets_list[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution_secrets_list" {
  count = length(var.execution_secret_arns) > 0 ? 1 : 0

  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.execution_secrets_list[0].arn
}
