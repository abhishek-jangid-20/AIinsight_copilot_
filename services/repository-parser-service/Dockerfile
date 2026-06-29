FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY requirements-base.txt .
RUN pip install --default-timeout=1000 --retries=10 --no-cache-dir -r requirements-base.txt
COPY common ./common
COPY repository-parser-service ./service
EXPOSE 8101
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8101"]
