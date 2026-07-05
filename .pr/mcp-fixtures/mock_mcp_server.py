#!/usr/bin/env python3
"""FastMCP fixture servers for Agent Canvas authenticated-MCP GIF capture."""

from __future__ import annotations

import argparse
from typing import Any
from urllib.parse import urlparse

from fastmcp import FastMCP
from fastmcp.server.auth import DebugTokenVerifier
from fastmcp.server.auth.auth import ClientRegistrationOptions
from fastmcp.server.auth.providers.in_memory import InMemoryOAuthProvider
from fastmcp.server.dependencies import (
    CurrentAccessToken,
    CurrentHeaders,
)
from mcp.server.auth.provider import AccessToken
from mcp.shared.auth import (
    InvalidRedirectUriError,
    OAuthClientInformationFull,
)
from pydantic import AnyUrl


BEARER_TOKEN = "elevenlabs-test-token"
DATADOG_API_KEY = "datadog-api-key"
DATADOG_APP_KEY = "datadog-app-key"
STATIC_CLIENT_ID = "notion-client"
STATIC_CLIENT_SECRET = "notion-secret"
OAUTH_SCOPES = "read:mock write:mock"


class LocalhostRedirectClient(OAuthClientInformationFull):
    """Static OAuth client that accepts FastMCP's generated localhost callback."""

    def validate_redirect_uri(self, redirect_uri: AnyUrl | None) -> AnyUrl:
        if redirect_uri is None:
            raise InvalidRedirectUriError("redirect_uri is required for this fixture")

        parsed = urlparse(str(redirect_uri))
        if (
            parsed.scheme == "http"
            and parsed.hostname in {
                "127.0.0.1",
                "localhost",
                "::1",
            }
            and (
                parsed.path == "/callback"
                or parsed.path.startswith("/api/oauth/")
            )
        ):
            return redirect_uri

        raise InvalidRedirectUriError(
            f"Redirect URI '{redirect_uri}' is not an Agent Canvas callback"
        )


class StaticClientOAuthProvider(InMemoryOAuthProvider):
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        if client_id == STATIC_CLIENT_ID:
            return LocalhostRedirectClient(
                client_id=STATIC_CLIENT_ID,
                client_secret=STATIC_CLIENT_SECRET,
                client_secret_expires_at=0,
                token_endpoint_auth_method="client_secret_post",
                redirect_uris=[AnyUrl("http://127.0.0.1/callback")],
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                scope=OAUTH_SCOPES,
                client_name="Mock Notion Static OAuth",
            )
        return await super().get_client(client_id)

    async def authorize(
        self,
        client: OAuthClientInformationFull,
        params: Any,
    ) -> str:
        if client.client_id == STATIC_CLIENT_ID and client.client_id not in self.clients:
            self.clients[client.client_id] = client
        return await super().authorize(client, params)


def build_weather_server() -> FastMCP:
    mcp = FastMCP("Mock Weather MCP")

    @mcp.tool
    def weather_forecast(city: str) -> str:
        """Return a deterministic mock forecast."""

        return f"weather_fixture_success city={city} forecast=sunny-72F"

    return mcp


def build_elevenlabs_server() -> FastMCP:
    auth = DebugTokenVerifier(validate=lambda token: token == BEARER_TOKEN)
    mcp = FastMCP("Mock ElevenLabs MCP", auth=auth)

    @mcp.tool
    def elevenlabs_voice_note(
        text: str,
        token: AccessToken = CurrentAccessToken(),
    ) -> str:
        """Return a deterministic mock voice note id."""

        return (
            "elevenlabs_fixture_success "
            f"client={token.client_id} voice_id=mock-voice text={text}"
        )

    return mcp


def build_datadog_server() -> FastMCP:
    mcp = FastMCP("Mock Datadog MCP")

    @mcp.tool
    def datadog_metric_snapshot(
        service: str,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> str:
        """Validate Datadog-style headers and return a metric sample."""

        normalized = {key.lower(): value for key, value in headers.items()}
        if normalized.get("dd-api-key") != DATADOG_API_KEY:
            return "datadog_fixture_error missing-or-invalid-dd-api-key"
        if (
            "dd-application-key" in normalized
            and normalized.get("dd-application-key") != DATADOG_APP_KEY
        ):
            return "datadog_fixture_error missing-or-invalid-dd-application-key"

        return f"datadog_fixture_success service={service} cpu=0.37 errors=0"

    return mcp


def build_static_oauth_server(base_url: str) -> FastMCP:
    auth = StaticClientOAuthProvider(
        base_url=base_url,
        required_scopes=["read:mock"],
    )
    mcp = FastMCP("Mock Notion Static OAuth MCP", auth=auth)

    @mcp.tool
    def notion_page_lookup(
        title: str,
        token: AccessToken = CurrentAccessToken(),
    ) -> str:
        """Return a deterministic mock Notion page lookup."""

        scopes = ",".join(token.scopes)
        return (
            "notion_fixture_success "
            f"client={token.client_id} scopes={scopes} title={title}"
        )

    return mcp


def build_dynamic_oauth_server(base_url: str) -> FastMCP:
    auth = InMemoryOAuthProvider(
        base_url=base_url,
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            valid_scopes=["read:mock", "write:mock"],
            default_scopes=["read:mock"],
        ),
        required_scopes=["read:mock"],
    )
    mcp = FastMCP("Mock Linear Dynamic OAuth MCP", auth=auth)

    @mcp.tool
    def linear_issue_summary(
        issue_key: str,
        token: AccessToken = CurrentAccessToken(),
    ) -> str:
        """Return a deterministic mock Linear issue summary."""

        scopes = ",".join(token.scopes)
        return (
            "linear_fixture_success "
            f"client={token.client_id} scopes={scopes} issue={issue_key}"
        )

    return mcp


def build_server(kind: str, base_url: str) -> FastMCP:
    if kind == "weather":
        return build_weather_server()
    if kind == "elevenlabs":
        return build_elevenlabs_server()
    if kind == "datadog":
        return build_datadog_server()
    if kind == "notion":
        return build_static_oauth_server(base_url)
    if kind == "linear":
        return build_dynamic_oauth_server(base_url)
    raise ValueError(f"Unsupported fixture kind: {kind}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "kind",
        choices=["weather", "elevenlabs", "datadog", "notion", "linear"],
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--base-url")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--path", default="/mcp")
    args = parser.parse_args()

    base_url = args.base_url or f"http://{args.host}:{args.port}"
    server = build_server(args.kind, base_url)
    server.run(
        transport="http",
        host=args.host,
        port=args.port,
        path=args.path,
        stateless_http=True,
        show_banner=False,
    )


if __name__ == "__main__":
    main()
