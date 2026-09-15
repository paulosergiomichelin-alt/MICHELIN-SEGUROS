# Design System MICHELIN SEGUROS — Sub-projeto 1: Fundação

> Este é o primeiro de 3 sub-projetos do esforço de padronização visual do sistema:
> **1. Design System (este documento)** → 2. Migração visual das telas existentes → 3. Modais para rotas dedicadas.
> Cada sub-projeto tem sua própria spec e seu próprio plano de implementação.

## Contexto e motivação

O sistema tem hoje 41 arquivos com cores hardcoded (`bg-[#...]`, `bg-slate-900`, `text-white` etc., 683 ocorrências) em vez de usar os tokens CSS de tema já existentes em `src/index.css`. Isso causa dois problemas visíveis:

1. **Telas escuras dentro do tema light** — desde que o tema padrão passou a ser light, várias telas continuam parcialmente escuras porque usam cores fixas em vez de tokens que respeitam o tema ativo.
2. **Inconsistência tipográfica** — cada tela define seus próprios tamanhos de fonte, pesos e espaçamentos, porque não existe uma biblioteca de componentes compartilhada. `src/index.css` tenta remendar isso com 74 overrides `!important`, uma abordagem frágil reconhecida no próprio arquivo como temporária ("mantidos até migração completa dos componentes").

Este sub-projeto constrói a fundação — paleta, tipografia e componentes base — que os sub-projetos seguintes vão usar para migrar as telas de fato. Este sub-projeto **não migra nenhuma tela existente**; cria a base e aplica em componentes novos/isolados apenas onde necessário para validar.

## Paleta de cores — "Azul Confiança"

Direção validada visualmente com o usuário: azul-marinho corporativo como cor primária (padrão do setor de seguros, transmite solidez), com o dourado da marca (`#CFA764` → refinado para `#C08A3E`) reduzido ao papel de destaque pontual — nunca mais como fundo/contorno de estados ativos junto com azul.

### Tokens de tema (light — novo padrão)

| Token CSS | Valor | Uso |
|---|---|---|
| `--color-primary` | `#1B4D8F` | Botões primários, links, foco de input, ícones de ação |
| `--color-primary-hover` | `#153E73` | Hover de botão primário |
| `--color-accent` | `#C08A3E` | Marca (logo), item de menu ativo, ícones de destaque — nunca como fundo de card ou botão primário |
| `--color-accent-soft` | `#E0B87A` | Texto sobre fundo escuro quando o accent precisa de mais contraste |
| `--color-success` | `#1F8A4C` | Badges de sucesso, confirmações |
| `--color-success-bg` | `#E4F5EA` | Fundo de badge de sucesso |
| `--color-warning` | `#B8860B` | Badges de aviso/pendência |
| `--color-warning-bg` | `#FFF3DC` | Fundo de badge de aviso |
| `--color-danger` | `#C0392B` | Badges de erro, ações destrutivas |
| `--color-danger-bg` | `#FDE4E4` | Fundo de badge de erro |
| `--bg-primary` | `#FFFFFF` | Fundo principal da área de conteúdo |
| `--bg-secondary` | `#F4F7FB` | Fundo de página (atrás dos cards) |
| `--bg-elevated` | `#F8FAFD` | Fundo de elementos elevados (dropdowns, popovers) |
| `--bg-input` | `#FFFFFF` | Fundo de campos de formulário |
| `--text-primary` | `#0F2A4A` | Texto principal |
| `--text-muted` | `#5B7591` | Texto secundário/legendas |
| `--text-subtle` | `rgba(15, 42, 74, 0.35)` | Placeholders, texto desabilitado |
| `--text-inverse` | `#FFFFFF` | Texto sobre fundo escuro/primário |
| `--border-subtle` | `rgba(15, 42, 74, 0.08)` | Bordas de card padrão |
| `--border-medium` | `rgba(15, 42, 74, 0.15)` | Bordas de input, divisores |
| `--border-strong` | `rgba(15, 42, 74, 0.25)` | Bordas com mais ênfase |

