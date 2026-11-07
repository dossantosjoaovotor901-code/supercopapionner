import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  getChampionshipSnapshot,
  saveChampionshipSnapshot,
} from "./championship";
import { closeDb } from "./db";

const OFFICIAL_NAME = "Super Copa Pionner";
const OFFICIAL_LOGO =
  "/manus-storage/rn_image_picker_lib_temp_1d5a53c6-975a-4be9-97d2-ab7fd426a83b_4004faa9.png";

export async function updateTournamentBrand() {
  try {
    const snapshot = await getChampionshipSnapshot();
    if (
      snapshot.state.config.name === OFFICIAL_NAME &&
      snapshot.state.config.logoUrl === OFFICIAL_LOGO
    ) {
      return {
        updated: false,
        name: OFFICIAL_NAME,
        revision: snapshot.revision,
      };
    }
    const state = structuredClone(snapshot.state);
    state.config.name = OFFICIAL_NAME;
    state.config.logoUrl = OFFICIAL_LOGO;
    // Replace only the old demonstration name in demonstration announcements.
    if (state.config.demo) {
      state.announcements = state.announcements.map(item => ({
        ...item,
        title: item.title.replaceAll("Copa dos Campeões", OFFICIAL_NAME),
        text: item.text.replaceAll("Copa dos Campeões", OFFICIAL_NAME),
      }));
    }
    const updated = await saveChampionshipSnapshot(state, snapshot.revision);
    return {
      updated: true,
      name: updated.state.config.name,
      revision: updated.revision,
      teams: updated.state.teams.length,
      players: updated.state.players.length,
      matches: updated.state.matches.length,
    };
  } finally {
    await closeDb();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  updateTournamentBrand()
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error(
        "Não foi possível atualizar a identidade:",
        error instanceof Error ? error.message : "erro desconhecido"
      );
      process.exitCode = 1;
    });
}
