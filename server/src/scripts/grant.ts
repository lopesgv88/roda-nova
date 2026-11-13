// Uso:  npm run grant -- email@exemplo.com 50
// Soma créditos a uma conta (ex.: conta de demonstração para os revisores da Apple/Google).
import { db } from "../db.js";

const [email, amountRaw] = process.argv.slice(2);
const amount = Number(amountRaw);
if (!email || !Number.isInteger(amount) || amount === 0) {
  console.error("Uso: npm run grant -- email@exemplo.com 50");
  process.exit(1);
}
const r = db.prepare("UPDATE users SET credits = MAX(0, credits + ?) WHERE email = ?").run(amount, email.trim().toLowerCase());
if (!r.changes) {
  console.error(`Nenhuma conta com o e-mail ${email}.`);
  process.exit(1);
}
const u = db.prepare("SELECT email, plan, credits FROM users WHERE email = ?").get(email.trim().toLowerCase()) as any;
console.log(`OK: ${u.email} agora tem ${u.credits} créditos (plano ${u.plan}).`);
