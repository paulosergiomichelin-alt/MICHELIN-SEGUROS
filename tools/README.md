# Cotar no Agger — Userscript

Automatiza login, navegação e preenchimento do formulário de nova cotação no Aggilizador a partir dos dados de um lead do CRM Michelin.

## Onde fica o arquivo

`public/agger-userscript.user.js` — servido em `/agger-userscript.user.js` (Vite serve `public/` na raiz).

## Como o usuário instala (fluxo final)

1. Ao abrir o CRM, se o userscript **não estiver instalado**, aparece um banner dourado pulsante no rodapé do menu lateral: **"Cotar no Agger — Instalar ferramenta"**.
2. Ao clicar no banner, abre um modal com 3 passos:
   - Instalar a extensão Tampermonkey (link Chrome/Edge ou Firefox).
   - Clicar em **"Abrir instalação do script"** — o Tampermonkey detecta o `.user.js` e pede confirmação.
   - Recarregar a página do CRM.
3. Após recarregar, o userscript marca `document.documentElement.dataset.michelinAggerInstalled = '1.0.0'`. O React detecta e esconde o banner automaticamente.

## Onde o botão "Cotar no Agger" aparece

- **Ficha do lead** (sidebar à direita ao abrir um lead): botão dourado abaixo do follow-up.
- **Cadastro/edição** (`LeadForm`): botão entre as seções de cotação e o rodapé Cancelar/Salvar.

Ambos só funcionam corretamente se o userscript estiver instalado. Sem ele, o botão abre o Agger em nova aba mas você terá que logar e preencher manualmente.

## Detecção de instalação

- Userscript tem `@match http://localhost:*/*`, `@match http://127.0.0.1:*/*`, `@match https://*.vercel.app/*`.
  Se o CRM for hospedado em outro domínio, adicione um `@match` correspondente.
- No CRM ele só seta `document.documentElement.dataset.michelinAggerInstalled = '1.0.0'` e dispara `window.dispatchEvent(new CustomEvent('michelin-agger:installed'))`.
- O hook `useAggerUserscriptInstalled` em `src/lib/agger-userscript.ts` poll-a por 5s após mount + escuta o evento.

## Como o fluxo de cotação funciona

1. Botão no CRM serializa o lead em base64 URL-safe e abre `https://aggilizador.com.br/login#michelin_lead=<base64>`.
2. Userscript no domínio do Agger lê o hash, salva em `sessionStorage`, limpa o hash da URL (não vaza em prints/histórico).
3. Tela de login: preenche e-mail/senha, submete.
4. Após login: navega `Nova Cotação → Automóvel → Carro` (heurística por texto do clicável).
5. Formulário: preenche os campos por id/name/placeholder/label (busca heurística).
6. Limpa `sessionStorage`. Você confere os campos e finaliza manualmente.

## Quando algo não preenche

O Agger pode ter nomes diferentes de campos. Para ajustar:

1. No Agger, **F12** → **Elements** → clique no campo problemático.
2. Veja `id`, `name`, `placeholder` ou o texto da `<label>`.
3. Abra o userscript no painel da Tampermonkey (clique no ícone → painel → clique no script).
4. Em `CONFIG.selectors.quoteForm`, adicione o termo identificador:
   ```js
   plate: ['placa', 'plate', 'numeroPlaca'],  // adicionado 'numeroPlaca'
   ```
5. Salve (Ctrl+S) e recarregue o Agger.

`findField` testa: `id` → `name` → `placeholder` → `aria-label` → texto de `<label>` (case-insensitive, ignora pontuação). Basta um termo bater.

## Quando o login não funciona

Edite `CONFIG.selectors.login` no mesmo arquivo, ou `CONFIG.credentials` (se e-mail/senha mudou).

## Quando a navegação para "Carro" não funciona

Adicione strings em `CONFIG.selectors.navigation`:

```js
novaCotacao: ['Nova cotação', 'Nova Cotação', 'Cotação', 'Cotar', 'Nova proposta'],
```

## Segurança

- O hash da URL **não** é enviado ao servidor do Agger (browsers nunca enviam fragmento `#` em requisições HTTP).
- O hash é removido logo após leitura.
- Dados ficam em `sessionStorage` (apenas a aba ativa, apaga ao fechar) e são limpos ao fim do fluxo.
- Credenciais do Agger ficam **apenas** no userscript local (sua máquina), **nunca** no repositório do CRM.

## Como atualizar o script depois

1. Edite `public/agger-userscript.user.js`.
2. Suba a versão no header (`@version 1.0.0` → `1.1.0`).
3. Comite e faça deploy.
4. Tampermonkey detecta atualização automaticamente (configurável no painel).
