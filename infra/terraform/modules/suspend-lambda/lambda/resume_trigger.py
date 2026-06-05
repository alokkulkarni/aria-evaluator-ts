"""
ResumeLambda — ARIA Evaluator per-tenant resume trigger.

Called by the control plane (direct Lambda invoke, IAM-authenticated)
when a user logs into a suspended or suspending tenant instance.

Accepts event: {"tenant_id": "...", "requester": "..."}
Returns: {"status": "resuming"|"already_running"|"error", "message": "..."}
"""

import boto3
import os
import json
import logging
from datetime import datetime, timezone
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TENANT_ID = os.environ["TENANT_ID"]
HEARTBEAT_TABLE = os.environ["HEARTBEAT_TABLE"]
ECS_CLUSTER = os.environ["ECS_CLUSTER"]
ECS_SERVICE = os.environ["ECS_SERVICE"]
AWS_REGION = os.environ.get("AWS_REGION", "eu-west-2")

ddb = boto3.resource("dynamodb", region_name=AWS_REGION)
ecs = boto3.client("ecs", region_name=AWS_REGION)
cw = boto3.client("cloudwatch", region_name=AWS_REGION)


def put_metric(metric_name: str):
    try:
        cw.put_metric_data(
            Namespace="ARIA/Suspend",
            MetricData=[{
                "MetricName": metric_name,
                "Value": 1,
                "Unit": "Count",
                "Dimensions": [{"Name": "TenantId", "Value": TENANT_ID}],
            }],
        )
    except Exception as e:
        logger.warning("Failed to put metric %s: %s", metric_name, e)


def lambda_handler(event, context):
    # Validate caller's tenant_id matches this Lambda's tenant
    event_tenant = event.get("tenant_id", TENANT_ID)
    if event_tenant != TENANT_ID:
        logger.error("tenant_id mismatch: event=%s, env=%s", event_tenant, TENANT_ID)
        return {"status": "error", "message": "tenant_id mismatch"}

    requester = event.get("requester", "unknown")
    logger.info("Resume request for tenant %s from %s", TENANT_ID, requester)

    table = ddb.Table(HEARTBEAT_TABLE)
    now = datetime.now(timezone.utc)

    try:
        response = table.get_item(
            Key={"tenant_id": TENANT_ID},
            ConsistentRead=True,
        )
    except ClientError as e:
        logger.error("DynamoDB GetItem failed: %s", e)
        return {"status": "error", "message": str(e)}

    item = response.get("Item")
    if not item:
        # No record — create one and start the service
        logger.info("No heartbeat record for tenant %s — creating and starting", TENANT_ID)
        _start_ecs_and_update_ddb(table, now, "RUNNING", version=0)
        return {"status": "resuming", "message": "Instance starting (first time)"}

    status = item.get("status", "RUNNING")
    version = int(item.get("version", 0))

    if status in ("SUSPENDED", "SUSPENDING"):
        logger.info("Resuming tenant %s from %s state", TENANT_ID, status)
        try:
            ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=1)
            logger.info("ECS desiredCount set to 1 for tenant %s", TENANT_ID)
        except Exception as e:
            logger.error("Failed to start ECS service: %s", e)
            return {"status": "error", "message": f"Failed to start ECS: {e}"}

        try:
            table.update_item(
                Key={"tenant_id": TENANT_ID},
                UpdateExpression=(
                    "SET #s = :running, resumed_at = :t, last_seen_at = :t, "
                    "warning_sent_at = :null_val, #v = :new_v"
                ),
                ConditionExpression="#v = :cur_v",
                ExpressionAttributeNames={"#s": "status", "#v": "version"},
                ExpressionAttributeValues={
                    ":running": "RUNNING",
                    ":t": now.isoformat(),
                    ":null_val": None,
                    ":cur_v": version,
                    ":new_v": version + 1,
                },
            )
            put_metric("ResumeEvents")
            logger.info("Tenant %s transitioned to RUNNING", TENANT_ID)
            return {"status": "resuming", "message": "Instance is starting up"}
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.info("Concurrent modification during resume — retrying read")
                return {"status": "resuming", "message": "Instance is starting (concurrent update detected)"}
            else:
                logger.error("DDB update failed: %s", e)
                return {"status": "error", "message": str(e)}

    elif status == "RUNNING":
        # Update last_seen_at as a courtesy heartbeat
        try:
            table.update_item(
                Key={"tenant_id": TENANT_ID},
                UpdateExpression="SET last_seen_at = :t, #v = :new_v",
                ConditionExpression="#v = :cur_v",
                ExpressionAttributeNames={"#v": "version"},
                ExpressionAttributeValues={
                    ":t": now.isoformat(),
                    ":cur_v": version,
                    ":new_v": version + 1,
                },
            )
        except ClientError:
            pass  # Non-critical
        return {"status": "already_running", "message": "Instance is already running"}

    else:
        return {"status": "already_running", "message": f"Instance status: {status}"}


def _start_ecs_and_update_ddb(table, now, status, version):
    ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=1)
    expires_at = int((now.timestamp())) + 172800  # 48 hours TTL
    table.put_item(Item={
        "tenant_id": TENANT_ID,
        "status": status,
        "last_seen_at": now.isoformat(),
        "version": version + 1,
        "expires_at": expires_at,
    })
