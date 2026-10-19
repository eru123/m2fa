/**
 * Known issuer registry. Matching runs on a normalized
 * `issuer + label` string (lowercased, non-alphanumerics collapsed to
 * spaces) so variants like "Xendit Dashboard", "my.contabo.com",
 * "Amazon Web Services:root@1" or "AWS SSO" all resolve to one brand.
 * Order matters: the first matching entry wins, so specific brands are
 * listed before generic ones (AWS before Amazon, Atlassian before Jira).
 */
export interface Brand {
  id: string;
  name: string;
  test: RegExp;
  color: string;
  ink: string;
}

const b = (id: string, name: string, test: RegExp, color: string, ink = "#ffffff"): Brand => ({
  id,
  name,
  test,
  color,
  ink,
});

export const BRANDS: Brand[] = [
  b("aws", "AWS", /\baws\b|amazon web services/, "#f59e0b", "#1f2937"),
  b("amazon", "Amazon", /\bamazon\b/, "#ff9900", "#111827"),
  b("google", "Google", /\bgoogle\b|\bgmail\b|google workspace/, "#4285f4"),
  b("microsoft", "Microsoft", /microsoft|outlook|office ?365|onedrive|azure|\bmsn\b/, "#0078d4"),
  b("github", "GitHub", /github/, "#24292e"),
  b("gitlab", "GitLab", /gitlab/, "#fc6d26"),
  b("bitbucket", "Bitbucket", /bitbucket/, "#0052cc"),
  b("atlassian", "Atlassian", /atlassian|\bjira\b|confluence|trello/, "#0052cc"),
  b("cloudflare", "Cloudflare", /cloudflare/, "#f6821f", "#272c36"),
  b("discord", "Discord", /discord/, "#5865f2"),
  b("stripe", "Stripe", /stripe/, "#635bff"),
  b("paypal", "PayPal", /paypal/, "#003087"),
  b("facebook", "Facebook", /\bfacebook\b|\bmeta\b/, "#1877f2"),
  b("instagram", "Instagram", /instagram/, "#e1306c"),
  b("whatsapp", "WhatsApp", /whatsapp/, "#25d366", "#0b2414"),
  b("telegram", "Telegram", /telegram|\bt me\b/, "#229ed9"),
  b("x", "X", /twitter|\bx com\b/, "#0f1419"),
  b("reddit", "Reddit", /reddit/, "#ff4500"),
  b("linkedin", "LinkedIn", /linkedin/, "#0a66c2"),
  b("twitch", "Twitch", /twitch/, "#9146ff"),
  b("steam", "Steam", /steam/, "#1b2838"),
  b("apple", "Apple", /\bapple\b|icloud/, "#a2aaad", "#1f1f1f"),
  b("heroku", "Heroku", /heroku/, "#430098"),
  b("digitalocean", "DigitalOcean", /digital ?ocean/, "#0080ff"),
  b("linode", "Linode", /linode|akamai/, "#00a95c"),
  b("vultr", "Vultr", /vultr/, "#007bfc"),
  b("hetzner", "Hetzner", /hetzner/, "#d50c2d"),
  b("contabo", "Contabo", /contabo/, "#e8590c"),
  b("interserver", "InterServer", /inter ?server/, "#2f855a"),
  b("namecheap", "Namecheap", /namecheap/, "#de3723"),
  b("godaddy", "GoDaddy", /go ?daddy/, "#1f8a4c"),
  b("zoho", "Zoho", /zoho/, "#e42527"),
  b("okta", "Okta", /okta/, "#007dc1"),
  b("auth0", "Auth0", /auth ?0/, "#eb5424"),
  b("proton", "Proton", /proton(mail|vpn|drive|pass)?\b/, "#6d4aff"),
  b("binance", "Binance", /binance/, "#f0b90b", "#1f2937"),
  b("coinbase", "Coinbase", /coinbase/, "#0052ff"),
  b("kraken", "Kraken", /kraken/, "#7132f5"),
  b("kucoin", "KuCoin", /ku ?coin/, "#24ae8f", "#122b25"),
  b("pdax", "PDAX", /pdax/, "#143c8c"),
  b("xendit", "Xendit", /xendit/, "#3d64f4"),
  b("skiff", "Skiff", /skiff/, "#2962ff"),
  b("payshield", "PayShield", /payshield|uat ?shield|txshield/, "#2563eb"),
  b("skiddph", "SKIDD PH", /skiddph/, "#10b981", "#0a2e23"),
  b("euorg", "eu.org", /eu ?org/, "#2e7d32"),
  b("docker", "Docker", /docker/, "#2496ed"),
  b("npm", "npm", /\bnpm\b/, "#cb3837"),
  b("dropbox", "Dropbox", /dropbox/, "#0061ff"),
  b("slack", "Slack", /slack/, "#4a154b"),
  b("notion", "Notion", /notion/, "#efefef", "#1f1f1f"),
  b("figma", "Figma", /figma/, "#f24e1e"),
  b("vercel", "Vercel", /vercel/, "#111827"),
  b("openai", "OpenAI", /open ?ai/, "#10a37f", "#06251d"),
  b("anthropic", "Anthropic", /anthropic|claude/, "#d97757", "#2b1409"),
  b("yahoo", "Yahoo", /yahoo/, "#6001d2"),
];

export function normalizeBrandInput(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Find the brand for an entry; null falls back to the hashed initial tile.
 * The issuer is matched on its own first, so an email in the label (a
 * gmail/icloud address under a non-Google/Apple issuer) cannot hijack it. */
export function matchBrand(issuer: string, label: string): Brand | null {
  const normalizedIssuer = normalizeBrandInput(issuer);
  if (normalizedIssuer !== "") {
    for (const brand of BRANDS) {
      if (brand.test.test(normalizedIssuer)) return brand;
    }
  }
  const labelWithoutEmails = label.toLowerCase().replace(/\S+@\S+/g, " ");
  const haystack = normalizeBrandInput(`${issuer} ${labelWithoutEmails}`);
  if (haystack !== "") {
    for (const brand of BRANDS) {
      if (brand.test.test(haystack)) return brand;
    }
  }
  return null;
}
