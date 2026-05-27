# SOW HTML → DOCX converter Lambda — container image.
#
# Base: AWS Lambda Node.js 20 (Amazon Linux 2023).
# Adds LibreOffice installed from the LibreOffice project's official RPM
# tarball — AL2023's dnf repos don't carry LibreOffice (and the Lambda
# layer size cap rules out shipping it separately), so the tarball
# install is the canonical path.

FROM public.ecr.aws/lambda/nodejs:20

# Runtime dependencies LibreOffice needs at execution time (X11 libs even
# in headless mode, font libs, cups-libs for print pipeline). Liberation
# fonts substitute for Times New Roman + Arial in the SOW HTML; Noto adds
# broader Unicode coverage for customer names.
RUN dnf install -y \
    tar \
    gzip \
    cups-libs \
    dbus-glib \
    libSM \
    libXinerama \
    libXrender \
    fontconfig \
    cairo \
    liberation-sans-fonts \
    liberation-serif-fonts \
    liberation-mono-fonts \
    google-noto-sans-fonts \
    --setopt=install_weak_deps=False \
 && dnf clean all \
 && rm -rf /var/cache/dnf

# Pinned LibreOffice version. Bump as needed for security or rendering
# updates; rebuild + push to ECR + update-function-code on the Lambda.
ENV LO_VERSION=24.8.4

RUN curl -fSL "https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/rpm/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_rpm.tar.gz" -o /tmp/lo.tar.gz \
 && cd /tmp \
 && tar xzf lo.tar.gz \
 && cd LibreOffice_*_Linux_x86-64_rpm/RPMS \
 && rpm -i --nodeps --replacefiles *.rpm \
 && rm -rf /tmp/lo.tar.gz /tmp/LibreOffice_*

# Tarball install lands LO at /opt/libreoffice<version>/program (the
# version dir uses MAJOR.MINOR only — 24.8 here, not 24.8.4). The
# canonical command is `soffice`.
ENV PATH=/opt/libreoffice24.8/program:${PATH}

# Refresh font cache so LibreOffice picks up Liberation + Noto.
RUN fc-cache -f

# Pre-init the user profile so the first cold-Lambda conversion doesn't
# pay the ~5s profile-creation tax. Failures here are harmless — it's
# just a warm-up that probes soffice.
RUN HOME=/tmp soffice --headless --convert-to docx --outdir /tmp /dev/null 2>/dev/null || true

# Handler.
WORKDIR ${LAMBDA_TASK_ROOT}
COPY package.json ./
COPY index.mjs ./

CMD ["index.handler"]
