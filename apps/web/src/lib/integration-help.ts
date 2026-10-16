import type { IntegrationId } from "@/lib/integrations";

export type HelpLink = {
  label: string;
  href: string;
};

export type IntegrationHelp = {
  /** Used for the popover trigger's aria-label ("Como obter as chaves do <platformLabel>"). */
  platformLabel: string;
  steps: string[];
  notes?: string[];
  links: HelpLink[];
};

/** Step-by-step content for each integration's "ⓘ" popover. PT-BR, kept in
 * sync with the product spec — not sourced from the backend. */
export const INTEGRATION_HELP: Record<IntegrationId, IntegrationHelp> = {
  youtube: {
    platformLabel: "YouTube",
    steps: [
      "Acesse console.cloud.google.com e crie um projeto.",
      'Em "APIs e serviços > Biblioteca", ative "YouTube Data API v3".',
      'Em "Tela de consentimento OAuth", escolha Externo, preencha nome/e-mail e adicione os escopos youtube.upload e youtube.readonly; enquanto o app estiver em teste, adicione seu e-mail em "Usuários de teste".',
      'Em "Credenciais > Criar credenciais > ID do cliente OAuth", tipo "Aplicativo da Web", e em "URIs de redirecionamento autorizados" cole a redirect URI abaixo.',
      "Copie o ID do cliente e a Chave secreta do cliente para cá.",
    ],
    notes: [
      "Cota padrão de 10.000 unidades/dia (~6 uploads).",
      "Vídeos ficam privados até o projeto passar na auditoria da API do YouTube.",
      'Uma mesma credencial serve para todos os seus canais — cada canal é conectado separadamente em "Conectar".',
    ],
    links: [{ label: "Ativar YouTube Data API v3", href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" }],
  },
  tiktok: {
    platformLabel: "TikTok",
    steps: [
      'Acesse developers.tiktok.com, entre e vá em "Manage apps > Connect an app".',
      "Adicione os produtos Login Kit e Content Posting API; solicite os escopos video.upload e video.publish.",
      "Cadastre a redirect URI (o TikTok exige HTTPS — em ambiente local use um túnel como ngrok ou Cloudflare Tunnel e ajuste PUBLIC_API_URL).",
      "Copie Client key e Client secret da página do app.",
    ],
    notes: ["Até o app ser auditado pelo TikTok, as postagens ficam privadas (SELF_ONLY)."],
    links: [{ label: "TikTok for Developers — Meus apps", href: "https://developers.tiktok.com/apps" }],
  },
  instagram: {
    platformLabel: "Instagram",
    steps: [
      'Acesse developers.facebook.com > Meus apps > Criar app (tipo Business).',
      'Adicione os produtos "Login do Facebook para Empresas" e "API do Instagram".',
      "A conta do Instagram precisa ser Business/Creator e estar ligada a uma Página do Facebook.",
      'Em "Configurações > Básico", copie o ID do app e a Chave secreta; em Login, adicione a redirect URI em "URIs de redirecionamento do OAuth válidos".',
      "A permissão instagram_content_publish exige Revisão do App da Meta para uso com outras contas.",
    ],
    links: [{ label: "Meta for Developers — Meus apps", href: "https://developers.facebook.com/apps" }],
  },
  facebook: {
    platformLabel: "Facebook",
    steps: [
      'Acesse developers.facebook.com > Meus apps > Criar app (tipo Business) — pode ser o mesmo app usado para o Instagram.',
      'Adicione o produto "Login do Facebook para Empresas".',
      'Em "Configurações > Básico", copie o ID do app e a Chave secreta; em Login, adicione a redirect URI em "URIs de redirecionamento do OAuth válidos" (abaixo).',
      "Permissões de publicação em Páginas (pages_manage_posts, publish_video) exigem Revisão do App.",
    ],
    links: [{ label: "Meta for Developers — Meus apps", href: "https://developers.facebook.com/apps" }],
  },
  bilibili: {
    platformLabel: "Bilibili",
    steps: [
      "Publicação automática exige cadastro aprovado na Bilibili Open Platform (open.bilibili.com).",
      'Enquanto não houver aprovação, use "Adicionar conta manual": o sistema gera um pacote (vídeo + título + tags) para upload manual.',
      "Se tiver aprovação, cadastre aqui client_id e client_secret.",
    ],
    links: [{ label: "Bilibili Open Platform", href: "https://open.bilibili.com" }],
  },
  vimeo: {
    platformLabel: "Vimeo",
    steps: [
      'Acesse developer.vimeo.com/apps e clique em "Create an app" (entre com a conta Vimeo que vai publicar).',
      "Preencha nome e descrição; marque que o app será usado só por você/sua equipe se aplicável.",
      'Na página do app, em "Authentication", adicione a redirect URI abaixo em "App Callback URLs".',
      'Copie o "Client identifier" e o "Client secret" (em "Manage App Secrets") para cá.',
      'Uploads usam o escopo "upload"; dependendo da conta, o Vimeo pode exigir que você solicite acesso de upload na página do app.',
    ],
    notes: [
      "Vídeos verticais são aceitos, mas o Vimeo não é plataforma de Shorts.",
      "Monetização no Vimeo não é por anúncios (é via Vimeo OTT/On Demand) — use-o mais como vitrine/portfólio.",
      "Planos gratuitos têm limite semanal de upload.",
    ],
    links: [{ label: "Vimeo Developer — Meus apps", href: "https://developer.vimeo.com/apps" }],
  },
  anthropic: {
    platformLabel: "Anthropic (IA)",
    steps: [
      "Acesse console.anthropic.com e crie uma conta/organização.",
      'Em "Billing", adicione créditos.',
      'Em "API Keys", clique em "Create Key" e copie a chave (ela só aparece uma vez).',
    ],
    notes: ["Sem a chave, o sistema gera títulos simples automaticamente."],
    links: [{ label: "Anthropic Console — API Keys", href: "https://console.anthropic.com/settings/keys" }],
  },
  elevenlabs: {
    platformLabel: "ElevenLabs (narração)",
    steps: [
      "Acesse elevenlabs.io e entre (ou crie uma conta).",
      'Clique no seu perfil e abra "Profile > API Keys".',
      'Clique em "Create API Key", defina as permissões necessárias (Text to Speech) e copie a chave.',
    ],
    notes: [
      "Uso comercial das vozes (publicar vídeos monetizados) exige um plano pago; o plano gratuito é só para teste.",
      "A chave é usada para gerar a narração dos episódios das Séries IA.",
    ],
    links: [{ label: "ElevenLabs — API Keys", href: "https://elevenlabs.io/app/settings/api-keys" }],
  },
  openai: {
    platformLabel: "OpenAI",
    steps: [
      "Acesse platform.openai.com/api-keys e entre na sua conta.",
      'Adicione créditos em "Billing" se ainda não houver saldo.',
      'Clique em "Create new secret key" e copie a chave (ela só aparece uma vez).',
    ],
    notes: ["Reservada para provedores de imagem/vídeo que usem a OpenAI nas Séries IA."],
    links: [{ label: "OpenAI — API keys", href: "https://platform.openai.com/api-keys" }],
  },
};
