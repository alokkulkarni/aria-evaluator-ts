"""
SuspendCheckLambda — ARIA Evaluator per-tenant idle suspension.

Runs every 15 minutes via EventBridge. Implements:
  RUNNING → (warning at threshold-30min) → SUSPENDING → SUSPENDED

All DynamoDB updates use conditional writes (version-based optimistic locking)
to prevent race conditions with the resume Lambda.
"""

import boto3
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TENANT_ID = os.environ["TENANT_ID"]
HEARTBEAT_TABLE = os.environ["HEARTBEAT_TABLE"]
ECS_CLUSTER = os.environ["ECS_CLUSTER"]
ECS_SERVICE = os.environ["ECS_SERVICE"]
SUSPEND_THRESHOLD_HOURS = float(os.environ.get("SUSPEND_THRESHOLD_HOURS", "3"))
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "")
AWS_REGION = os.environ.get("AWS_REGION", "eu-west-2")
PRICING_TIER = os.environ.get("PRICING_TIER", "free")
WARNING_LEAD_MINUTES = 30

ddb = boto3.resource("dynamodb", region_name=AWS_REGION)
ecs = boto3.client("ecs", region_name=AWS_REGION)
cw = boto3.client("cloudwatch", region_name=AWS_REGION)


def put_metric(metric_name: str, value: float = 1.0):
    try:
        cw.put_metric_data(
            Namespace="ARIA/Suspend",
            MetricData=[{
                "MetricName": metric_name,
                "Value": value,
                "Unit": "Count",
                "Dimensions": [
                    {"Name": "TenantId", "Value": TENANT_ID},
                    {"Name": "PricingTier", "Value": PRICING_TIER},
                ],
            }],
        )
    except Exception as e:
        logger.warning("Failed to put metric %s: %s", metric_name, e)


def get_ecs_running_count() -> int:
    try:
        resp = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
        services = resp.get("services", [])
        if services:
            return services[0].get("runningCount", 0)
        return 0
    except Exception as e:
        logger.error("Failed to describe ECS service: %s", e)
        return -1


def set_desired_count(count: int):
    ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=count)
    logger.info("Set ECS desiredCount=%d for tenant %s", count, TENANT_ID)


def send_warning_email(minutes_until_suspend: int):
    if not ALERT_EMAIL:
        return
    try:
        ses = boto3.client("ses", region_name=AWS_REGION)
        ses.send_email(
            Source=ALERT_EMAIL,
            Destination={"ToAddresses": [ALERT_EMAIL]},
            Message={
                "Subject": {"Data": f"ARIA Evaluator: your instance will suspend in {minutes_until_suspend} minutes"},
                "Body": {"Text": {"Data": (
                    f"Your ARIA Evaluator instance (tenant: {TENANT_ID}) has been idle "
                    f"and will be automatically suspended in approximately {minutes_until_suspend} minutes "
                    f"to reduce costs.\n\n"
                    f"Log back in to your instance to keep it running.\n\n"
                    f"Pricing tier: {PRICING_TIER}\n"
                    f"Idle threshold: {SUSPEND_THRESHOLD_HOURS} hours"
                )}},
            },
        )
        logger.info("Sent suspension warning email to %s", ALERT_EMAIL)
    except Exception as e:
        logger.warning("Failed to send warning email: %s", e)


