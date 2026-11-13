import type { ImageData, ImageProvider, WheelBox } from "./providers/types.js";

export const REFUSAL = {
  notCar: "Só consigo editar fotos de carros. Envie uma foto de um carro com as rodas visíveis.",
  noWheels: "Não consegui ver as rodas nessa foto. Envie uma foto em que pelo menos uma roda apareça bem.",
  offTopic: "Eu só pinto rodas de carros. Diga a cor e o acabamento que deseja para as rodas.",
};

export type ScopeVerdict = { ok: true; wheels: WheelBox[] } | { ok: false; message: string; code: "not_car" | "no_wheels" | "off_topic" };

/** Barreira em 2 camadas: filtro de texto barato + classificador de visão. Nunca chama o gerador se falhar. */
const BLOCKED = /(ignore|esque[cç]a|desconsidere).{0,30}(instru|regra|anterior)|system prompt|nude|nua\b|arma\b|rosto|pessoa|deepfake/i;

export async function checkScope(
  provider: ImageProvider,
  image: ImageData,
  request: string,
): Promise<ScopeVerdict> {
  if (BLOCKED.test(request)) return { ok: false, code: "off_topic", message: REFUSAL.offTopic };
  const s = await provider.classify(image, request);
  if (!s.isCar) return { ok: false, code: "not_car", message: REFUSAL.notCar };
  if (!s.wheelsVisible) return { ok: false, code: "no_wheels", message: REFUSAL.noWheels };
  if (!s.requestAboutWheelPaint) return { ok: false, code: "off_topic", message: REFUSAL.offTopic };
  return { ok: true, wheels: s.wheels ?? [] };
}

export function buildEditPrompt(o: { color: string; finish?: string; details?: string }): string {
  return `Você é um especialista em personalização automotiva. Edite a foto fornecida pintando as RODAS (aros) do carro na cor "${o.color}"${
    o.finish ? ` com acabamento ${o.finish}` : ""
  }.${o.details ? ` Detalhes pedidos pelo cliente: ${o.details}.` : ""}

REGRAS OBRIGATÓRIAS:
- Altere SOMENTE as rodas/aros visíveis (todas as rodas aparentes, de forma consistente). Não pinte pneus, pinças de freio, calotas de centro a menos que pedido, nem a carroceria.
- Preserve exatamente o carro, a cor da carroceria, o fundo, o enquadramento, a perspectiva, a resolução e a iluminação.
- Mantenha CADA roda exatamente na mesma posição, tamanho, ângulo e formato da imagem original (nada pode se mover nem mudar de escala), inclusive os pneus. Só a cor e o acabamento do aro mudam.
- Se a imagem for um recorte mostrando apenas as rodas, devolva o recorte com exatamente o mesmo enquadramento e proporção.
- A nova pintura deve seguir a geometria real dos raios, respeitar sombras, reflexos e brilho da cena, com bordas limpas e aparência fotorealista.
- Não adicione texto, marcas d'água, pessoas ou objetos. Devolva apenas a imagem editada.`;
}
