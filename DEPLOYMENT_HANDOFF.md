# Deployment Handoff — Pertinence Dashboard at `pertinencegroup.com/pg-dashboard/`

Goal: serve the Pertinence Dashboard at **`https://pertinencegroup.com/pg-dashboard/`**.

We are using a **path-based static deployment** because the team does not have access
to the domain's DNS (managed on AWS), so a subdomain (`dashboard.pertinencegroup.com`)
is not possible. Instead, the app is compiled to a folder of static files that the
WordPress/AWS server admin publishes under the `/pg-dashboard/` path of the existing site.

The app is a static single-page app (HTML/CSS/JS) that talks directly to the hosted
Supabase backend from the browser. **There is no server, database, or runtime to
install** — only static files to publish. The existing WordPress site is not modified.

The shareable build is the zip:

> **`pertinence-dashboard-for-pertinencegroup.zip`** (regenerate anytime — see Part 3)

Two parties are involved:

- **Part 1 — Server / WordPress admin** (whoever can place files on the AWS web server).
- **Part 2 — Dashboard owner** (one Supabase setting — handled separately).

---

## Part 1 — For the server / WordPress admin

The zip contains a `pg-dashboard/` folder and a `READ-ME-FIRST.txt`. Steps:

1. **Publish the folder.** Copy the entire `pg-dashboard/` folder into the **web root** of
   `pertinencegroup.com` (the directory containing WordPress's `index.php` / `wp-content`)
   so the files land at:

   ```text
   <webroot>/pg-dashboard/index.html
   <webroot>/pg-dashboard/assets/...
   <webroot>/pg-dashboard/logo.png
   <webroot>/pg-dashboard/.htaccess
   ```

   It sits **beside** WordPress, not inside `wp-content` or a theme. WordPress is untouched.

2. **Client-side routing fallback** (so deep links like `/pg-dashboard/sales` don't 404):

   - **Apache** (most likely — WordPress uses it): nothing to do. The included
     `pg-dashboard/.htaccess` handles it. Just ensure `AllowOverride` is enabled for the web
     root so `.htaccess` is honored (it normally is, since WordPress depends on it too).
   - **Nginx**: `.htaccess` is ignored — add this to the server config and reload:

     ```nginx
     location /pg-dashboard/ {
         try_files $uri $uri/ /pg-dashboard/index.html;
     }
     ```

3. **Verify:**
   - `https://pertinencegroup.com/pg-dashboard/` → loads the sign-in page.
   - `https://pertinencegroup.com/pg-dashboard/sales` → loads (does **not** 404).
   - SSL is whatever already covers `pertinencegroup.com` — no new certificate needed.

**The admin does NOT need:** DNS changes, a new SSL cert, Node.js/database/any server
process, or any change to WordPress, its theme, plugins, or email.

---

## Part 2 — For the dashboard owner (one Supabase setting)

Done in the Supabase dashboard — **not** by the server admin.

**Supabase → Auth → URL Configuration** (project `hrmrqpkcvyjwxrehrgvq`), so
password-reset / email links point at the new path:

1. **Site URL** → `https://pertinencegroup.com/pg-dashboard`
2. **Redirect URLs** → add `https://pertinencegroup.com/pg-dashboard/reset-password`
   (keep the localhost dev entries; the old `*.vercel.app` entries can be removed — that
   deployment was retired, see below).

The app already builds the correct `/pg-dashboard/reset-password` redirect target into the
recovery email (the code reads its base path from the build), so once the URL above is
allow-listed, the forgot-password flow works on the new path.

### This is the only deployment now

The dashboard previously also ran on a Vercel `*.vercel.app` URL that auto-deployed from
GitHub. That was **retired on 2026-06-18**, so `/pg-dashboard/` is the sole live copy.
Consequence: pushing to GitHub no longer publishes anything — shipping a frontend change
is the manual rebuild-and-republish in Part 3. (Data and backend changes still flow
automatically through the shared Supabase backend and need no republish.)

---

## Part 3 — How to regenerate the build (for the next dev / future updates)

Because this is a standalone static copy, shipping a change means rebuilding
and re-sending the zip — the `/pg-dashboard/` copy does **not** auto-update from GitHub.

From the project root:

```powershell
# 1. Build the app with the /pg-dashboard/ base path (PowerShell — avoids Git-Bash
#    mangling the leading slash in the --base argument):
pnpm exec tsc -b
pnpm exec vite build --base=/pg-dashboard/

# 2. Stage into a pg-dashboard/ folder and zip it:
$stage = ".\_handoff_stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory $stage | Out-Null
Copy-Item .\dist -Destination "$stage\pg-dashboard" -Recurse -Force
Copy-Item .\DEPLOYMENT_README.txt "$stage\READ-ME-FIRST.txt" -ErrorAction SilentlyContinue
Compress-Archive -Path "$stage\pg-dashboard" -DestinationPath .\pertinence-dashboard-for-pertinencegroup.zip -Force
Remove-Item -Recurse -Force $stage
```

Notes for whoever rebuilds:

- The `.htaccess` SPA-fallback file lives in `public/` (so every build includes it) and
  hard-codes `RewriteBase /pg-dashboard/`; if the deploy path ever changes, update that
  line too.
- The URL path is baked into the build (asset links + router `basename` + reset redirect),
  so these files MUST be served at exactly `/pg-dashboard/`. A different path needs a
  rebuild with the matching `--base`.
- `vite.config.ts` is intentionally left at the default `base: '/'` so a normal
  `pnpm build` still serves correctly at the root (handy if the app is ever moved to a
  root-served host). The `/pg-dashboard/` base is supplied only on the command line for
  this packaged build.
- The app is base-path-aware: the router `basename`, the logo `<img>` paths, and the
  password-reset redirect all read `import.meta.env.BASE_URL`, so the same source serves
  both `/` (root) and `/pg-dashboard/` (this zip) with no code change.

---

## Why no DNS / token / CORS / key changes are needed

- **No DNS** — a URL path is served by the existing site's web server, not by a DNS
  record, so no access to the AWS-managed DNS is required.
- **CORS** — Edge Functions use `Access-Control-Allow-Origin: *`
  (`supabase/functions/_shared/cors.ts`), so requests from the new path work unchanged.
- **Keys/tokens** — the Supabase anon key already ships in the public frontend bundle;
  no service-account credentials, API tokens, or access keys are shared with the admin.
