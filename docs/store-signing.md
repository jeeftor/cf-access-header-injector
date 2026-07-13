# Browser-store signing and release guide

This repository intentionally keeps extension source public while using browser stores for browser-trusted
installation and updates. GitHub provenance proves how the ZIP was built; Chrome Web Store and Mozilla are the
authorities that sign extensions for their browsers.

## One-time Chrome Web Store setup

1. Register the Google account that will own the item in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   Chrome requires two-step verification and may present a developer agreement or payment step. Review and
   accept those in your own account; they cannot be accepted by this repository or CI.
2. Upload `dist/cf-access-header-injector.zip` manually once. Complete the Store Listing and Privacy tabs, set
   the intended visibility, and publish it. The initial manual publish is required before CI can publish later
   updates through the API.
3. Create a Google Cloud OAuth web client with the Chrome Web Store scope. Store the three long-lived
   credentials below only in the protected GitHub environment, never in git:

   - `CWS_CLIENT_ID` (secret)
   - `CWS_CLIENT_SECRET` (secret)
   - `CWS_REFRESH_TOKEN` (secret)

4. Put the Store's publisher and item identifiers in the same environment:

   - `CWS_PUBLISHER_ID` (GitHub Actions variable)
   - `CWS_ITEM_ID` (GitHub Actions variable)

Chrome Web Store signs and delivers the resulting CRX. `codesign` and a macOS signing certificate do not apply
to this pure WebExtension. A separate CRX private key is not generated or stored by this project.

## One-time Firefox setup

1. Register the owning account in [AMO Developer Hub](https://addons.mozilla.org/developers/).
   Review the Firefox Add-on Distribution Agreement there.
2. Create AMO API credentials and save them as protected GitHub environment secrets:

   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`

3. The workflow requests an **unlisted** AMO signature and uploads the signed XPI to the corresponding GitHub
   Release. Firefox Release and Beta accept that Mozilla-signed XPI.

An unlisted Firefox XPI is signed but does not automatically update unless the extension supplies a secure
`update_url` and update manifest. Public AMO listing provides automatic updates without operating that
infrastructure. Choose that distribution model before the first Firefox release; it changes the manual AMO
submission and release workflow.

## GitHub Actions configuration

Create a repository environment named `extension-signing`. Add the Store secrets and identifiers listed above to
that environment. The manual `Publish browser stores` workflow uses the environment, so you can require an
approval there before any credential is made available to a job. Create the non-sensitive repository variables
`PUBLISH_CHROME` and `PUBLISH_FIREFOX` separately; leave each empty until its store setup is complete, then set
it to `true` to enable tag-triggered publication.

Once the corresponding repository variable is set to `true`, every tagged GitHub release
publishes the configured store automatically after the protected-environment approval. The Chrome job submits the
package for Store review. The Firefox job signs the staged extension through AMO, adds the XPI to the existing
GitHub Release, and attests that XPI with GitHub provenance.

The manual **Publish browser stores** workflow is reserved for the first publication and for backfilling an
existing release. Enter its tag, select only the store you intend to publish to, and approve the protected
environment.

## Chrome Web Store listing material

Use the following factual text when filling in the initial listing:

- **Single purpose:** Add a Cloudflare Access service-token header pair only to the HTTPS domains the user
  explicitly configures and enables.
- **Permissions:** `storage` keeps the user-entered site profiles locally; `declarativeNetRequest` adds the two
  fixed headers; optional HTTPS host permissions are requested only for each enabled scope.
- **Data handling:** Client ID, Client Secret, and user-configured domain scopes stay in local extension storage.
  The two credentials are sent only to requests matching the user-approved scope. No telemetry, analytics,
  advertising, cloud sync, or developer-operated server exists.
- **Privacy policy URL:** `https://github.com/jeeftor/cf-access-header-injector/blob/master/PRIVACY.md`

Use the non-sensitive listing images in `store-assets/chrome/`. Do not upload screenshots containing a real
Client ID, Client Secret, Cloudflare account data, or protected hostname.

## Verify a release

Download the ZIP and verify its provenance:

```sh
gh attestation verify cf-access-header-injector.zip --repo jeeftor/cf-access-header-injector
```

For a Firefox release, inspect the downloaded XPI in Firefox's Add-ons Manager and confirm it reports Mozilla as
the signer. For Chrome, install through the Chrome Web Store listing and confirm future version updates arrive
through the Store.
