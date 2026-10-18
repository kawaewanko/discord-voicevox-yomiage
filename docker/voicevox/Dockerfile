ARG VOICEVOX_BASE_IMAGE=voicevox/voicevox_engine:cpu-latest
FROM ${VOICEVOX_BASE_IMAGE}

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
