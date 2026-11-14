FROM python:3.12-slim
WORKDIR /app/apps/analysis
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FOODTRACK_ROOT=/app
COPY apps/analysis/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY config /app/config
COPY apps/analysis /app/apps/analysis
RUN useradd -r app
USER app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
