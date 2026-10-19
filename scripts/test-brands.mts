// Sanity check for the issuer matcher against real-world issuer strings.
// Run: node scripts/test-brands.mts
import { matchBrand } from "../src/brands.ts";

const cases: Array<[string, string, string | null]> = [
  ["Google", "quadrangle.ph@gmail.com", "Google"],
  ["", "Heroku", "Heroku"],
  ["Discord", "Discord", "Discord"],
  ["GitHub", "eru123", "GitHub"],
  ["jerichouser.ipo-servers.net", "jericho", null],
  ["Amazon Web Services", "2fas@998", "AWS"],
  ["AWS SSO", "jerichodev", "AWS"],
  ["UAT Shield", "UAT Shield", "PayShield"],
  ["Microsoft", "jericho@payshield.ai", "Microsoft"],
  ["txshield.payshield.ai", "Jericho", "PayShield"],
  ["Skiff", "jerichoaquino", "Skiff"],
  ["Cloudflare", "yeoligoakino@gmail.com", "Cloudflare"],
  ["Stripe", "Stripe", "Stripe"],
  ["My.InterServer", "InterServerTwo-FactorAuth", "InterServer"],
  ["eu.org", "JA1014-FREE", "eu.org"],
  ["my.contabo.com", "Contabo-Customer-Control-Panel-12343050", "Contabo"],
  ["Xendit Dashboard", "jericho@skiddph.com", "Xendit"],
  ["Google", "ballesterjenjie.psuq@gmail.com", "Google"],
  ["Facebook", "lighty262", "Facebook"],
  ["Zoho", "jericho@tesladevelopment.net", "Zoho"],
  ["PayPal", "yeoligoakino@gmail.com", "PayPal"],
  ["PDAX", "softies_rejects6k@icloud.com", "PDAX"],
  ["Instagram", "lighty262", "Instagram"],
  ["Billing", "user_1", null],
  ["interseptx.com", "support", null],
  ["vps2672274", "root@vps2672274", null],
];

let failed = 0;
for (const [issuer, label, expected] of cases) {
  const got = matchBrand(issuer, label)?.name ?? null;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(issuer)} + ${JSON.stringify(label)} -> ${got}${expected === null ? "" : ` (want ${expected})`}`);
}
console.log(failed === 0 ? "\nall match" : `\n${failed} mismatches`);
process.exit(failed === 0 ? 0 : 1);
