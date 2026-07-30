FROM python:3.12-slim

WORKDIR /srv/icare-ml

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY models/ models/

EXPOSE 8000

# Shell form on purpose: Render (and most PaaS) inject the port to bind as
# $PORT, and the exec form would pass the literal string through unexpanded.
# The default keeps `docker run -p 8000:8000` working unchanged.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
