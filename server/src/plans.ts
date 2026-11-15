/** Catálogo de planos. Edite aqui para mudar preços e créditos (o app lê tudo de /plans). */
export interface Plan {
  id: "free" | "basico" | "pro" | "estudio";
  name: string;
  /** créditos concedidos (1 crédito = 1 imagem gerada) */
  credits: number;
  /** preço em reais por mês (0 = grátis) */
  priceBRL: number;
  /** o plano grátis é concedido uma única vez, no cadastro */
  once?: boolean;
  popular?: boolean;
  /** ID do produto de assinatura na Play Console / App Store (o mesmo no RevenueCat) */
  productId?: string;
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Teste grátis",
    credits: 3,
    priceBRL: 0,
    once: true,
    perks: [
      "Veja sua roda pintada antes de pintar",
      "Organização de antes e depois: nunca mais perca as fotos",
      "Busca por voz com IA",
    ],
  },
  {
    id: "basico",
    name: "Básico",
    credits: 40,
    priceBRL: 39.9,
    productId: "basico_mensal",
    perks: [
      "Transforme a roda do seu cliente em 5 segundos",
      "Organização de antes e depois: ache rápido com 1 clique",
      "Busca modelos salvos pela voz com IA",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    credits: 100,
    priceBRL: 79.9,
    popular: true,
    productId: "pro_mensal",
    perks: [
      "Mostre ao cliente como a roda vai ficar antes de começar o serviço",
      "Organização de antes e depois por voz: nunca mais perca as fotos",
      "Busca por voz com IA",
      "Histórico de tudo o que você já fez",
    ],
  },
  {
    id: "estudio",
    name: "Estúdio",
    credits: 250,
    priceBRL: 199.9,
    productId: "estudio_mensal",
    perks: [
      "Feche mais serviços mostrando o resultado na hora",
      "Organização de antes e depois por voz: nunca mais perca as fotos",
      "Busca por voz com IA",
      "Histórico de tudo o que você já fez",
      "Para oficinas e lojas de rodas com muito movimento",
    ],
  },
];

export const planById = (id: string) => PLANS.find((p) => p.id === id);

/**
 * Acha o plano pelo ID do produto. No Google Play o RevenueCat manda "assinatura:plano-base"
 * (ex.: "pro_mensal:mensal"), então só vale a parte antes dos dois-pontos.
 */
export const planByProductId = (productId: string) => {
  const base = String(productId ?? "").split(":")[0];
  return PLANS.find((p) => p.productId && p.productId === base);
};
