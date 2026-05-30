locals {
  name_prefix = "${var.app_name}-${var.environment}"

  common_tags = merge(
    {
      AppName     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )

  connect_instance_arn = var.connect_instance_id == "*" ? "*" : "arn:aws:connect:${var.aws_region}:${var.aws_account_id}:instance/${var.connect_instance_id}"
}

# ── ECS Task Execution Role ────────────────────────────────────────────────────
# Used by the ECS agent to pull images from ECR and write logs to CloudWatch.

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

# ── ECS Task Role ──────────────────────────────────────────────────────────────
# Used by the application container itself for AWS API calls.

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

# ── S3 State Policy ────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "s3_state" {
  statement {
    sid     = "ListStateBucket"
    effect  = "Allow"
    actions = ["s3:ListBucket"]
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
  description = "Allow ECS task to read/write the S3 state bucket"
  policy      = data.aws_iam_policy_document.s3_state.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "s3_state" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_state.arn
}

# ── Amazon Connect Policy ──────────────────────────────────────────────────────

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

# ── Amazon Bedrock Policy ──────────────────────────────────────────────────────

data "aws_iam_policy_document" "bedrock" {
  statement {
    sid    = "BedrockInvoke"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = ["arn:aws:bedrock:${var.aws_region}::foundation-model/*"]
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

# ── Amazon Polly Policy ────────────────────────────────────────────────────────

data "aws_iam_policy_document" "polly" {
  statement {
    sid     = "PollySynthesize"
    effect  = "Allow"
    actions = ["polly:SynthesizeSpeech"]
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

# ── Amazon Transcribe Policy ───────────────────────────────────────────────────

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

# ── STS GetCallerIdentity ──────────────────────────────────────────────────────

data "aws_iam_policy_document" "sts" {
  statement {
    sid     = "GetCallerIdentity"
    effect  = "Allow"
    actions = ["sts:GetCallerIdentity"]
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
