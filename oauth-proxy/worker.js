/**
 * GitHub OAuth token exchange proxy for diary writer.
 *
 * Required secret:
 * - GITHUB_CLIENT_SECRET
 *
 * Optional vars:
 * - ALLOWED_ORIGIN (e.g. https://username.github.io)
 */

function jsonResponse(body, status, origin) {
  var headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

function isAllowedOrigin(origin, env) {
  if (!env.ALLOWED_ORIGIN) return true;
  return origin === env.ALLOWED_ORIGIN;
}

export default {
  async fetch(request, env) {
    var origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true }, 200, isAllowedOrigin(origin, env) ? origin : "");
    }

    if (request.method !== "POST") {
      return jsonResponse({ message: "Method not allowed" }, 405, origin);
    }

    if (!isAllowedOrigin(origin, env)) {
      return jsonResponse({ message: "Origin not allowed" }, 403, origin);
    }

    if (!env.GITHUB_CLIENT_SECRET) {
      return jsonResponse({ message: "Server is missing GITHUB_CLIENT_SECRET" }, 500, origin);
    }

    var payload;
    try {
      payload = await request.json();
    } catch (_error) {
      return jsonResponse({ message: "Invalid JSON payload" }, 400, origin);
    }

    var code = (payload.code || "").trim();
    var state = (payload.state || "").trim();
    var codeVerifier = (payload.codeVerifier || "").trim();
    var clientId = (payload.clientId || "").trim();
    var redirectUri = (payload.redirectUri || "").trim();

    if (!code || !state || !clientId || !redirectUri) {
      return jsonResponse({ message: "Missing required OAuth parameters" }, 400, origin);
    }

    var oauthBody = new URLSearchParams({
      client_id: clientId,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: code,
      state: state,
      redirect_uri: redirectUri,
    });

    if (codeVerifier) {
      oauthBody.set("code_verifier", codeVerifier);
    }

    var tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: oauthBody.toString(),
    });

    var tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok || tokenJson.error) {
      return jsonResponse(
        {
          message: tokenJson.error_description || tokenJson.error || "OAuth token exchange failed",
          details: tokenJson,
        },
        401,
        origin
      );
    }

    return jsonResponse(
      {
        access_token: tokenJson.access_token,
        token_type: tokenJson.token_type,
        scope: tokenJson.scope,
      },
      200,
      origin
    );
  },
};

