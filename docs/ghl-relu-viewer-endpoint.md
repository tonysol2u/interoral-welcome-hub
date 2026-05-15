# GHL Relu MagicMirror Endpoint

## 1. Exact URL to use

The endpoint path is now:

```text
POST /v1/relu/viewer-session
```

The repo does **not** contain your real AWS HTTPS domain name, so I cannot truthfully fill in the domain part.

Use this once your AWS domain, ALB, API Gateway, or Nginx points to the service:

```text
https://YOUR-AWS-DOMAIN.com/v1/relu/viewer-session
```

The only concrete AWS host found in this repo/context is the EC2 IP. For raw testing only:

```text
http://54.146.162.87:3000/v1/relu/viewer-session
```

For the live GHL page, use HTTPS, not the raw HTTP IP.

## 2. Branch and folder

Branch:

```text
cursor/ghl-relu-viewer-bridge-6299
```

Folder:

```text
services/ghl-relu-viewer-gateway
```

This is backend-only. It does not use Lovable or the old frontend.

## 3. Minimal endpoint behavior

The endpoint accepts either request style from GHL.

### New upload

```http
POST /v1/relu/viewer-session
Content-Type: multipart/form-data
```

Fields:

```text
source=ghl
file=<scan file>
```

### Load from AWS locker

```json
{
  "source": "ghl",
  "action": "load_from_locker",
  "locker_case_id": "xxx"
}
```

### Response back to GHL

```json
{
  "ok": true,
  "order_id": "relu_order_789",
  "viewer_url": "https://automate.relu.ai/viewer/?order_id=relu_order_789"
}
```

## Important simple wiring note

This service is a public adapter for GHL. Set this environment variable to your existing AWS backend processor:

```sh
INTERNAL_RELU_PROCESSOR_URL=https://your-existing-aws-backend/internal/relu/process
```

That internal backend should return at least one of these:

```json
{
  "order_id": "relu_order_789"
}
```

or:

```json
{
  "viewer_url": "https://automate.relu.ai/viewer/?order_id=relu_order_789"
}
```

The public GHL endpoint will normalize it into the exact response GHL needs.
