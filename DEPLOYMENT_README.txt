PERTINENCE DASHBOARD — STATIC BUILD FOR pertinencegroup.com/pg-dashboard/
=========================================================================

WHAT THIS IS
------------
A pre-built copy of the Pertinence Dashboard web app, compiled to run at the
URL path /pg-dashboard/ on the existing pertinencegroup.com website.

It is a static single-page app (just HTML/CSS/JS files). There is NO server,
database, or runtime to install and nothing to configure on the box — you are
only serving a folder of static files. The app talks directly to its hosted
backend (Supabase) from the visitor's browser, so all the "live" behaviour
happens client-side against that backend, not on your server.

Inside this zip:
    pg-dashboard/           <- the folder to publish under the web root
        index.html          <- the app's entry point (loads the JS below)
        logo.png
        .htaccess           <- Apache rewrite for client-side routing
        assets/             <- the compiled app (JS + CSS)

WHY WE ARE DOING IT THIS WAY
----------------------------
We want the dashboard reachable at https://pertinencegroup.com/pg-dashboard/.

The normal approach would be a subdomain (dashboard.pertinencegroup.com), but
that needs a DNS record, and the domain's DNS is managed on AWS, which we do
not have access to. A URL *path* (/pg-dashboard/) is served by the existing web
server itself — no DNS record involved — so we can ship without touching DNS.

That is the whole reason this is a folder of files rather than a hosted service:
it slots in beside the existing WordPress site under the /pg-dashboard/ path,
leaving WordPress, its theme, plugins, and email completely untouched.

IMPORTANT: the URL path is compiled into this build. These files MUST be served
at exactly /pg-dashboard/. Renaming the folder to anything else will break the
app (it will load a blank page), because the asset links are hard-coded to
/pg-dashboard/. If the path ever needs to change, the app has to be rebuilt for
that path — see DEPLOYMENT_HANDOFF.md, Part 3.

WHERE IT GOES
-------------
Publish the "pg-dashboard" folder at the web root so it resolves as
<webroot>/pg-dashboard/index.html  (i.e. beside WordPress, NOT inside wp-content
or a theme). You know your setup — publish it the way you normally would.

Two things worth flagging:

- CLIENT-SIDE ROUTING. This is a single-page app: deep links like
  /pg-dashboard/sales are resolved by the app in the browser, not by real files
  on disk. So requests for any /pg-dashboard/* path must fall back to
  /pg-dashboard/index.html.
    * Apache: handled for you — the included pg-dashboard/.htaccess does this.
      Just ensure AllowOverride is on for the web root (it usually is, since
      WordPress relies on .htaccess too).
    * Nginx: .htaccess is ignored, so add a fallback in the server config:
          location /pg-dashboard/ {
              try_files $uri $uri/ /pg-dashboard/index.html;
          }

- SSL is whatever already covers pertinencegroup.com — no new certificate.

It works when:
    https://pertinencegroup.com/pg-dashboard/        -> shows the sign-in page
    https://pertinencegroup.com/pg-dashboard/sales   -> loads (does NOT 404)

WHAT YOU DO NOT NEED
--------------------
- No DNS changes.
- No new SSL certificate.
- No Node.js / database / server process.
- No changes to the WordPress site, its theme, plugins, or email.

NOTE FOR THE DASHBOARD OWNER (not the server admin)
---------------------------------------------------
One backend setting must be updated so password-reset emails point to the new
path — see DEPLOYMENT_HANDOFF.md, Part 2 (Supabase). The server admin does not
need to do this.
