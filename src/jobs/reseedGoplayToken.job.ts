import fs from "fs";
import path from "path";
import readline from "readline";
import "dotenv/config";

const SUPABASE_BASE = "https://hhifcmpdogsyijohomxk.supabase.co";
const OTP_URL = `${SUPABASE_BASE}/auth/v1/otp`;
const VERIFY_URL = `${SUPABASE_BASE}/auth/v1/verify`;

const API_KEY = process.env.GOPLAY_API_KEY;

const REFRESH_TOKEN_FILE = path.resolve(
  __dirname,
  "../../data/goplay_refresh_token",
);

// GoPlay account phone number in E.164 format (0543397331 -> +972543397331).
const PHONE = "+972543397331";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function requestOtp(phone: string): Promise<void> {
  const res = await fetch(OTP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY as string,
    },
    body: JSON.stringify({ phone }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to request OTP: ${res.status} ${body}`);
  }
}

async function verifyOtp(phone: string, token: string): Promise<string> {
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY as string,
    },
    body: JSON.stringify({ type: "sms", phone, token }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to verify OTP: ${res.status} ${body}`);
  }

  const data = JSON.parse(body);
  if (!data.refresh_token) {
    throw new Error(
      `Verify succeeded but no refresh_token in response: ${body}`,
    );
  }
  return data.refresh_token as string;
}

function storeRefreshToken(token: string): void {
  const dir = path.dirname(REFRESH_TOKEN_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(REFRESH_TOKEN_FILE, token, "utf8");
}

async function main() {
  if (!API_KEY) {
    throw new Error(
      "GOPLAY_API_KEY is not set. Add it to your .env before running.",
    );
  }

  const phone = PHONE;
  if (!/^\+\d{8,15}$/.test(phone)) {
    throw new Error(
      `Phone "${phone}" is not valid E.164. Expected something like +9725XXXXXXXX.`,
    );
  }

  console.log(`\n📱 Requesting SMS code for ${phone} ...`);
  await requestOtp(phone);
  console.log("✅ SMS requested. Check the phone for the code.\n");

  const code = await prompt("Enter the SMS code you received: ");
  if (!code) throw new Error("No code entered.");

  console.log("\n🔐 Verifying code ...");
  const refreshToken = await verifyOtp(phone, code);

  storeRefreshToken(refreshToken);

  console.log("\n🎉 Success! Fresh refresh token obtained and saved to:");
  console.log(`   ${REFRESH_TOKEN_FILE}`);
  console.log("\nRefresh token value:");
  console.log(`   ${refreshToken}`);
  console.log("\n──────────────────────────────────────────────");
  console.log("NEXT STEPS to revive the GitHub Actions chain:");
  console.log("──────────────────────────────────────────────");
  console.log(
    `1. Paste this token into SEED_REFRESH_TOKEN in\n` +
      `   src/utilities/goplayApi.util.ts :\n` +
      `   const SEED_REFRESH_TOKEN = "${refreshToken}";`,
  );
  console.log(
    `\n2. If the dead token cache still matches the current key, bump the token\n` +
      `   cache key version in .github/workflows/notify-court.yml (both the "key"\n` +
      `   and "restore-keys" lines), e.g. goplay-refresh-token-v2- -> ...-v3-.\n` +
      `   This orphans the dead cache WITHOUT deleting your slot-history cache.`,
  );
  console.log(
    `\n3. Commit + push both files, then trigger the notify-court workflow once.\n` +
      `   With no matching cache, it falls back to the fresh seed, logs in,\n` +
      `   rotates the token, and saves a new cache. Chain is alive again.`,
  );
  console.log("──────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
