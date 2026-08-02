import { ClubConfig, MatchPointerClubConfig } from "./types.util";
import * as fs from "fs";
import * as path from "path";

const CLUBS_JSON_PATH = path.resolve(__dirname, "../../config/clubs.json");

/**
 * Loads all club configs from config/clubs.json, validates each entry,
 * and filters to only the active clubs specified by name.
 */
export function loadActiveClubs(activeClubNames: string[]): ClubConfig[] {
  const allClubs = loadAndValidateClubsFile();

  const activeSet = new Set(
    activeClubNames.map((n) => n.trim()).filter((n) => n.length > 0),
  );

  const activeClubs: ClubConfig[] = [];
  const foundNames = new Set<string>();

  for (const club of allClubs) {
    if (activeSet.has(club.name)) {
      activeClubs.push(club);
      foundNames.add(club.name);
    }
  }

  // Warn about names in env that don't exist in the JSON
  for (const name of activeSet) {
    if (!foundNames.has(name)) {
      console.error(
        `Club "${name}" specified in CLUBS env var not found in config/clubs.json`,
      );
    }
  }

  return activeClubs;
}

/**
 * Reads and validates config/clubs.json. Throws on file read or JSON parse errors.
 * Individual invalid entries are logged and skipped.
 */
function loadAndValidateClubsFile(): ClubConfig[] {
  let raw: string;
  try {
    raw = fs.readFileSync(CLUBS_JSON_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read clubs config file at ${CLUBS_JSON_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parseClubConfigs(raw);
}

/**
 * Parses a JSON string into validated ClubConfig[].
 * Invalid entries are logged and excluded.
 */
export function parseClubConfigs(clubsJson: string): ClubConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(clubsJson);
  } catch (err) {
    throw new Error(
      `Failed to parse clubs JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Clubs config must be a JSON array, got: ${typeof parsed}`);
  }

  const validConfigs: ClubConfig[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const raw = parsed[i];
    const provider =
      raw && typeof raw === "object" && "provider" in raw
        ? (raw as Record<string, unknown>).provider
        : undefined;

    switch (provider) {
      case "playbypoint": {
        const result = validateFacilityIdConfig(raw, "playbypoint");
        if (typeof result === "string") {
          console.error(
            `Club config at index ${i}: invalid playbypoint config — ${result}`,
          );
        } else {
          validConfigs.push(result);
        }
        break;
      }
      case "matchpointer": {
        const result = validateMatchPointerConfig(raw);
        if (typeof result === "string") {
          console.error(
            `Club config at index ${i}: invalid matchpointer config — ${result}`,
          );
        } else {
          validConfigs.push(result);
        }
        break;
      }
      case "goplay": {
        const result = validateFacilityIdConfig(raw, "goplay");
        if (typeof result === "string") {
          console.error(
            `Club config at index ${i}: invalid goplay config — ${result}`,
          );
        } else {
          validConfigs.push(result);
        }
        break;
      }
      default:
        console.error(
          `Club config at index ${i}: unknown or missing provider "${String(provider)}"`,
        );
        break;
    }
  }

  return validConfigs;
}

function validateFacilityIdConfig(
  raw: unknown,
  provider: "playbypoint" | "goplay",
):
  | { name: string; facilityId: string; provider: "playbypoint" | "goplay" }
  | string {
  if (!raw || typeof raw !== "object") return "entry is not an object";

  const obj = raw as Record<string, unknown>;
  const name = obj.name;
  const facilityId = obj.facilityId;

  if (typeof name !== "string" || name.trim() === "")
    return `missing or empty "name"`;
  if (typeof facilityId !== "string" || facilityId.trim() === "")
    return `missing or empty "facilityId"`;

  return { name, provider, facilityId };
}

function validateMatchPointerConfig(
  raw: unknown,
): MatchPointerClubConfig | string {
  if (!raw || typeof raw !== "object") return "entry is not an object";

  const obj = raw as Record<string, unknown>;
  const name = obj.name;
  const venueId = obj.venueId;

  if (typeof name !== "string" || name.trim() === "")
    return `missing or empty "name"`;
  if (typeof venueId !== "string" || venueId.trim() === "")
    return `missing or empty "venueId"`;

  return {
    name,
    provider: "matchpointer",
    venueId,
  };
}
