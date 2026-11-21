/**
 * Textos legais do Roda Nova (RASCUNHO). Preencha as variáveis LEGAL_* no .env e peça a um advogado
 * para revisar antes de publicar nas lojas.
 */
export type LegalId = "privacy" | "terms" | "deletion";

const v = () => ({
  company: process.env.LEGAL_COMPANY || "[PREENCHER: nome do MEI / razão social]",
  cnpj: process.env.LEGAL_CNPJ || "[PREENCHER: CNPJ]",
  email: process.env.LEGAL_EMAIL || "[PREENCHER: e-mail de contato]",
  updated: process.env.LEGAL_UPDATED || "12 de novembro de 2026",
});

export const TERMS_VERSION = "2026-11-12";

function privacy() {
  const { company, cnpj, email, updated } = v();
  return {
    title: "Política de Privacidade",
    body: `Última atualização: ${updated}

Esta Política explica como o aplicativo Roda Nova ("app") trata seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).

1. Quem é o responsável
${company}, CNPJ ${cnpj}. Contato e encarregado de dados: ${email}.

2. Quais dados coletamos
• Conta: e-mail e senha (a senha é guardada de forma protegida, nunca em texto aberto).
• Fotos: as fotos de carros que você envia para pintar as rodas, as imagens geradas e as fotos que você salva na sua biblioteca.
• Dados da biblioteca: modelo, ano, cor da roda e observações que você digita.
• Voz: quando você usa a busca por voz, o áudio é enviado para ser transformado em texto e não é guardado depois disso.
• Uso e segurança: registros técnicos (data, hora, tipo de erro, endereço de rede) para manter o serviço seguro e funcionando.
• Plano e créditos: seu plano e o saldo de imagens. Os pagamentos são processados pela Apple ou pela Google; não recebemos os dados do seu cartão.

3. Para que usamos
Para criar sua conta, gerar as imagens que você pede, guardar sua biblioteca, controlar créditos e planos, prevenir fraudes e abusos, atender seu suporte e cumprir obrigações legais.

4. Com quem compartilhamos
As fotos e os textos que você envia para gerar imagens são processados por provedores de inteligência artificial contratados por nós (por exemplo Google, OpenAI e serviços intermediários como o OpenRouter), que podem estar fora do Brasil. Eles recebem apenas o necessário para gerar o resultado. Usamos também serviços de hospedagem e de envio de e-mail. Não vendemos seus dados.
Por isso, evite enviar fotos que mostrem pessoas, rostos ou placas legíveis. Antes de usar a geração de imagens, pedimos seu consentimento para esse envio.

5. Por quanto tempo guardamos
Guardamos seus dados enquanto sua conta existir. Você pode apagar fotos da biblioteca e do histórico, ou excluir a conta inteira a qualquer momento pelo app (Conta > Excluir minha conta). Ao excluir a conta, apagamos seus dados e suas fotos, salvo o que a lei nos obrigar a manter.

6. Seus direitos
Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e eliminação dos dados, e revogar o consentimento. Fale conosco em ${email}.

7. Segurança
Usamos conexão protegida (HTTPS), senhas protegidas, limites contra abuso e acesso restrito aos dados. Nenhum sistema é 100% seguro; em caso de incidente relevante, avisaremos você e a autoridade competente, conforme a lei.

8. Crianças e adolescentes
O app é destinado a maiores de 18 anos.

9. Mudanças nesta Política
Podemos atualizar este texto. Quando houver mudança importante, avisaremos pelo app.

10. Contato
Dúvidas ou pedidos: ${email}.`,
  };
}

