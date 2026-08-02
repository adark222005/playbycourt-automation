import { checkCourtAvailability } from "@services/findAvailableSlots.service";
import { parseScanParams } from "@src/utilities/scanParams.util";
import { loadActiveClubs } from "@src/utilities/clubConfig.util";
import { CLUBS } from "env-variables";

async function main(): Promise<void> {
  const clubs = loadActiveClubs(CLUBS);
  if (clubs.length === 0) {
    console.error("No valid club configurations found. Exiting.");
    process.exit(1);
  }

  const params = parseScanParams();
  if (params === null) {
    console.log("No future dates to scan. Exiting.");
    return;
  }

  await checkCourtAvailability(params, clubs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
