# Terraform environments

## Prod (one command)

Prod is three linked stacks — the **control-plane** (auth/users/tenants), the
**evaluator** (the app), and the **connectivity** layer (VPC peering) between
them. They must be applied in dependency order, and the auth linkage
(`CONTROL_PLANE_INTERNAL_URL` / `CONTROL_PLANE_INTERNAL_SECRET`) auto-wires via
SSM + Secrets Manager — no hand-copied values.

Deploy the whole linked stack in one command:

```bash
./infra/terraform/scripts/deploy-prod.sh        # interactive
./infra/terraform/scripts/deploy-prod.sh -y     # auto-approve
```

It runs, in order:

1. **control-plane-prod** — builds its image in-apply; publishes the SSM params the evaluator reads.
2. **evaluator-prod** — apply (creates ECR) → build + push image → re-apply with the real image URI; reads the control-plane SSM params at apply time.
3. **connectivity-prod** — VPC peering + routes + SG rule so the evaluator can reach the control-plane internal ALB for the SSO verify call.

Tear down (reverse order — connectivity first):

```bash
./infra/terraform/scripts/destroy-prod.sh [-y]
```

Each stack keeps its own Terraform state (separate keys in the shared S3 bucket),
so you can still apply one independently with its `init-backend.sh` +
`terraform apply` if needed.

### Auth model

First sign-up on the control-plane becomes the **admin/owner**; the admin then
invites users and assigns roles in-app from the **Team** page. (Sign-up is
email/password + Google/GitHub OAuth via the control-plane — no Cognito.)

## Local

See [`local/`](./local) — `terraform apply` there runs the repo-root
`docker-compose.yml` (app + PostgreSQL + Redis) in one command. Full docs:
the website [Deploy with Terraform](https://ariaeval.io/docs/deploy-terraform) page.
