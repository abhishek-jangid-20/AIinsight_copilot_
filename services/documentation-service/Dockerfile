FROM python:3.11-slim
WORKDIR /app
COPY requirements-base.txt .
RUN pip install --default-timeout=1000 --retries=10 --no-cache-dir -r requirements-base.txt
COPY common ./common
COPY documentation-service ./service
EXPOSE 8104
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8104"]
