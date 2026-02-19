FROM python:3.11-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Build dependencies required by bluezero transitive deps:
# - PyGObject / pycairo
# - dbus-python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    meson \
    ninja-build \
    libcairo2-dev \
    libdbus-1-dev \
    libffi-dev \
    libgirepository1.0-dev \
    libglib2.0-dev \
    gobject-introspection \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /build/requirements.txt
RUN pip wheel --wheel-dir /build/wheels -r /build/requirements.txt


FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bluez \
    dbus \
    libglib2.0-0 \
    libdbus-1-3 \
    libcairo2 \
    libgirepository-1.0-1 \
    gir1.2-glib-2.0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/wheels /wheels
COPY requirements.txt /app/requirements.txt
RUN pip install --no-index --find-links=/wheels -r /app/requirements.txt && rm -rf /wheels

COPY door_agent.py /app/door_agent.py

RUN mkdir -p /data

CMD ["python", "/app/door_agent.py"]
