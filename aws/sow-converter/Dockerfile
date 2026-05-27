# SOW HTML → DOCX converter Lambda — container image.
#
# Uses the AWS Lambda Node.js 20 base image and installs LibreOffice on top.
# Lambda layers can't hold LibreOffice anymore (250MB unzipped limit; LO is
# ~600MB), so container images are the supported path.
#
# Build + push instructions live in README.md.

FROM public.ecr.aws/lambda/nodejs:20

# LibreOffice + supporting fonts. dnf is the package manager on AL2023.
# --setopt=install_weak_deps=False trims unrelated optional packages so the
# final image stays under Lambda's 10GB container limit (we're not close,
# but smaller is faster to push + cold-start).
RUN dnf install -y \
    libreoffice \
    libreoffice-headless \
    libreoffice-writer \
    cairo \
    cups-libs \
    dbus-glib \
    fontconfig \
    libSM \
    libXinerama \
    libXrender \
    --setopt=install_weak_deps=False \
 && dnf clean all \
 && rm -rf /var/cache/dnf

# Bring in a wider font set so SOWs don't fall back to ugly defaults. The
# AL2023 base only ships DejaVu by default; add Liberation (Times Roman
# substitute — important since our SOW uses Times New Roman / Georgia) and
# the basic core fonts.
RUN dnf install -y \
    liberation-sans-fonts \
    liberation-serif-fonts \
    liberation-mono-fonts \
    google-noto-sans-fonts \
    --setopt=install_weak_deps=False \
 && dnf clean all \
 && fc-cache -f

# LibreOffice writes its user-profile cache to ~/.config/libreoffice on
# first run. Pre-create the dir + a starter profile to shave cold-start
# time; otherwise the first conversion of every cold Lambda waits ~5s
# for the profile init.
RUN mkdir -p /tmp/lo-profile \
 && HOME=/tmp libreoffice --headless --convert-to docx --outdir /tmp /dev/null 2>/dev/null || true

# Lambda task root is where the handler lives.
WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json ./
COPY index.mjs ./

# Lambda container images expect CMD to be the handler path.
CMD ["index.handler"]
