FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --default-timeout=1000 --retries=10 --no-cache-dir -r requirements.txt
COPY common ./common
COPY embedding-service ./service
EXPOSE 8102
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8102"]
