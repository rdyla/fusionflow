# SOW → DOCX Lambda — Deployment

This directory holds the AWS Lambda function that converts CloudConnect SOW HTML into a real `.docx` via LibreOffice headless. The CF Worker POSTs HTML to a Lambda Function URL; the Lambda runs LibreOffice and returns the binary back.

You're deploying once. After that, conversions are invoked from the existing CF Worker — no further AWS work needed unless LibreOffice / Node base images get a security update worth picking up.

## What you'll do

1. Build the container image locally
2. Push it to AWS ECR (private container registry)
3. Create the Lambda function pointed at the image
4. Enable a Function URL (the HTTP endpoint the Worker calls)
5. Set the shared-secret env var
6. Add the URL + secret to Wrangler config on the CloudConnect side

Roughly 30 minutes including the first push (the container image is large because LibreOffice is large; subsequent pushes are fast thanks to layer caching).

## Prereqs

- `aws` CLI installed + logged in to the PFI account (`aws sts get-caller-identity` to verify)
- `docker` running locally
- You're working from this directory: `cd aws/sow-converter`

## Step 1 — Pick a region + names

```bash
# Use the same region as the rest of PF's AWS infra. us-west-2 is a
# safe default; change to whatever you already use.
export AWS_REGION=us-west-2

export FN_NAME=cloudconnect-sow-converter
export ECR_REPO=cloudconnect/sow-converter

# Your AWS account ID — pulled live so this works on any PFI machine.
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_URI=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}
```

## Step 2 — Create the ECR repo

```bash
aws ecr create-repository \
  --repository-name $ECR_REPO \
  --region $AWS_REGION \
  --image-scanning-configuration scanOnPush=true
```

If it already exists you'll get a `RepositoryAlreadyExistsException` — fine, ignore and move on.

## Step 3 — Build + push the image

```bash
# Authenticate Docker to ECR.
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Build for linux/amd64 explicitly — Lambda only runs amd64 unless you
# create the function as arm64, which the LibreOffice image doesn't
# support cleanly yet.
docker build --platform linux/amd64 -t $ECR_REPO:latest .

# Tag for ECR + push.
docker tag $ECR_REPO:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

First push uploads ~1.5GB (LibreOffice from the official tarball + base image + fonts). Be patient — first push runs 5–10 min depending on bandwidth. Subsequent pushes only re-upload what changed (handler code, usually a few KB).

**If the build fails on the `dnf install -y libreoffice ...` step:** that means an older Dockerfile that tried to install LibreOffice from AL2023's repos (which don't carry it). Make sure you have the current Dockerfile from the repo — it installs LibreOffice from the project's official RPM tarball via curl.

## Step 4 — Create the IAM role for the Lambda

The Lambda needs permission to write CloudWatch Logs and not much else.

```bash
# Trust policy — lets Lambda assume this role.
cat > /tmp/lambda-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create the role.
aws iam create-role \
  --role-name ${FN_NAME}-role \
  --assume-role-policy-document file:///tmp/lambda-trust.json

# Attach the basic execution policy (CloudWatch Logs).
aws iam attach-role-policy \
  --role-name ${FN_NAME}-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Grab the role ARN for the next step.
export ROLE_ARN=$(aws iam get-role --role-name ${FN_NAME}-role --query Role.Arn --output text)
echo $ROLE_ARN
```

## Step 5 — Generate the shared secret

This is what the CF Worker will send in the `X-PFI-Auth` header. The Lambda rejects requests without a match.

```bash
# 48 random base64 chars. Anything strong + unguessable works; this is
# just a convenience generator.
export SHARED_SECRET=$(openssl rand -base64 36)
echo "Save this: $SHARED_SECRET"
```

Copy that value somewhere safe (1Password). You'll need it again for the CF Worker step.

## Step 6 — Create the Lambda function

```bash
aws lambda create-function \
  --function-name $FN_NAME \
  --package-type Image \
  --code ImageUri=${ECR_URI}:latest \
  --role $ROLE_ARN \
  --timeout 60 \
  --memory-size 2048 \
  --architectures x86_64 \
  --environment "Variables={SOW_CONVERTER_SHARED_SECRET=$SHARED_SECRET}" \
  --region $AWS_REGION
```

Notes:
- **Timeout 60s.** LibreOffice cold starts can take 5–15s; an actual SOW conversion is ~1–3s after that. 60 gives headroom.
- **Memory 2048 MB.** LibreOffice is memory-hungry. 1024 sometimes works but cold starts are noticeably slower; 2048 is a good balance. Lambda CPU scales with memory so this also speeds up the conversion.

Wait ~30s after creation for the function to become Active. You can poll:

```bash
aws lambda get-function --function-name $FN_NAME --region $AWS_REGION \
  --query Configuration.State
