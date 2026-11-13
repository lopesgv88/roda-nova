// Dicionário de marcas/modelos (foco Brasil + globais) e parser de frases tipo "civic 2018 preto fosco".

export const CATALOG: Record<string, string[]> = {
  Volkswagen: ["Gol", "Golf", "Polo", "Virtus", "Jetta", "Fox", "Up", "Saveiro", "T-Cross", "Nivus", "Tiguan", "Amarok", "Passat", "Fusca", "Voyage", "Santana", "Parati", "Kombi", "Taos"],
  Chevrolet: ["Onix", "Prisma", "Cruze", "Celta", "Corsa", "Astra", "Vectra", "Camaro", "S10", "Tracker", "Cobalt", "Spin", "Montana", "Opala", "Chevette", "Equinox", "Agile", "Meriva", "Zafira"],
  Fiat: ["Uno", "Palio", "Siena", "Strada", "Toro", "Argo", "Cronos", "Mobi", "Punto", "Bravo", "Idea", "Fiorino", "Pulse", "Fastback", "Linea", "Stilo", "Doblo"],
  Ford: ["Ka", "Fiesta", "Focus", "Fusion", "EcoSport", "Ranger", "Mustang", "Escort", "Edge", "Courier", "Maverick"],
  Honda: ["Civic", "Fit", "City", "HR-V", "CR-V", "Accord", "WR-V"],
  Toyota: ["Corolla", "Hilux", "Etios", "Yaris", "Camry", "RAV4", "SW4", "Prius", "Supra", "Land Cruiser"],
  Hyundai: ["HB20", "HB20S", "Creta", "Tucson", "i30", "ix35", "Elantra", "Azera", "Veloster", "Santa Fe"],
  Nissan: ["March", "Versa", "Kicks", "Sentra", "Frontier", "Tiida", "GT-R", "370Z", "350Z", "Skyline"],
  Renault: ["Sandero", "Logan", "Duster", "Kwid", "Clio", "Fluence", "Captur", "Megane", "Oroch"],
  Jeep: ["Renegade", "Compass", "Commander", "Wrangler", "Cherokee"],
  Peugeot: ["208", "206", "207", "307", "308", "408", "2008", "3008"],
  Citroën: ["C3", "C4", "C4 Cactus", "Aircross", "Xsara Picasso"],
  Mitsubishi: ["Lancer", "L200", "Pajero", "ASX", "Eclipse"],
  Subaru: ["Impreza", "WRX", "Forester", "BRZ"],
  Kia: ["Sportage", "Cerato", "Sorento", "Picanto", "Soul", "Stonic"],
  BMW: ["320i", "328i", "M3", "M4", "X1", "X3", "X5", "Série 3", "Série 1", "118i", "M2"],
  "Mercedes-Benz": ["Classe A", "Classe C", "C180", "C200", "A200", "CLA", "GLA", "E350", "AMG GT"],
  Audi: ["A3", "A4", "A5", "Q3", "Q5", "TT", "RS3", "S3"],
  Porsche: ["911", "Cayenne", "Macan", "Boxster", "Cayman"],
  Dodge: ["Challenger", "Charger", "Ram"],
  Mazda: ["MX-5", "RX-7", "RX-8", "Mazda3", "Mazda6"],
  Lexus: ["IS", "RC", "NX"],
  Volvo: ["XC60", "XC90", "S60"],
  Suzuki: ["Jimny", "Vitara", "Swift"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y"],
};

// apelidos populares -> modelo canônico
const ALIASES: Record<string, string> = {
  "vw": "Volkswagen",
  "volks": "Volkswagen",
  "chevy": "Chevrolet",
  "gm": "Chevrolet",
  "merc": "Mercedes-Benz",
  "mercedes": "Mercedes-Benz",
  "benz": "Mercedes-Benz",
  "citroen": "Citroën",
  "golfinho": "Golf",
  "fusquinha": "Fusca",
  "hb 20": "HB20",
  "hb20": "HB20",
  "hrv": "HR-V",
  "crv": "CR-V",
  "wrv": "WR-V",
  "tcross": "T-Cross",
  "t cross": "T-Cross",
  "eco sport": "EcoSport",
  "ecosport": "EcoSport",
  "sw 4": "SW4",
  "land cruiser": "Land Cruiser",
  "gtr": "GT-R",
  "mx5": "MX-5",
  "mx 5": "MX-5",
  "gol quadrado": "Gol",
  "gol bolinha": "Gol",
  "gol g5": "Gol",
  "gol g6": "Gol",
  "gol g7": "Gol",
  "golf mk7": "Golf",
  "golf gti": "Golf",
  "civic si": "Civic",
  "civic g10": "Civic",
};

export const COLORS: Record<string, string> = {
  preto: "preto", preta: "preto", black: "preto", grafite: "cinza", cinza: "cinza", cinzento: "cinza", chumbo: "cinza", gray: "cinza", grey: "cinza",
  branco: "branco", branca: "branco", white: "branco", prata: "prata", prateado: "prata", silver: "prata",
  vermelho: "vermelho", vermelha: "vermelho", red: "vermelho", azul: "azul", blue: "azul", verde: "verde", green: "verde",
  amarelo: "amarelo", amarela: "amarelo", yellow: "amarelo", laranja: "laranja", orange: "laranja",
  dourado: "dourado", dourada: "dourado", gold: "dourado", bronze: "bronze", rosa: "rosa", roxo: "roxo", roxa: "roxo",
  marrom: "marrom", bege: "bege", champagne: "champagne", cobre: "cobre",
};

/** Palavras de enchimento da fala ("opala roda cinza", "quero ver o corolla") que não identificam o carro. */
const STOP = new Set([
  "roda", "rodas", "aro", "aros", "cor", "cores", "de", "do", "da", "dos", "das", "o", "a", "os", "as", "um", "uma",
  "com", "e", "no", "na", "em", "ano", "modelo", "carro", "carros", "foto", "fotos", "pintada", "pintado", "pintadas",
  "quero", "ver", "mostra", "mostrar", "tem", "meu", "minha", "para", "pra", "por", "favor", "busca", "buscar", "procura",
]);

/** Cores canônicas citadas num texto livre: "Preta fosca" -> {preto}; "grafite" -> {cinza}. */
export function colorKeys(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of norm(text ?? "").split(" ")) if (COLORS[w]) out.add(COLORS[w]);
  return out;
}

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compacta para comparação tolerante: "HB 20", "hb-20" e "HB20" viram "hb20". */
export function compact(s: string): string {
  return norm(s).replace(/[\s-]/g, "");
}

