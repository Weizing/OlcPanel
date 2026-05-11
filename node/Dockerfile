FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask docker psutil

COPY node_api.py .

EXPOSE 3002

CMD ["python", "node_api.py"]
