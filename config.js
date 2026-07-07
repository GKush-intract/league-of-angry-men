// config.js — site configuration. SHEET_ENDPOINT is the Google Apps Script
// Web App /exec URL that receives Phase 2 bracket submissions.
// Leave '' to run in PREVIEW MODE (no POST; the app shows the JSON to copy).
export const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwI_rN2BTtMRjLPOf9Az69LDyTTX7m7rYdNtXaHrDwKdddGJwsWsWQSbAWN2vujzUHD/exec';
// SHEET_ENDPOINT_P3 receives Phase 3 (QF→Final) submissions — a separate sheet +
// Apps Script deployment (see docs/apps-script-setup.md, Phase 3 section).
// Leave '' to run in PREVIEW MODE until the new web app is deployed.
export const SHEET_ENDPOINT_P3 = 'https://script.google.com/macros/s/AKfycbx-PntsHjyWPmQG6chdcSm_VKcqBpwuKc89gJkR75ytzSdP2CxDNwXiVUA8v8AwscRR8A/exec';