export interface ParsedQuery {
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  finish?: string;
  rest: string;
}

// Índice: chave compacta -> { make, model }
type Hit = { make: string; model: string };
const modelIndex: Array<{ key: string; hit: Hit }> = [];
const makeIndex: Array<{ key: string; make: string }> = [];

for (const [make, models] of Object.entries(CATALOG)) {
  makeIndex.push({ key: compact(make), make });
  for (const model of models) modelIndex.push({ key: compact(model), hit: { make, model } });
}
for (const [alias, target] of Object.entries(ALIASES)) {
  if (CATALOG[target]) makeIndex.push({ key: compact(alias), make: target });
  else {
    const found = modelIndex.find((m) => m.hit.model === target);
    if (found) modelIndex.push({ key: compact(alias), hit: found.hit });
  }
}
// longest first para "c4 cactus" antes de "c4", "hb20s" antes de "hb20"
modelIndex.sort((a, b) => b.key.length - a.key.length);
makeIndex.sort((a, b) => b.key.length - a.key.length);

const FINISHES = ["fosco", "brilhante", "metalico", "perolado", "cromado", "polido", "diamantado", "acetinado", "dois tons", "bicolor"];

export function parseQuery(input: string): ParsedQuery {
  let text = norm(input);
  const out: ParsedQuery = { rest: "" };

  const y = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (y) {
    out.year = Number(y[1]);
    text = text.replace(y[0], " ");
  } else {
    const y2 = text.match(/\b(?:ano|de)\s+(\d{2})\b/);
    if (y2) {
      const n = Number(y2[1]);
      out.year = n > 40 ? 1900 + n : 2000 + n;
      text = text.replace(y2[0], " ");
    }
  }

  for (const f of FINISHES) {
    if (text.includes(f)) {
      out.finish = f === "metalico" ? "metálico" : f;
      break;
    }
  }

  const words = text.split(" ");
  for (const w of words) {
    if (COLORS[w]) {
      out.color = COLORS[w];
      break;
    }
  }

  // Modelo: procura sequência de palavras (1-3) cuja forma compacta bate no índice.
  const tokens = text.split(" ").filter(Boolean);
  outer: for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const key = compact(tokens.slice(i, i + size).join(" "));
      const hit = modelIndex.find((m) => m.key === key);
      if (hit) {
        out.make = hit.hit.make;
        out.model = hit.hit.model;
        tokens.splice(i, size);
        break outer;
      }
    }
  }
  if (!out.make) {
    for (const t of tokens) {
      const m = makeIndex.find((x) => x.key === compact(t));
      if (m) {
        out.make = m.make;
        break;
      }
    }
  }
  out.rest = tokens
    .filter((t) => !STOP.has(t) && !COLORS[t] && !FINISHES.some((f) => f.split(" ").includes(t)))
    .join(" ");
  return out;
}

export function suggest(prefix: string, limit = 8): string[] {
  const p = compact(prefix);
  if (!p) return [];
  const all: string[] = [];
  for (const [make, models] of Object.entries(CATALOG)) {
    for (const model of models) all.push(`${make} ${model}`);
  }
  return all.filter((s) => compact(s).includes(p)).slice(0, limit);
}