### Tokens de tema (dark — mantido para o toggle Configurações → Geral)

| Token CSS | Valor |
|---|---|
| `--bg-primary` | `#0B1420` |
| `--bg-secondary` | `#0F1B2B` |
| `--bg-elevated` | `#152234` |
| `--bg-input` | `#0F1B2B` |
| `--text-primary` | `#F2F5F9` |
| `--text-muted` | `#8FA3BC` |
| `--text-subtle` | `rgba(242, 245, 249, 0.25)` |
| `--text-inverse` | `#0B1420` |
| `--border-subtle` | `rgba(255, 255, 255, 0.06)` |
| `--border-medium` | `rgba(255, 255, 255, 0.12)` |
| `--border-strong` | `rgba(255, 255, 255, 0.22)` |
| `--color-primary` | `#3E7BC4` (mais claro que no light, para contraste sobre fundo escuro) |
| `--color-primary-hover` | `#5A93D6` |
| `--color-accent` | `#C08A3E` (igual ao light — a marca não muda por tema) |
| `--color-success` / `--color-warning` / `--color-danger` | mesmos valores do light — cores semânticas não variam por tema, só o fundo dos badges (`-bg`) fica mais escuro/translúcido: `rgba(31,138,76,0.18)`, `rgba(184,134,11,0.18)`, `rgba(192,57,43,0.18)` respectivamente |

### Zona protegida: Sidebar

A sidebar continua **sempre escura independente do tema ativo** (comportamento já implementado via `.light .sidebar-main` em `src/index.css`, reescopando os tokens dentro daquele seletor). Os valores usados dentro dessa zona mudam para a nova paleta:

```css
.sidebar-main {
  --bg-primary:   #0B1420;
  --bg-secondary: #0F1B2B;
  --bg-elevated:  #152234;
  --text-primary: #FFFFFF;
  --text-muted:   #8FA3BC;
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-medium: rgba(255, 255, 255, 0.12);
}
```

Como já vale hoje: no tema dark essas variáveis coincidem com as variáveis globais (a zona protegida existe para forçar o mesmo valor quando o tema global é light). O bloco `.light .sidebar-main` recebe esses valores; o bloco `:root .sidebar-main` não precisa de override porque o dark global já usa cores próximas — mas deve ser adicionado explicitamente com os mesmos valores acima para desacoplar a sidebar de qualquer mudança futura nos tokens globais do tema dark.

**Item ativo do menu** (variação "A" aprovada visualmente): fundo `rgba(255,255,255,0.04)`, barra de 3px em `--color-accent` encostada na borda esquerda com `border-radius: 0 3px 3px 0`, texto do item em `--color-accent`. Itens inativos: texto em `--text-muted`, sem fundo. Nenhum uso de `--color-primary` (azul) dentro da sidebar — o azul é reservado à área de conteúdo.

## Tipografia

Fonte única em todo o sistema: **Sora** (Google Fonts, pesos 400/600/700/800), substituindo a combinação atual Montserrat + Cinzel. Cinzel sai completamente — inclusive do nome da marca na sidebar, que passa a usar Sora 800 como as demais telas, mantendo apenas a cor dourada (`--color-accent`) na palavra "SEGUROS" como toque de identidade.

Escala fixa de tamanhos (tokens `--text-*`, todos em `rem` com `font-family: var(--font-sans)` = Sora):

| Token | Tamanho | Peso | Uso |
|---|---|---|---|
| `--text-label` | 9-10px | 800, uppercase, tracking 0.05em | Rótulos de campo, badges, seções de menu |
| `--text-body-sm` | 11-12px | 500-600 | Texto secundário, legendas, linhas de tabela densa |
| `--text-body` | 12-13px | 500-600 | Corpo padrão de formulário e listas |
| `--text-card-title` | 12-13px | 700-800, uppercase | Título de card/seção (ex: "Segurado", "Cobertura") |
| `--text-page-title` | 14-16px | 800-900, uppercase, tracking largo | Título de página (H1 de cada tela) |
| `--text-display` | 20-24px | 800 | Números de destaque (ex: valor de prêmio) |

