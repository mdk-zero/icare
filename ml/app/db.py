"""Thin PostgREST client against Supabase using the service-role key.

The web app talks to Supabase the same way (service role over REST), so the
ML service needs no extra database credentials — only SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY. All reads page through PostgREST's row limit.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from .config import get_settings

PAGE_SIZE = 1000


class Db:
    def __init__(self) -> None:
        settings = get_settings()
        # SUPABASE_REST_URL overrides the hosted /rest/v1 convention for
        # self-hosted PostgREST (and the local test harness).
        rest_base = os.environ.get("SUPABASE_REST_URL", f"{settings.supabase_url}/rest/v1")
        self._client = httpx.Client(
            base_url=rest_base,
            headers={
                "apikey": settings.service_role_key,
                "Authorization": f"Bearer {settings.service_role_key}",
            },
            timeout=30.0,
        )

    def close(self) -> None:
        self._client.close()

    def select(
        self,
        table: str,
        columns: str = "*",
        filters: list[tuple[str, str, Any]] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """SELECT with pagination. filters are (column, operator, value) triples,
        e.g. ("role", "eq", "student") or ("id", "in", [uuid, ...])."""
        params: list[tuple[str, str]] = [("select", columns)]
        for column, op, value in filters or []:
            if op == "in":
                joined = ",".join(f'"{v}"' for v in value)
                params.append((column, f"in.({joined})"))
            else:
                params.append((column, f"{op}.{value}"))
        if order:
            params.append(("order", order))

        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = min(PAGE_SIZE, limit - len(rows)) if limit is not None else PAGE_SIZE
            if page <= 0:
                break
            response = self._client.get(
                f"/{table}",
                params=params,
                headers={"Range-Unit": "items", "Range": f"{offset}-{offset + page - 1}"},
            )
            response.raise_for_status()
            batch = response.json()
            rows.extend(batch)
            if len(batch) < page:
                break
            offset += len(batch)
        return rows

    def insert(self, table: str, rows: list[dict[str, Any]], returning: bool = False) -> list[dict[str, Any]]:
        if not rows:
            return []
        response = self._client.post(
            f"/{table}",
            json=rows,
            headers={"Prefer": "return=representation" if returning else "return=minimal"},
        )
        response.raise_for_status()
        return response.json() if returning else []

    def update(
        self,
        table: str,
        patch: dict[str, Any],
        filters: list[tuple[str, str, Any]],
    ) -> None:
        if not filters:
            raise ValueError("refusing to update without filters")
        params: list[tuple[str, str]] = []
        for column, op, value in filters:
            if op == "in":
                joined = ",".join(f'"{v}"' for v in value)
                params.append((column, f"in.({joined})"))
            else:
                params.append((column, f"{op}.{value}"))
        response = self._client.patch(f"/{table}", params=params, json=patch)
        response.raise_for_status()

    def delete(self, table: str, filters: list[tuple[str, str, Any]]) -> None:
        if not filters:
            raise ValueError("refusing to delete without filters")
        params: list[tuple[str, str]] = []
        for column, op, value in filters:
            if op == "in":
                joined = ",".join(f'"{v}"' for v in value)
                params.append((column, f"in.({joined})"))
            else:
                params.append((column, f"{op}.{value}"))
        response = self._client.delete(f"/{table}", params=params)
        response.raise_for_status()
