/** Envio de e-mail (recuperação de senha). Sem configuração, só escreve no log do servidor (modo de desenvolvimento). */
export interface Mailer {
  name: string;
  send(to: string, subject: string, text: string): Promise<void>;
}

export const consoleMailer: Mailer = {
  name: "console",
  async send(to, subject, text) {
    console.log(`[e-mail simulado] para=${to} assunto="${subject}"\n${text}`);
  },
};

/** Resend (resend.com): defina RESEND_API_KEY e MAIL_FROM (ex.: "Roda Nova <nao-responda@seudominio.com.br>"). */
export const resendMailer: Mailer = {
  name: "resend",
  async send(to, subject, text) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

export function getMailer(): Mailer {
  return process.env.RESEND_API_KEY && process.env.MAIL_FROM ? resendMailer : consoleMailer;
}