Essa escala já está em uso informal no `MulticalculoPage.tsx` (reescrito na sessão anterior) — este sub-projeto a formaliza em tokens CSS e a torna a referência oficial para todo componente novo.

## Layout padrão de página (PageShell)

Hoje cada tela reimplementa sua própria estrutura de wrapper — padding, largura, espaçamento entre seções variam arquivo por arquivo (ex: `MulticalculoPage.tsx` usa `p-4 md:p-6 max-w-[1600px] mx-auto space-y-5`, enquanto `RenovacoesPage.tsx` usa `p-4 md:p-6 space-y-6` sem limite de largura). Isso é o mesmo problema de inconsistência que os componentes atômicos resolvem, só que em nível de estrutura de página.

Decisão validada visualmente com o usuário: **largura sempre total** (opção "B" — sem `max-width` central), para aproveitar 100% do espaço disponível mesmo em monitores ultra-wide.

Estrutura padrão, encapsulada no componente `PageShell` (ver lista de componentes abaixo):
- Padding externo consistente: `p-4 md:p-6` em todas as telas de conteúdo único.
- Espaçamento vertical entre seções: `space-y-5`.
- `PageHeader` sempre como primeiro filho dentro do `PageShell`, nunca desenhado à mão pela tela.
- Sem `max-width`/`mx-auto` — o conteúdo ocupa toda a largura disponível da área de conteúdo (a área à direita da sidebar).
- **Exceção**: telas de 2 painéis fixos com navegação própria (WhatsApp, E-mail) não usam `PageShell` — já têm sua própria estrutura de colunas full-height/full-width e ficam fora deste padrão por natureza, não por exceção arbitrária.

## Componentes base (`src/components/ui/`)

Cada componente é um arquivo próprio, tipado, sem lógica de negócio — apenas apresentação usando os tokens acima. Lista completa aprovada:

1. **`Button.tsx`** — variantes `primary` (fundo `--color-primary`), `secondary` (fundo transparente, borda `--border-medium`), `danger` (fundo `--color-danger`), `ghost` (sem fundo/borda, hover sutil). Tamanhos `sm`/`md`. Suporta `icon` (lucide-react), `loading` (spinner substitui o ícone), `disabled`.
2. **`Card.tsx`** — contêiner com `bg-[var(--bg-primary)]`, borda `--border-subtle`, `rounded-2xl`, padding padrão. Prop opcional `title` + `icon` que renderiza o cabeçalho no padrão `--text-card-title`.
3. **`Input.tsx`** — campo de texto com label acoplado (usa `--text-label`), estado de erro (borda `--color-danger` + mensagem), estado de foco (`--color-primary`). Suporta uma prop opcional `action` (ícone + `onClick`) para casos como "buscar veículo pelo ano" ou "buscar CEP": o ícone fica **integrado ao mesmo retângulo do input** (dividido por uma borda interna sutil, mesmo fundo `--bg-input`), nunca como um botão azul separado — variação validada visualmente com o usuário, que rejeitou o botão de busca em `--color-primary` por competir com a ação principal da tela.
4. **`Select.tsx`** — mesmo tratamento visual do `Input`, wrapper de `<select>` nativo (mantém acessibilidade e comportamento mobile nativo).
5. **`Textarea.tsx`** — mesmo padrão do `Input`, multi-linha.
6. **`Checkbox.tsx`** — caixa customizada usando `--color-primary` quando marcada, label ao lado.
7. **`Badge.tsx`** — variantes `success`/`warning`/`danger`/`neutral`, usando os pares `--color-*`/`--color-*-bg`. Usado para status (lead fechado/pendente/perdido, NFS-e emitida/cancelada etc.).
8. **`PageHeader.tsx`** — título (`--text-page-title`) + subtítulo opcional (`--text-body-sm`, `--text-muted`) + slot de ações à direita (botões). Padroniza o cabeçalho que hoje cada tela desenha à mão.
9. **`PageShell.tsx`** — wrapper de página: aplica o padding/espaçamento padrão descritos na seção "Layout padrão de página" acima e recebe `title`/`subtitle`/`actions` (repassados ao `PageHeader` interno) + `children` para o conteúdo. Toda tela de conteúdo único passa a abrir com `<PageShell title="..." actions={...}>`.
10. **`Modal.tsx`** — substitui `src/components/Modal.tsx` atual: overlay `--bg-overlay`, painel `--bg-primary` com `--border-subtle`, cabeçalho com título + botão fechar, footer opcional de ações. (Nota: os modais que o sub-projeto 3 vai converter em rotas primeiro migram para este componente no sub-projeto 2, e são removidos/simplificados no sub-projeto 3 — não é retrabalho, é o caminho de menor risco.)
11. **`EmptyState.tsx`** — ícone + título + descrição + ação opcional, para listas vazias (nenhum lead, nenhuma cotação etc.).
12. **`Skeleton.tsx`** — já existe em `src/components/Skeleton.tsx`; este sub-projeto só ajusta suas cores para os novos tokens, sem mudar a API.

