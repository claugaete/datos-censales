FROM python:3.12-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends libexpat1 \
	&& rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 5000

CMD ["uv", "run", "gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]