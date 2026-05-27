# SOW HTML → DOCX converter Lambda — container image.
#
# Switched from the AWS Lambda Node 20 base (AL2023) to Debian Bookworm
# slim because AL2023's dnf repos don't carry LibreOffice and the
# download.documentfoundation.org tarball URLs rotate (versions move
# from /stable/ to /archive/ as new releases land). apt-get always has
# a current LibreOffice, eliminating the URL-version drift problem.
#
# Using a non-Lambda base means we install aws-lambda-ric (the Lambda
# Runtime Interface Client) explicitly. Per AWS:
# https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html

FROM node:20-bookworm-slim

# LibreOffice headless + the fonts the SOW HTML expects (Liberation
# substitutes for Times New Roman / Arial; Noto fills Unicode coverage).
# --no-install-recommends keeps the image lean by skipping optional
# packages like libreoffice-help.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice \
      libreoffice-writer \
      fonts-liberation \
      fonts-noto-core \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

# Lambda Runtime Interface Client for Node — provides the
# /var/runtime/bootstrap and Lambda Runtime API loop that the Lambda
# service expects when invoking container-image functions.
RUN npm install -g aws-lambda-ric

# Pre-init the LibreOffice user profile so the first cold-Lambda
# conversion doesn't pay the ~5s profile-creation tax. Failures here
# are harmless — it's a warm-up; soffice will recreate the profile if
# needed.
RUN mkdir -p /tmp/lo-profile \
 && HOME=/tmp soffice --headless --convert-to docx --outdir /tmp /dev/null 2>/dev/null || true

# Lambda runs the function code from /var/task. ENTRYPOINT runs the
# runtime client, which loads the handler from CMD.
WORKDIR /var/task
COPY package.json ./
COPY index.mjs ./

ENTRYPOINT ["/usr/local/bin/aws-lambda-ric"]
CMD ["index.handler"]