Cada componente exporta seus tipos de props e é usado como `import { Button, Card } from '../../components/ui'` via um `index.ts` barrel em `src/components/ui/`.

## O que muda em `src/index.css`

- Troca do `@import` de fonte: remove Cinzel/Montserrat, adiciona Sora.
- Bloco `@theme`: `--color-gold-deep`/`--color-gold-light` renomeados para refletir o novo papel (`--color-accent`, `--color-accent-soft`); adiciona `--color-primary`, `--color-primary-hover`, `--color-success`, `--color-warning`, `--color-danger` e seus pares `-bg`.
- Blocos `:root` e `.light`: valores atualizados conforme as tabelas acima.
- Bloco `.sidebar-main` (zona protegida): valores atualizados para a paleta azul-marinho, adicionado também sob `:root .sidebar-main` (hoje só existe sob `.light`).
- Os 74 overrides `!important` **não são removidos neste sub-projeto** — continuam existindo até o sub-projeto 2 migrar cada tela para os componentes novos. Eles recebem uma atualização mínima de cores (mesmos seletores, valores dos novos tokens) para que as telas não migradas não fiquem visualmente quebradas enquanto o sub-projeto 2 não roda.

## Fora de escopo (sub-projetos seguintes)

- Migrar as 41 telas existentes para os novos componentes — **Sub-projeto 2**.
- Remover os overrides `!important` de `index.css` — acontece tela por tela, conforme migrada, no Sub-projeto 2.
- Converter os 8 modais (`EventEditorModal`, `EmitirNfseModal`, `QRCodeModal`, `SystemDocumentationModal`, `DashboardDetailModal`, `UserProfileModal`, e os usos de `Modal.tsx` genérico) em rotas dedicadas — **Sub-projeto 3**.
- Revisão do fluxo de light/dark toggle em si (já implementado, fora de escopo).

## Critérios de sucesso

- `src/components/ui/` existe com os 12 componentes listados, cada um tipado e exportado via barrel.
- `npx tsc --noEmit` e `npm run build` passam sem erros.
- Uma tela de exemplo é migrada para os novos componentes, incluindo o `PageShell`, como prova de conceito — validando visualmente paleta, tipografia e o novo layout full-width em uso real antes do Sub-projeto 2 começar a migração em massa. **Nota**: a tela `DashboardPage.tsx` ("Início") originalmente cogitada como candidata foi excluída do sistema (o usuário não a utilizava); em seu lugar, a rota `/renovacoes` (rotulada "Dashboard" no menu, a que o usuário efetivamente usa) foi movida para `/dashboard` e já recebeu a paleta Azul Confiança + layout full-width diretamente, servindo como a prova de conceito real do Sub-projeto 1 (feito fora da ordem do plano formal, a pedido do usuário, mas com os mesmos tokens e critérios aqui descritos).
- `src/index.css` reflete a nova paleta nos tokens `:root`/`.light`/`.sidebar-main`, sem quebrar nenhuma tela ainda não migrada (os overrides `!important` continuam funcionando, só com cores atualizadas).