```

`"Active"` = ready.

## Step 7 — Enable the Function URL

```bash
aws lambda create-function-url-config \
  --function-name $FN_NAME \
  --auth-type NONE \
  --region $AWS_REGION
```

`auth-type NONE` means no IAM signing required — that's why we use the shared secret instead. The Lambda checks the secret on every request.

Lambda Function URLs created with `NONE` need a permission grant to allow public invocation:

```bash
aws lambda add-permission \
  --function-name $FN_NAME \
  --statement-id FunctionUrlPublicInvoke \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE \
  --region $AWS_REGION
```

Grab the URL — that's what goes into Wrangler:

```bash
aws lambda get-function-url-config --function-name $FN_NAME --region $AWS_REGION \
  --query FunctionUrl --output text
```

It looks like `https://abcdef.lambda-url.us-west-2.on.aws/`.

## Step 8 — Smoke test

```bash
# Replace LAMBDA_URL with the URL from Step 7.
LAMBDA_URL="https://abcdef.lambda-url.us-west-2.on.aws/"

curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -H "X-PFI-Auth: $SHARED_SECRET" \
  -d '{"html":"<!doctype html><html><body><h1>Hello</h1><p>Test</p></body></html>"}' \
  --output /tmp/test.docx

# Open /tmp/test.docx in Word. Should show "Hello" + "Test".
open /tmp/test.docx
```

First request is slow (cold start + LibreOffice profile init). Run it twice; the second one should return in ~2s.

## Step 9 — Wire the CF Worker

On the CloudConnect side, set two Wrangler secrets:

```bash
cd /path/to/fusionflow

# Staging environment
echo -n "$LAMBDA_URL" | npx wrangler secret put SOW_CONVERTER_LAMBDA_URL --env staging
echo -n "$SHARED_SECRET" | npx wrangler secret put SOW_CONVERTER_SHARED_SECRET --env staging

# Repeat for production once staging is verified
echo -n "$LAMBDA_URL" | npx wrangler secret put SOW_CONVERTER_LAMBDA_URL
echo -n "$SHARED_SECRET" | npx wrangler secret put SOW_CONVERTER_SHARED_SECRET
```

The Worker reads `c.env.SOW_CONVERTER_LAMBDA_URL` + `c.env.SOW_CONVERTER_SHARED_SECRET` in the `/api/sow/word-export` endpoint.

## Updating the Lambda later

When handler code changes:

```bash
docker build --platform linux/amd64 -t $ECR_REPO:latest .
docker tag $ECR_REPO:latest $ECR_URI:latest
docker push $ECR_URI:latest
aws lambda update-function-code --function-name $FN_NAME --image-uri $ECR_URI:latest --region $AWS_REGION
```

When the shared secret needs rotating:

```bash
export NEW_SECRET=$(openssl rand -base64 36)
aws lambda update-function-configuration \
  --function-name $FN_NAME \
  --environment "Variables={SOW_CONVERTER_SHARED_SECRET=$NEW_SECRET}" \
  --region $AWS_REGION
# Then update the Wrangler secret on staging + prod.
```

## Cost expectations

For low-volume internal use (e.g., a few SOWs per day):
- Lambda compute: pennies/month
- ECR storage: ~$0.10/GB/month for the ~1.5GB image → ~$0.15/month
- CloudWatch Logs: pennies/month

Effectively free unless you start running thousands of conversions a day.

## Troubleshooting

**Cold start times out (>60s)**
Bump memory to 3008 MB. Lambda gives more CPU at higher memory, which speeds LibreOffice.

**Conversion returns 500 with `soffice exited 1`**
Check CloudWatch Logs (`aws logs tail /aws/lambda/cloudconnect-sow-converter --follow`). Usually a font or locale issue; the Dockerfile installs the standard set but a corner-case HTML element can trip it.

**Bumping the LibreOffice version**
Edit `LO_VERSION` in the Dockerfile to the new stable version. The `/opt/libreoffice<version>` path uses MAJOR.MINOR only — if you bump from 24.8.x to 25.2.x, also update the `ENV PATH=` line to match.

**401 Unauthorized**
Shared secret mismatch. Verify with:
```bash
aws lambda get-function-configuration --function-name $FN_NAME --query Environment.Variables.SOW_CONVERTER_SHARED_SECRET --output text
```
and compare to the Wrangler secret. They must match byte-for-byte (no trailing newline).

**413 Payload too large**
The SOW HTML exceeded 8MB. Unlikely under normal use — investigate before raising the limit.
