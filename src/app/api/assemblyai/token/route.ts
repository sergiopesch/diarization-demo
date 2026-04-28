import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TOKEN_URL = "https://streaming.assemblyai.com/v3/token";
const TOKEN_TTL_SECONDS = 60;
const MAX_SESSION_SECONDS = 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

type AssemblyAITokenResponse = {
  token?: string;
  expires_in_seconds?: number;
  error?: string;
};

export async function POST() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("expires_in_seconds", String(TOKEN_TTL_SECONDS));
  url.searchParams.set(
    "max_session_duration_seconds",
    String(MAX_SESSION_SECONDS)
  );

  const { response, payload, error } = await requestAssemblyAIToken(
    url,
    apiKey
  );

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  if (!response || !payload) {
    return NextResponse.json(
      { error: "AssemblyAI token request failed" },
      { status: 502 }
    );
  }

  if (!response.ok || typeof payload.token !== "string") {
    return NextResponse.json(
      {
        error:
          typeof payload.error === "string"
            ? payload.error
            : "AssemblyAI token request failed",
      },
      { status: response.status || 502 }
    );
  }

  return NextResponse.json({
    token: payload.token,
    expiresInSeconds:
      typeof payload.expires_in_seconds === "number"
        ? payload.expires_in_seconds
        : TOKEN_TTL_SECONDS,
  });
}

async function requestAssemblyAIToken(
  url: URL,
  apiKey: string
): Promise<{
  response: Response | null;
  payload: AssemblyAITokenResponse | null;
  error: string | null;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: apiKey,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as
      | AssemblyAITokenResponse
      | Record<string, unknown>;

    return {
      response,
      payload,
      error: null,
    };
  } catch (error) {
    return {
      response: null,
      payload: null,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "AssemblyAI token request timed out"
          : "AssemblyAI token service is unavailable",
    };
  }
}
