import { Preferences } from "@capacitor/preferences";
import { saveSchema } from "./validation";
import type { Save } from "./world";
export async function readSave(): Promise<Save | undefined> {
  try {
    const { value } = await Preferences.get({ key: "pixelwild-world" });
    if (value) return saveSchema.parse(JSON.parse(value));
  } catch {
    /* A corrupt save is kept as backup until the player saves a valid world. */
  }
  return undefined;
}
export async function writeSave(state: Save) {
  state.updated = Date.now();
  const value = JSON.stringify(state);
  await Preferences.set({ key: "pixelwild-world", value });
}