def lambda_handler(event, context):
    table = ddb.Table(HEARTBEAT_TABLE)
    now = datetime.now(timezone.utc)

    try:
        response = table.get_item(
            Key={"tenant_id": TENANT_ID},
            ConsistentRead=True,
        )
    except ClientError as e:
        logger.error("DynamoDB GetItem failed: %s", e)
        return

    item = response.get("Item")
    if not item:
        logger.info("No heartbeat record for tenant %s — skipping", TENANT_ID)
        return

    status = item.get("status", "RUNNING")
    version = int(item.get("version", 0))
    last_seen_str = item.get("last_seen_at")

    if not last_seen_str:
        logger.info("No last_seen_at for tenant %s — skipping", TENANT_ID)
        return

    last_seen = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
    idle_seconds = (now - last_seen).total_seconds()
    idle_hours = idle_seconds / 3600
    threshold_seconds = SUSPEND_THRESHOLD_HOURS * 3600
    warning_seconds = threshold_seconds - (WARNING_LEAD_MINUTES * 60)

    logger.info(
        "Tenant %s: status=%s idle_hours=%.2f threshold=%.1f",
        TENANT_ID, status, idle_hours, SUSPEND_THRESHOLD_HOURS,
    )

    if status == "RUNNING":
        # Check if we should send a warning
        if idle_seconds >= warning_seconds and not item.get("warning_sent_at"):
            minutes_remaining = max(0, int((threshold_seconds - idle_seconds) / 60))
            send_warning_email(minutes_remaining)
            try:
                table.update_item(
                    Key={"tenant_id": TENANT_ID},
                    UpdateExpression="SET warning_sent_at = :t, #v = :new_v",
                    ConditionExpression="#s = :running AND #v = :cur_v",
                    ExpressionAttributeNames={"#s": "status", "#v": "version"},
                    ExpressionAttributeValues={
                        ":t": now.isoformat(),
                        ":running": "RUNNING",
                        ":cur_v": version,
                        ":new_v": version + 1,
                    },
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    logger.info("Version conflict on warning update — another process modified the record")
                else:
                    logger.error("DDB update failed: %s", e)

        # Check if we should suspend
        if idle_seconds >= threshold_seconds:
            logger.info("Tenant %s is idle for %.2f hours — initiating suspension", TENANT_ID, idle_hours)
            try:
                set_desired_count(0)
            except Exception as e:
                logger.error("Failed to set ECS desiredCount=0: %s", e)
                return

            try:
                table.update_item(
                    Key={"tenant_id": TENANT_ID},
                    UpdateExpression="SET #s = :suspending, suspended_at = :t, warning_sent_at = :null_val, #v = :new_v",
                    ConditionExpression="#s = :running AND #v = :cur_v",
                    ExpressionAttributeNames={"#s": "status", "#v": "version"},
                    ExpressionAttributeValues={
                        ":suspending": "SUSPENDING",
                        ":running": "RUNNING",
                        ":t": now.isoformat(),
                        ":null_val": None,
                        ":cur_v": version,
                        ":new_v": version + 1,
                    },
                )
                put_metric("SuspendInitiated")
                logger.info("Tenant %s transitioned to SUSPENDING", TENANT_ID)
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    logger.info("Concurrent modification prevented suspension state change — will retry next cycle")
                else:
                    logger.error("DDB update failed: %s", e)

    elif status == "SUSPENDING":
        suspended_at_str = item.get("suspended_at", now.isoformat())
        suspended_at = datetime.fromisoformat(suspended_at_str.replace("Z", "+00:00"))
        suspending_minutes = (now - suspended_at).total_seconds() / 60

        running_count = get_ecs_running_count()
        hard_timeout = suspending_minutes > 10  # Force after 10 minutes

        if running_count == 0 or hard_timeout:
            reason = "ECS drained" if running_count == 0 else "hard timeout after 10 minutes"
            logger.info("Tenant %s confirming SUSPENDED (%s)", TENANT_ID, reason)
            try:
                table.update_item(
                    Key={"tenant_id": TENANT_ID},
                    UpdateExpression="SET #s = :suspended, #v = :new_v",
                    ConditionExpression="#s = :suspending AND #v = :cur_v",
                    ExpressionAttributeNames={"#s": "status", "#v": "version"},
                    ExpressionAttributeValues={
                        ":suspended": "SUSPENDED",
                        ":suspending": "SUSPENDING",
                        ":cur_v": version,
                        ":new_v": version + 1,
                    },
                )
                put_metric("SuspendCompleted")
                logger.info("Tenant %s is now SUSPENDED", TENANT_ID)
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    logger.info("Concurrent modification during SUSPENDED confirmation")
                else:
                    logger.error("DDB update failed: %s", e)
        else:
            logger.info(
                "Tenant %s still draining (%.1f min elapsed, runningCount=%d)",
                TENANT_ID, suspending_minutes, running_count,
            )

    else:
        logger.info("Tenant %s: status=%s — no action needed", TENANT_ID, status)
