import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback (PKCE code exchange).
 *
 * Magic-link / OAuth redirect lands here with `?code=`. We exchange it for a
 * session (sets the auth cookies), then:
 *  - if `redirect_uri` is a `vscode://` URI (the extension sign-in handshake),
 *    hand the access token back to VS Code via `<redirect_uri>?token=<jwt>`;
 *  - otherwise redirect into the app (`next`, default `/dashboard`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = url.searchParams.get("redirect_uri");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  // Extension sign-in: hand the token back to VS Code.
  if (redirectUri && redirectUri.startsWith("vscode://")) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const target = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    return new NextResponse(handoffHtml(target), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

/** Minimal dark page that bounces the browser into the VS Code URI. */
function handoffHtml(target: string): string {
  const safe = target.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Returning to VS Code…</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0; min-height: 100dvh; display: grid; place-items: center;
        background: #0b0e14; color: #e6edf3;
        font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .card {
        max-width: 22rem; padding: 2rem; text-align: center;
        border: 1px solid #232a35; border-radius: 12px; background: #11151c;
      }
      h1 { font-size: 1.125rem; margin: 0 0 .5rem; }
      p { color: #8b949e; font-size: .875rem; margin: 0 0 1.25rem; }
      a {
        display: inline-block; padding: .625rem 1rem; border-radius: 8px;
        background: #7c83ff; color: #0b0e14; font-weight: 600; text-decoration: none;
      }
      a:focus-visible { outline: 2px solid #7c83ff; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>You're signed in</h1>
      <p>Returning you to VS Code… If nothing happens, click below.</p>
      <a id="open" href="${safe}">Open VS Code</a>
    </div>
    <script>
      // Auto-trigger the deep link.
      window.location.href = document.getElementById("open").href;
    </script>
  </body>
</html>`;
}
