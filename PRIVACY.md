# Privacy policy

CF Access Header Injector operates entirely in your browser profile. It has no account system, analytics,
advertising, remote configuration, telemetry, or server operated by this project.

## Information you provide

You enter a Cloudflare Access Client ID, Client Secret, HTTPS domain scope, and enabled/disabled setting for
each site profile. The extension stores those values only in your browser's local extension storage. It does
not synchronize them through the browser's cloud-sync service.

## How the information is used

When you enable a profile and approve its narrow HTTPS host permission, the extension adds the Client ID and
Client Secret as the two Cloudflare Access service-token headers only to requests that match that profile's
scope. The headers are sent directly to the site you selected, as required for Cloudflare Access service-token
authentication. The extension does not read request or response bodies, browser history, cookies, or page
content.

## Sharing and retention

This project does not receive, retain, sell, share, or transfer your information. Your browser retains the
local configuration until you remove a site or choose **Forget all credentials**. Your selected site receives
the two authentication headers as described above; that site's own privacy practices apply to its handling of
those requests.

## Security

Browser extension storage is not a hardware-backed secret vault. Use dedicated, least-privilege Cloudflare
service tokens, keep scopes narrow, and revoke affected tokens if the browser profile or device is compromised.

Last updated: 2026-07-13.
