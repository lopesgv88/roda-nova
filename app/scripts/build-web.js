/**
 * Monta a versão WEB do app dentro de ../server/web (servida em /app/).
 * Uso: npm run build:web
 * Depois do `expo export`, ajusta o index.html: sem zoom ao tocar em campos, página volta ao topo
 * quando o teclado fecha, e ícone/título para "Adicionar à Tela de Início" no iPhone.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const out = path.resolve(root, "../server/web");

fs.rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir "${out}"`, { stdio: "inherit", cwd: root, env: { ...process.env, CI: "1" } });

const KEYBOARD_FIX = `
(function () {
  function isField(el) { return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName); }
  function toTop() {
    if (isField(document.activeElement)) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
  document.addEventListener('focusout', function () { setTimeout(toTop, 120); setTimeout(toTop, 450); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      if (Math.abs(window.visualViewport.height - window.innerHeight) < 80) setTimeout(toTop, 60);
    });
  }
})();
`;

const head = [
  '<meta name="theme-color" content="#16161b" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Roda Nova" />',
  '<link rel="apple-touch-icon" href="/app/apple-touch-icon.png" />',
  "<style>html,body{background:#16161b;}</style>",
].join("\n    ");

const file = path.join(out, "index.html");
let html = fs.readFileSync(file, "utf8");
html = html
  .replace('<html lang="en">', '<html lang="pt-BR">')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />')
  .replace("</head>", `    ${head}\n  </head>`)
  .replace("</body>", `  <script>${KEYBOARD_FIX}</script>\n</body>`);
fs.writeFileSync(file, html);

// ícone da tela inicial do iPhone (180x180)
try {
  const sharp = require(path.resolve(root, "../server/node_modules/sharp"));
  sharp(path.join(root, "assets/icon.png")).resize(180, 180).png().toFile(path.join(out, "apple-touch-icon.png")).then(() => console.log("web pronta em", out));
} catch {
  console.log("web pronta em", out, "(sem ícone da tela inicial)");
}
