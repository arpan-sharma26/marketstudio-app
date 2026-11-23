// The clients shown on the dashboard. To add a client: add an entry here and set
// its ad account ID as an environment variable in Cloudflare (Settings > Variables).
export const CLIENTS = [
  {
    id: "blooming-steps",
    name: "Blooming Steps Day Care",
    accountEnv: "META_ACCOUNT_BLOOMING_STEPS",
    tokenEnv: "META_TOKEN_BLOOMING_STEPS", // optional: overrides META_ACCESS_TOKEN for this client
    logo: "/assets/client-blooming-steps.png",
  },
  {
    id: "blooming-minds",
    name: "Blooming Minds Day Care",
    accountEnv: "META_ACCOUNT_BLOOMING_MINDS",
    tokenEnv: "META_TOKEN_BLOOMING_MINDS", // optional: overrides META_ACCESS_TOKEN for this client
    logo: "/assets/client-blooming-minds.png",
  },
  {
    id: "logicdental",
    name: "LogicDental Ai",
    accountEnv: "META_ACCOUNT_LOGICDENTAL",
    tokenEnv: "META_TOKEN_LOGICDENTAL", // optional: overrides META_ACCESS_TOKEN for this client
    logo: "/assets/client-logicdental.png",
  },
];

// Accepts "1234567890" or "act_1234567890".
export function normalizeAccountId(raw) {
  if (!raw) return null;
  const digits = String(raw).trim().replace(/^act_/, "");
  return /^\d{5,25}$/.test(digits) ? `act_${digits}` : null;
}
