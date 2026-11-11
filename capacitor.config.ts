import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.pixelwild.game",
  appName: "Pixelwild",
  webDir: "dist",
  android: { backgroundColor: "#101e20" },
  server: { androidScheme: "https" },
};
export default config;
