import type { ImageProvider } from "./types.js";

/** Provedor de teste: aprova tudo e devolve a própria foto. Use só para testar o fluxo do app. */
export const mockProvider: ImageProvider = {
  name: "mock",
  async classify() {
    return { isCar: true, wheelsVisible: true, requestAboutWheelPaint: true, reason: "mock" };
  },
  async edit(image) {
    return image;
  },
};
