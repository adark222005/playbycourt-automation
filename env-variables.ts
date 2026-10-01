import "dotenv/config";
import envVar from "env-var";
const TELEGRAM_BOT_TOKEN = envVar
  .get("TELEGRAM_BOT_TOKEN")
  .required()
  .asString();
const TELEGRAM_CHAT_ID = envVar.get("TELEGRAM_CHAT_ID").required().asString();
const COOKIE = envVar.get("COOKIE").required().asString();

// Scan parameters (optional — validated in parseScanParams based on mode)
const SCAN_START_DATE_OFFSET = envVar
  .get("SCAN_START_DATE_OFFSET")
  .default("")
  .asString();
const SCAN_END_DATE_OFFSET = envVar
  .get("SCAN_END_DATE_OFFSET")
  .default("")
  .asString();
const SCAN_START_HOUR = envVar.get("SCAN_START_HOUR").required().asFloat();
const SCAN_END_HOUR = envVar.get("SCAN_END_HOUR").required().asFloat();
const SCAN_SKIP_WEEKEND =
  envVar.get("SCAN_SKIP_WEEKEND").default("false").asString() === "true";
const SCAN_SKIP_WEEKDAYS = envVar
  .get("SCAN_SKIP_WEEKDAYS")
  .default("")
  .asString();
const SCAN_SPECIFIC_DATES = envVar
  .get("SCAN_SPECIFIC_DATES")
  .default("")
  .asString();
const SCAN_MIN_PLAYTIME_HOURS = envVar
  .get("SCAN_MIN_PLAYTIME_HOURS")
  .default("1.5")
  .asFloat();

const CLUBS = envVar
  .get("CLUBS")
  .required()
  .asString()
  .split(",")
  .map((s) => s.trim());
const MATCHPOINTER_API_KEY = envVar
  .get("MATCHPOINTER_API_KEY")
  .default("")
  .asString();
const GOPLAY_API_KEY = envVar.get("GOPLAY_API_KEY").required().asString();

export {
  CLUBS,
  MATCHPOINTER_API_KEY,
  GOPLAY_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  COOKIE,
  SCAN_START_DATE_OFFSET,
  SCAN_END_DATE_OFFSET,
  SCAN_START_HOUR,
  SCAN_END_HOUR,
  SCAN_SKIP_WEEKEND,
  SCAN_SKIP_WEEKDAYS,
  SCAN_SPECIFIC_DATES,
  SCAN_MIN_PLAYTIME_HOURS,
};