function terms() {
  const { company, cnpj, email, updated } = v();
  return {
    title: "Termos de Uso",
    body: `Última atualização: ${updated}

Ao criar uma conta no Roda Nova, você concorda com estes Termos e com a Política de Privacidade.

1. O serviço
O Roda Nova usa inteligência artificial para mostrar como as rodas de um carro ficariam em outra cor ou acabamento, a partir de uma foto que você envia. Também oferece uma biblioteca para guardar trabalhos já feitos. O serviço é prestado por ${company}, CNPJ ${cnpj}.

2. O resultado é uma simulação
As imagens são geradas por inteligência artificial e servem como uma prévia ilustrativa. Cor, brilho e detalhes podem diferir da pintura real. Não garantimos que o resultado seja idêntico ao que será obtido na prática, nem que a IA acerte sempre.

3. Conta e segurança
Você é responsável por manter sua senha em segredo e pelas atividades feitas na sua conta. Informe-nos se suspeitar de uso indevido.

4. Créditos e planos
Cada imagem gerada usa 1 crédito. Ao criar a conta você recebe créditos de teste. Os planos pagos oferecem uma quantidade mensal de créditos, que expira ao fim do período, salvo informação diferente no app. Imagens que falharem ou forem recusadas por estarem fora do escopo não consomem crédito. Preços e quantidades podem mudar, com aviso prévio.

5. Pagamentos e reembolsos
As assinaturas são cobradas e gerenciadas pela Apple App Store ou pela Google Play, e seguem as regras de cobrança, cancelamento e reembolso dessas lojas. Você pode cancelar a qualquer momento pelas configurações da sua conta na loja.

6. Seu conteúdo
Você declara que tem o direito de usar as fotos que envia e que elas não violam direitos de terceiros. Não envie fotos com pessoas, rostos ou placas legíveis, nem conteúdo ilegal, ofensivo ou que não seja de carros. Você mantém a propriedade das suas fotos e nos autoriza a processá-las, inclusive por provedores de IA, apenas para prestar o serviço.

7. Uso permitido
O app é exclusivo para visualizar rodas de veículos. É proibido tentar burlar os limites e as proteções, usar o serviço para fins ilegais, sobrecarregar a infraestrutura, copiar ou revender o serviço sem autorização, ou enviar conteúdo fora do propósito do app. Podemos suspender ou encerrar contas que violem estas regras.

8. Disponibilidade
Fazemos o possível para manter o app funcionando, mas podem ocorrer interrupções, lentidão ou erros dos provedores de IA. Podemos alterar ou descontinuar funcionalidades.

9. Limitação de responsabilidade
Na máxima extensão permitida pela lei, não nos responsabilizamos por decisões de compra ou de pintura tomadas com base nas imagens geradas, nem por danos indiretos. Isso não afasta direitos garantidos pelo Código de Defesa do Consumidor.

10. Alterações e lei aplicável
Podemos atualizar estes Termos e avisaremos pelo app. Estes Termos seguem as leis do Brasil; fica eleito o foro do domicílio do consumidor.

11. Contato
${email}.`,
  };
}

function deletion() {
  const { company, cnpj, email, updated } = v();
  return {
    title: "Exclusão de conta e dados",
    body: `Última atualização: ${updated}

Aplicativo: Roda Nova. Desenvolvedor: ${company}, CNPJ ${cnpj}.

Como excluir sua conta pelo app
1. Abra o Roda Nova e entre na sua conta.
2. Vá na aba Conta e toque em "Excluir minha conta".
3. Confirme com a sua senha.

Como pedir a exclusão sem acessar o app
Envie um e-mail para ${email} a partir do endereço cadastrado na conta, com o assunto "Excluir minha conta Roda Nova". Atendemos o pedido em até 15 dias.

O que é apagado
Sua conta (e-mail e senha), a biblioteca de carros e rodas, o histórico de gerações, as fotos enviadas e as imagens geradas, e os códigos de acesso. A exclusão é definitiva.

O que pode ser mantido
Registros de cobrança e notas relacionados a assinaturas podem ser guardados pelo tempo exigido pela legislação fiscal. As gravações de voz da busca não são armazenadas: são processadas e descartadas.

Assinaturas
Excluir a conta não cancela automaticamente a assinatura na Google Play. Cancele antes em Play Store > Pagamentos e assinaturas > Assinaturas.`,
  };
}

export function legalDoc(id: string) {
  return id === "privacy" ? privacy() : id === "terms" ? terms() : id === "deletion" ? deletion() : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Página pública (as lojas pedem uma URL para a política de privacidade). */
export function legalHtml(id: string): string | null {
  const d = legalDoc(id);
  if (!d) return null;
  const body = esc(d.body)
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)} – Roda Nova</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px 18px 60px;line-height:1.6;color:#1b1b20}h1{font-size:28px}p{margin:0 0 14px}</style></head>
<body><h1>${esc(d.title)}</h1>${body}</body></html>`;
}
