# SOW HTML → DOCX converter Lambda — container image.
#
# Multi-stage build:
#   - builder: Node + build-essential + cmake to compile aws-lambda-ric's
#     native module (it has a preinstall.sh that builds against libcurl)
#   - runtime: Node + LibreOffice + fonts + the pre-built ric, copied in
#
# Splitting it keeps the final image lean (~900MB) instead of dragging
# build-essential (~500MB extra) along into production. apt-based
# LibreOffice on Debian replaces the AL2023 + tarball approach that
# kept breaking (no LibreOffice in AL2023 dnf repos; tarball URLs
# rotate as new versions land).

# ──────────────────────────────────────────────────────────────────────
# Stage 1: build aws-lambda-ric with its native bindings
# ──────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      cmake \
      python3 \
      libcurl4-openssl-dev \
      autoconf \
      automake \
      libtool \
      pkg-config \
      m4 \
      git \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g aws-lambda-ric

# ──────────────────────────────────────────────────────────────────────
# Stage 2: runtime image — Node + LibreOffice + ric (no build tools)
# ──────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

# Runtime deps only: LibreOffice + the fonts the SOW HTML expects
# (Liberation substitutes for Times New Roman / Arial; Noto fills
# Unicode coverage for customer names).
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

# Bring in the pre-built Lambda Runtime Interface Client from the
# builder stage. We only need the package itself; the /usr/local/bin
# symlink doesn't survive a cross-stage COPY cleanly (Node ends up
# resolving the binary's relative imports against the symlink path,
# not the real file path, which makes `../dist/index.mjs` look in the
# wrong place). Instead we invoke the actual bin file directly via
# `node` in ENTRYPOINT.
COPY --from=builder /usr/local/lib/node_modules/aws-lambda-ric /usr/local/lib/node_modules/aws-lambda-ric

# Pre-init the LibreOffice user profile so the first cold-Lambda
# conversion doesn't pay the ~5s profile-creation tax. Failures here
# are harmless — soffice will recreate the profile if needed.
RUN HOME=/tmp soffice --headless --convert-to docx --outdir /tmp /dev/null 2>/dev/null || true

# Lambda runs the function code from /var/task. ENTRYPOINT runs the
# runtime client, which loads the handler from CMD.
WORKDIR /var/task
COPY package.json ./
COPY index.mjs ./

ENTRYPOINT ["node", "/usr/local/lib/node_modules/aws-lambda-ric/bin/index.mjs"]
CMD ["index.handler"]
