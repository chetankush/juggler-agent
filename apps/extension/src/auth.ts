/**
 * auth.ts — Supabase JWT management for the VS Code extension.
 *
 * Flow:
 *   1. signIn()  → opens browser → web app login → redirect to vscode://aicrm.extension/auth?token=<jwt>
 *   2. UriHandler captures the token and stores it via storeToken()
 *   3. getToken() retrieves it; expiry is detected and re-prompts if needed
 *   4. signOut() clears storage and fires the signed-out event
 */

import * as vscode from "vscode";

const SECRET_KEY = "aicrm.jwt";

/** Emitted when auth state changes so other modules can react. */
export const onAuthStateChanged = new vscode.EventEmitter<boolean>();

let _context: vscode.ExtensionContext | undefined;

export function initAuth(context: vscode.ExtensionContext): void {
  _context = context;
}

function getContext(): vscode.ExtensionContext {
  if (!_context) {
    throw new Error("Auth module not initialised — call initAuth() first");
  }
  return _context;
}

/** Persist a JWT (and its expiry, decoded from the payload) in SecretStorage. */
export async function storeToken(token: string): Promise<void> {
  await getContext().secrets.store(SECRET_KEY, token);
  await vscode.commands.executeCommand("setContext", "aicrm.isSignedIn", true);
  onAuthStateChanged.fire(true);
}

/**
 * Returns the stored JWT, or undefined if none / expired.
 * When the token is expired it is cleared and the user is re-prompted.
 */
export async function getToken(): Promise<string | undefined> {
  const ctx = getContext();
  const token = await ctx.secrets.get(SECRET_KEY);
  if (!token) {
    return undefined;
  }

  // Decode expiry from the JWT payload (base64url, no signature verification needed here).
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
      // Malformed token — clear it
      await signOut();
      return undefined;
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { exp?: number };
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      // Expired — clear and re-prompt
      await signOut(/* silent */ true);
      void promptReSignIn();
      return undefined;
    }
  } catch {
    // If we can't decode, treat as invalid
    await signOut();
    return undefined;
  }

  return token;
}

/** Open the browser at the web-app login page. The page redirects back via vscode:// URI. */
export async function signIn(): Promise<void> {
  const config = vscode.workspace.getConfiguration("aicrm");
  // Sign-in happens on the WEB app, not the API server.
  const webBase = config.get<string>("webBaseUrl", "http://localhost:3000");

  // Redirect URI: vscode://aicrm.extension/auth
  const redirectUri = encodeURIComponent("vscode://aicrm.extension/auth");

  // The web app login page accepts ?redirect_uri= and, after auth completes,
  // redirects to <redirect_uri>?token=<jwt>.
  const loginUrl = `${webBase.replace(/\/$/, "")}/login?redirect_uri=${redirectUri}`;

  await vscode.env.openExternal(vscode.Uri.parse(loginUrl));

  vscode.window.showInformationMessage(
    "Opening browser to sign in to AI Sync Copilot…"
  );
}

/** Remove stored token and update context/UI state. */
export async function signOut(silent = false): Promise<void> {
  await getContext().secrets.delete(SECRET_KEY);
  await vscode.commands.executeCommand("setContext", "aicrm.isSignedIn", false);
  onAuthStateChanged.fire(false);
  if (!silent) {
    vscode.window.showInformationMessage("Signed out of AI Sync Copilot.");
  }
}

/** Gently prompt the user to sign in again after token expiry. */
async function promptReSignIn(): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "AI Sync Copilot: Your session has expired. Please sign in again.",
    "Sign In"
  );
  if (choice === "Sign In") {
    await signIn();
  }
}

/**
 * UriHandler registered in extension.ts.
 * Handles: vscode://aicrm.extension/auth?token=<jwt>
 */
export class AuthUriHandler implements vscode.UriHandler {
  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/auth") {
      return;
    }

    const params = new URLSearchParams(uri.query);
    const token = params.get("token");

    if (!token) {
      vscode.window.showErrorMessage(
        "AI Sync Copilot: Sign-in failed — no token received."
      );
      return;
    }

    await storeToken(token);
    vscode.window.showInformationMessage(
      "AI Sync Copilot: Signed in successfully!"
    );
  }
}
