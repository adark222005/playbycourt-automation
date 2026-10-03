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
  console.log("NEXT STEP to revive the GitHub Actions chain:");
  console.log("──────────────────────────────────────────────");
  console.log(
    `Update the GitHub repo secret GOPLAY_SEED_REFRESH_TOKEN with this value:\n` +
      `   ${refreshToken}\n\n` +
      `No commit needed. On the next run, if the cached token is dead the job\n` +
      `falls back to this seed, logs in, rotates, and saves a fresh cache.`,
  );
  console.log("──────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
