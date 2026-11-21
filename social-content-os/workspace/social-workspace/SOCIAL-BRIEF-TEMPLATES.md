# Brand-specific social brief templates

## Use it

1. From **Client accounts**, add or select a brand. New accounts land in **Content Planner → Foundation**. Open **Social brief template**, or use **Client accounts → Brief template** at any time.
2. Enter the brand description, time zone, primary/accent colors and writing rules. Optionally add a PNG/JPEG/WebP logo (500 KB) and PDF brand book (2 MB). Only the selected account's local template is changed.
3. Edit starter labels and help, add text, long-text, URL or date fields, and use **Move up / Move down** with mouse or keyboard. Mark fields required as appropriate, preview the new form and save.
4. **New content** uses the selected account's saved template and displays its brand references. Required fields must be provided when creating or saving a brief version. A calendar or research proposal can still exist as a draft; brand requirements must be resolved before production readiness. Accounts with no saved template keep the original flow.
5. Existing briefs and existing imports do not change. A new brief snapshots the field schema, so updating the template does not relabel existing answers or invalidate previous briefs. Brand profile and assets shown above a brief reflect that account's current settings.

The starter set covers objective, audience, key message, working caption, call to action, visual direction, evidence/reference URL, success measure and accessibility/rights. Channel, format, proposed date and owner remain part of the shared workflow. For calibration, see [Adobe’s creative brief guide](https://business.adobe.com/blog/basics/creative-brief) and [Asana’s creative brief template guide](https://asana.com/resources/how-write-creative-brief-examples-template).

## Storage and availability

Templates, uploaded files and answers use the existing IndexedDB workspace and its backup/export features. They are saved in the browser, not uploaded to a shared server or synced across people or devices. Workspace administrator permissions are local workflow simulation, not a production security boundary. The same hosted origin and browser profile are required to retain saved data; switching to a new domain or device requires an intentional backup/restore. Do not add confidential client materials to a shared browser profile. For collaboration, use authenticated users, server-enforced brand scopes, shared asset storage and versioned approvals.

## Verification

From this directory: `node --test tests/social-brief-template.test.cjs`. Tests cover two distinct brands, file signature checks, wrong-account and stale-template checks, required fields, persistence through JSON round-trip, and unchanged original records.

Browser smoke: add two fictional accounts; create one required text field and one required URL field; reorder and preview the first template; verify each account shows only its own custom field. Attempt blank creation and blank revision saving, reject a non-HTTP(S) URL, then save valid answers and reload both briefs. Reopen a template, cancel a change and verify the old saved value. Return to a seeded brand and verify account details and post count are unchanged.
