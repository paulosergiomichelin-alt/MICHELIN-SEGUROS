# Evolution API — Documentação Completa
> Michelin Seguros CRM — Gerado em 23/06/2026

---

## 0. Acesso ao Servidor (HostGator VPS)

### SSH

| Campo | Valor |
|-------|-------|
| **IP** | `143.95.211.30` |
| **Porta** | `22022` |
| **Usuário** | `root` |
| **Senha** | `Bw8ygomm@` |

```bash
ssh -p 22022 root@143.95.211.30
# senha: Bw8ygomm@
```

### Painel de gerenciamento Evolution API

| Campo | Valor |
|-------|-------|
| **Manager URL** | https://143.95.211.30/manager |
| **API Key global** | `85aabe5a0c0dd037facb9b8210e0bb4763b80df6c7e40d0484d5aa70c0fa9493` |

### Arquivos no servidor

| Caminho | Descrição |
|---------|-----------|
| `/opt/evolution-api/` | Diretório principal |
| `/opt/evolution-api/.env` | Variáveis de ambiente |
| `/opt/evolution-api/docker-compose.yml` | Stack Docker |

---

## 1. Visão Geral da Instalação

### Infraestrutura

| Item | Detalhe |
|------|---------|
| **Servidor** | VPS HostGator — IP `143.95.211.30` |
| **SO** | AlmaLinux 9.8 (Olive Jaguar) — RHEL/CentOS compatível |
| **Kernel** | `5.14.0-687.15.1.el9_8.x86_64` |
| **RAM** | 1.7 GB total / ~1 GB disponível |
| **Disco** | 49 GB total / 6.9 GB usados (15%) |
| **SSH** | porta `22022` |

### Serviços Docker (todos em execução há 8 dias)

| Container | Imagem | Porta | Função |
|-----------|--------|-------|--------|
| `evolution-api` | `evoapicloud/evolution-api:latest` | 8080 (interno) | API principal |
| `evolution-postgres` | `postgres:15-alpine` | 5432 (interno) | Banco de dados |
| `evolution-redis` | `redis:7-alpine` | 6379 (interno) | Cache / filas |
| `traefik` | `traefik:latest` | 80/443 (público) | Proxy reverso + SSL |

### Versões

- **Evolution API**: `2.3.7`
- **WhatsApp Web**: `2.3000.1041954612`
- **PostgreSQL**: `15-alpine`
- **Redis**: `7.4.9`
- **Traefik**: `latest`

### Arquivos de configuração

```
/opt/evolution-api/
├── docker-compose.yml   # Stack completa
├── .env                 # Variáveis de ambiente da API
└── letsencrypt/         # Certificados SSL (Traefik)
```

---

## 2. Acesso à API

### URL Base

```
https://143.95.211.30        (HTTPS via Traefik — certificado auto-assinado)
http://172.18.0.3:8080       (direto ao container — apenas dentro do servidor)
```

> **Nota**: O domínio `dominio-padrao.exemplo.com` no `docker-compose.yml` é um placeholder que nunca foi configurado. O Let's Encrypt falhou ao tentar gerar certificado para esse domínio. O acesso via IP funciona normalmente — o cliente do CRM já usa `NODE_TLS_REJECT_UNAUTHORIZED=0` para ignorar o erro do certificado.

### Autenticação

Todas as requisições precisam do header:

```
apikey: 85aabe5a0c0dd037facb9b8210e0bb4763b80df6c7e40d0484d5aa70c0fa9493
```

### Instância ativa

| Campo | Valor |
|-------|-------|
| **Nome** | `michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2` |
| **Status** | `open` (conectado) |
| **Número** | `556796748603` (WhatsApp de Paulo Sérgio Michelin Seguros) |
| **Token da instância** | `8B2CDA0E-BD9F-4BCA-B81E-608D4D291515` |
| **Integração** | `WHATSAPP-BAILEYS` |
| **Mensagens armazenadas** | 16.517 |
| **Contatos** | 871 |
| **Chats** | 1.381 |

---

## 3. Endpoints da API

> **Base URL**: `https://143.95.211.30`  
> **Header obrigatório**: `apikey: <AUTHENTICATION_API_KEY>`  
> **`{instance}`** = nome da instância (ex: `michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2`)

---

### 3.1 Instâncias (`/instance`)

#### Verificar status da API
```http
GET /
```
**Resposta:**
```json
{
  "status": 200,
  "message": "Welcome to the Evolution API, it is working!",
  "version": "2.3.7",
  "clientName": "evolution_exchange",
  "manager": "https://143.95.211.30/manager",
  "documentation": "https://doc.evolution-api.com",
  "whatsappWebVersion": "2.3000.1041954612"
}
```

#### Criar instância
```http
POST /instance/create
Content-Type: application/json

{
  "instanceName": "nome_da_instancia",
  "integration": "WHATSAPP-BAILEYS",
  "qrcode": true,
  "token": "token-opcional"
}
```

#### Listar todas as instâncias
```http
GET /instance/fetchInstances
```

#### Conectar (obter QR Code)
```http
GET /instance/connect/{instance}
```
**Resposta:** retorna QR Code em base64 para escanear no WhatsApp.

#### Estado da conexão
```http
GET /instance/connectionState/{instance}
```
**Resposta:**
```json
{
  "instance": {
    "instanceName": "michelin_default_...",
    "state": "open"
  }
}
```
**Possíveis estados**: `open`, `close`, `connecting`

#### Desconectar
```http
DELETE /instance/logout/{instance}
```

#### Reiniciar instância
```http
DELETE /instance/restart/{instance}
```

#### Deletar instância
```http
DELETE /instance/delete/{instance}
```

#### Configurações da instância
```http
POST /instance/settings/{instance}
Content-Type: application/json

{
  "rejectCall": false,
  "msgCall": "Não posso atender no momento.",
  "groupsIgnore": false,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false
}
```

---

### 3.2 Envio de Mensagens (`/message`)

#### Enviar texto
```http
POST /message/sendText/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "text": "Olá! Tudo bem?",
  "delay": 1000,
  "linkPreview": false,
  "mentionsEveryOne": false
}
```

#### Enviar imagem
```http
POST /message/sendMedia/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "mediatype": "image",
  "mimetype": "image/jpeg",
  "caption": "Legenda da imagem",
  "media": "https://url-da-imagem.com/foto.jpg",
  "fileName": "foto.jpg"
}
```
**Tipos de mídia suportados**: `image`, `video`, `audio`, `document`

#### Enviar áudio
```http
POST /message/sendAudio/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "audio": "https://url-do-audio.com/audio.ogg",
  "encoding": true,
  "delay": 1000
}
```
> `encoding: true` converte o áudio para o formato de mensagem de voz do WhatsApp.

#### Enviar documento
```http
POST /message/sendMedia/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "mediatype": "document",
  "mimetype": "application/pdf",
  "caption": "Proposta de seguro",
  "media": "https://url.com/proposta.pdf",
  "fileName": "proposta.pdf"
}
```

#### Enviar botões
```http
POST /message/sendButtons/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "title": "Escolha uma opção",
  "description": "Como podemos ajudar?",
  "footer": "Michelin Seguros",
  "buttons": [
    { "type": "reply", "displayText": "Renovação", "id": "renovacao" },
    { "type": "reply", "displayText": "Sinistro", "id": "sinistro" },
    { "type": "reply", "displayText": "Cotação", "id": "cotacao" }
  ]
}
```

#### Enviar lista
```http
POST /message/sendList/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "title": "Menu de Atendimento",
  "description": "Selecione o assunto",
  "buttonText": "Abrir Menu",
  "footerText": "Michelin Seguros",
  "sections": [
    {
      "title": "Seguros",
      "rows": [
        { "title": "Seguro Auto", "description": "Cotação de seguro veicular", "rowId": "auto" },
        { "title": "Seguro Vida", "description": "Proteção para sua família", "rowId": "vida" },
        { "title": "Seguro Residencial", "description": "Proteção para seu imóvel", "rowId": "residencial" }
      ]
    }
  ]
}
```

#### Enviar localização
```http
POST /message/sendLocation/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "name": "Michelin Seguros",
  "address": "Rua Exemplo, 123, Campo Grande - MS",
  "latitude": -20.469,
  "longitude": -54.620
}
```

#### Enviar contato
```http
POST /message/sendContact/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "contact": [
    {
      "fullName": "Paulo Sérgio Michelin",
      "wuid": "5567912345678",
      "phoneNumber": "67912345678"
    }
  ]
}
```

#### Responder mensagem
```http
POST /message/sendText/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "text": "Resposta aqui",
  "quoted": {
    "key": {
      "id": "MSG_ID_ORIGINAL",
      "remoteJid": "5567999998888@s.whatsapp.net",
      "fromMe": false
    },
    "message": {
      "conversation": "Texto da mensagem original"
    }
  }
}
```

#### Reagir a uma mensagem
```http
POST /message/sendReaction/{instance}
Content-Type: application/json

{
  "key": {
    "id": "MSG_ID",
    "remoteJid": "5567999998888@s.whatsapp.net",
    "fromMe": false
  },
  "reaction": "👍"
}
```

#### Marcar como lida
```http
POST /message/markMessageAsRead/{instance}
Content-Type: application/json

{
  "readMessages": [
    {
      "id": "MSG_ID",
      "fromMe": false,
      "remoteJid": "5567999998888@s.whatsapp.net"
    }
  ]
}
```

#### Deletar mensagem
```http
DELETE /message/delete/{instance}
Content-Type: application/json

{
  "id": "MSG_ID",
  "fromMe": true,
  "remoteJid": "5567999998888@s.whatsapp.net"
}
```

---

### 3.3 Chats (`/chat`)

#### Listar chats
```http
GET /chat/findChats/{instance}
```

#### Buscar mensagens de um chat
```http
POST /chat/findMessages/{instance}
Content-Type: application/json

{
  "where": {
    "key": {
      "remoteJid": "5567999998888@s.whatsapp.net"
    }
  },
  "limit": 50,
  "offset": 0
}
```

#### Buscar mensagens por texto
```http
POST /chat/findMessages/{instance}
Content-Type: application/json

{
  "where": {
    "message": {
      "conversation": "texto de busca"
    }
  }
}
```

#### Verificar se número está no WhatsApp
```http
POST /chat/whatsappNumbers/{instance}
Content-Type: application/json

{
  "numbers": ["5567999998888", "5567777776666"]
}
```
**Resposta:**
```json
[
  { "number": "5567999998888", "exists": true, "jid": "5567999998888@s.whatsapp.net" },
  { "number": "5567777776666", "exists": false }
]
```

#### Buscar foto de perfil
```http
GET /chat/fetchProfilePictureUrl/{instance}?number=5567999998888
```

#### Obter informações de perfil
```http
GET /chat/fetchProfile/{instance}?number=5567999998888
```

#### Arquivar chat
```http
POST /chat/archiveChat/{instance}
Content-Type: application/json

{
  "lastMessage": {
    "key": {
      "remoteJid": "5567999998888@s.whatsapp.net",
      "id": "MSG_ID"
    },
    "messageTimestamp": 1750000000
  },
  "archive": true
}
```

#### Silenciar chat
```http
POST /chat/muteChat/{instance}
Content-Type: application/json

{
  "jid": "5567999998888@s.whatsapp.net",
  "status": "muted",
  "expiration": "8h"
}
```

#### Indicar digitando / gravando
```http
POST /chat/sendPresence/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "delay": 3000,
  "presence": "composing"
}
```
**Valores de `presence`**: `composing` (digitando), `recording` (gravando áudio), `paused`

---

### 3.4 Contatos (`/contact`)

#### Listar contatos
```http
GET /contact/findContacts/{instance}
```

#### Buscar contatos
```http
POST /contact/findContacts/{instance}
Content-Type: application/json

{
  "where": {
    "pushName": "Paulo"
  }
}
```

#### Buscar mensagens de contato
```http
POST /contact/findMessages/{instance}
Content-Type: application/json

{
  "where": {
    "key": {
      "remoteJid": "5567999998888@s.whatsapp.net"
    }
  }
}
```

---

### 3.5 Grupos (`/group`)

#### Criar grupo
```http
POST /group/create/{instance}
Content-Type: application/json

{
  "subject": "Nome do Grupo",
  "description": "Descrição do grupo",
  "participants": ["5567999998888", "5567777776666"]
}
```

#### Listar grupos
```http
GET /group/fetchAllGroups/{instance}?getParticipants=true
```

#### Adicionar participantes
```http
PUT /group/updateParticipant/{instance}
Content-Type: application/json

{
  "groupJid": "GRUPO_ID@g.us",
  "action": "add",
  "participants": ["5567999998888"]
}
```
**Ações**: `add`, `remove`, `promote` (tornar admin), `demote` (remover admin)

#### Atualizar foto do grupo
```http
PUT /group/updateGroupPicture/{instance}
Content-Type: application/json

{
  "groupJid": "GRUPO_ID@g.us",
  "image": "BASE64_DA_IMAGEM"
}
```

#### Sair do grupo
```http
DELETE /group/leaveGroup/{instance}
Content-Type: application/json

{
  "groupJid": "GRUPO_ID@g.us"
}
```

---

### 3.6 Webhook (`/webhook`)

#### Configurar webhook
```http
POST /webhook/set/{instance}
Content-Type: application/json

{
  "webhook": {
    "enabled": true,
    "url": "https://meu-crm.com/api/webhook/evolution",
    "webhookByEvents": true,
    "webhookBase64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "CONTACTS_UPDATE",
      "CHATS_UPDATE",
      "CHATS_UPSERT",
      "PRESENCE_UPDATE"
    ]
  }
}
```

> **`webhookByEvents: true`** faz com que cada evento seja enviado para uma sub-rota separada.  
> Por exemplo, com URL base `https://crm.com/webhook` e `webhookByEvents: true`:
> - `MESSAGES_UPSERT` → `POST https://crm.com/webhook/messages-upsert`
> - `CONNECTION_UPDATE` → `POST https://crm.com/webhook/connection-update`

#### Consultar webhook configurado
```http
GET /webhook/find/{instance}
```

---

### 3.7 Perfil (`/profile`)

#### Buscar perfil próprio
```http
GET /profile/{instance}
```

#### Atualizar nome do perfil
```http
POST /profile/updateProfileName/{instance}
Content-Type: application/json

{
  "name": "Michelin Seguros"
}
```

#### Atualizar status/bio
```http
POST /profile/updateProfileStatus/{instance}
Content-Type: application/json

{
  "status": "Corretora de seguros em Campo Grande - MS"
}
```

#### Atualizar foto de perfil
```http
PUT /profile/updateProfilePicture/{instance}
Content-Type: application/json

{
  "picture": "BASE64_DA_IMAGEM"
}
```

---

### 3.8 Templates (WhatsApp Business)

#### Criar template
```http
POST /template/create/{instance}
Content-Type: application/json

{
  "name": "renovacao_anual",
  "category": "MARKETING",
  "language": "pt_BR",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Aviso de Renovação"
    },
    {
      "type": "BODY",
      "text": "Olá {{1}}, seu seguro vence em {{2}}. Entre em contato para renovar."
    },
    {
      "type": "FOOTER",
      "text": "Michelin Seguros"
    }
  ]
}
```

#### Enviar mensagem com template
```http
POST /message/sendTemplate/{instance}
Content-Type: application/json

{
  "number": "5567999998888",
  "name": "renovacao_anual",
  "language": "pt_BR",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "João Silva" },
        { "type": "text", "text": "30/07/2026" }
      ]
    }
  ]
}
```

---

### 3.9 Integrações de IA

#### 3.9.1 Typebot

```http
POST /typebot/create/{instance}
Content-Type: application/json

{
  "enabled": true,
  "url": "https://meu-typebot.com",
  "typebot": "meu-bot",
  "triggerType": "keyword",
  "triggerOperator": "contains",
  "triggerValue": "oi",
  "expire": 60,
  "keywordFinish": "#sair",
  "delayMessage": 1500,
  "unknownMessage": "Não entendi. Digite #sair para encerrar.",
  "listeningFromMe": false,
  "stopBotFromMe": true,
  "keepOpen": false,
  "debounceTime": 10
}
```

#### 3.9.2 OpenAI

```http
# Primeiro, criar credenciais OpenAI
POST /openai/creds/create/{instance}
Content-Type: application/json

{
  "name": "openai-michelin",
  "apiKey": "sk-..."
}

# Depois, criar bot
POST /openai/create/{instance}
Content-Type: application/json

{
  "enabled": true,
  "openaiCredsId": "ID_DAS_CREDS",
  "botType": "chatCompletion",
  "model": "gpt-4o",
  "systemMessages": ["Você é um assistente de seguros da Michelin Seguros..."],
  "maxTokens": 500,
  "triggerType": "keyword",
  "triggerOperator": "startsWith",
  "triggerValue": "/ia"
}
```

#### 3.9.3 N8n

```http
POST /n8n/create/{instance}
Content-Type: application/json

{
  "enabled": true,
  "webhookUrl": "https://meu-n8n.com/webhook/whatsapp",
  "expire": 60,
  "triggerType": "all"
}
```

#### 3.9.4 Flowise

```http
POST /flowise/create/{instance}
Content-Type: application/json

{
  "enabled": true,
  "apiUrl": "https://meu-flowise.com",
  "apiKey": "API_KEY",
  "triggerType": "all"
}
```

#### 3.9.5 Dify

```http
POST /dify/create/{instance}
Content-Type: application/json

{
  "enabled": true,
  "botType": "chatBot",
  "apiUrl": "https://api.dify.ai",
  "apiKey": "app-...",
  "triggerType": "all"
}
```

---

### 3.10 Chatwoot (Integração com helpdesk)

```http
POST /chatwoot/set/{instance}
Content-Type: application/json

{
  "enabled": true,
  "accountId": "1",
  "token": "TOKEN_DO_AGENTE",
  "url": "https://meu-chatwoot.com",
  "nameInbox": "WhatsApp Michelin",
  "signMsg": true,
  "reopenConversation": false,
  "conversationPending": true,
  "mergeBrazilContacts": true,
  "importContacts": true,
  "importMessages": true,
  "daysLimitImportMessages": 7
}
```

---

## 4. Eventos de Webhook

Quando `webhookByEvents: true`, a URL recebe uma sub-rota por evento.  
A Evolution API envia via `POST` com o body abaixo.

### Estrutura base de todos os eventos

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2",
  "data": { ... },
  "destination": "https://crm.com/webhook",
  "date_time": "2026-06-23T12:00:00.000Z",
  "sender": "556796748603@s.whatsapp.net",
  "server_url": "https://143.95.211.30",
  "apikey": "85aabe5..."
}
```

---

### 4.1 `MESSAGES_UPSERT` — Nova mensagem recebida/enviada

**Sub-rota**: `POST {url}/messages-upsert`

```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "michelin_default_...",
  "data": {
    "key": {
      "remoteJid": "5567999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0A1B2C3D4E5F6"
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "Olá, quero renovar meu seguro"
    },
    "messageType": "conversation",
    "messageTimestamp": 1750000000,
    "instanceId": "9c55e3e7-3dc2-44cf-a2f2-5c1dfc103cdb",
    "source": "android"
  }
}
```

**Tipos de `message` possíveis:**

| Tipo | Chave no objeto `message` | Descrição |
|------|--------------------------|-----------|
| Texto | `conversation` | Mensagem de texto simples |
| Texto com metadados | `extendedTextMessage.text` | Texto com preview de link |
| Imagem | `imageMessage` | Imagem (com `caption` opcional) |
| Vídeo | `videoMessage` | Vídeo |
| Áudio | `audioMessage` | Áudio/voz |
| Documento | `documentMessage` | Arquivo PDF, DOC, etc. |
| Sticker | `stickerMessage` | Figurinha |
| Localização | `locationMessage` | Coordenadas GPS |
| Contato | `contactMessage` | Cartão de contato |
| Reação | `reactionMessage` | Emoji de reação |
| Enquete | `pollCreationMessage` | Enquete |
| Resposta | `extendedTextMessage.contextInfo` | Mensagem citando outra |
| Botão clicado | `buttonsResponseMessage` | Resposta de botão |
| Lista selecionada | `listResponseMessage` | Item de lista selecionado |

---

### 4.2 `MESSAGES_UPDATE` — Atualização de status de mensagem

**Sub-rota**: `POST {url}/messages-update`

```json
{
  "event": "MESSAGES_UPDATE",
  "instance": "michelin_default_...",
  "data": [
    {
      "key": {
        "remoteJid": "5567999998888@s.whatsapp.net",
        "fromMe": true,
        "id": "3EB0A1B2C3D4E5F6"
      },
      "update": {
        "status": 3
      }
    }
  ]
}
```

**Códigos de status:**

| Código | Significado |
|--------|-------------|
| 0 | ERROR |
| 1 | PENDING (aguardando envio) |
| 2 | SERVER_ACK (entregue ao servidor) |
| 3 | DELIVERY_ACK (entregue ao dispositivo - 1 check) |
| 4 | READ (lido - 2 checks azuis) |
| 5 | PLAYED (áudio reproduzido) |

---

### 4.3 `MESSAGES_DELETE` — Mensagem deletada

**Sub-rota**: `POST {url}/messages-delete`

```json
{
  "event": "MESSAGES_DELETE",
  "instance": "michelin_default_...",
  "data": {
    "id": "3EB0A1B2C3D4E5F6",
    "remoteJid": "5567999998888@s.whatsapp.net",
    "fromMe": false,
    "participant": null
  }
}
```

---

### 4.4 `CONNECTION_UPDATE` — Mudança no estado de conexão

**Sub-rota**: `POST {url}/connection-update`

```json
{
  "event": "CONNECTION_UPDATE",
  "instance": "michelin_default_...",
  "data": {
    "instance": "michelin_default_...",
    "state": "open",
    "statusReason": 200
  }
}
```

**Estados**: `open` (conectado), `close` (desconectado), `connecting` (reconectando)

---

### 4.5 `QRCODE_UPDATED` — QR Code atualizado

**Sub-rota**: `POST {url}/qrcode-updated`

```json
{
  "event": "QRCODE_UPDATED",
  "instance": "michelin_default_...",
  "data": {
    "qrcode": {
      "base64": "data:image/png;base64,iVBORw...",
      "code": "2@XXXXX",
      "count": 1
    }
  }
}
```

---

### 4.6 `CONTACTS_UPDATE` — Atualização de contato

**Sub-rota**: `POST {url}/contacts-update`

```json
{
  "event": "CONTACTS_UPDATE",
  "instance": "michelin_default_...",
  "data": [
    {
      "id": "5567999998888@s.whatsapp.net",
      "pushName": "João Silva",
      "imgUrl": "https://pps.whatsapp.net/v/..."
    }
  ]
}
```

---

### 4.7 `CHATS_UPSERT` — Novo chat ou atualização

**Sub-rota**: `POST {url}/chats-upsert`

```json
{
  "event": "CHATS_UPSERT",
  "instance": "michelin_default_...",
  "data": [
    {
      "id": "5567999998888@s.whatsapp.net",
      "name": "João Silva",
      "unreadMessages": 2,
      "lastMessageTimestamp": 1750000000
    }
  ]
}
```

---

### 4.8 `CHATS_UPDATE` — Atualização de chat

**Sub-rota**: `POST {url}/chats-update`

Mesmo formato de `CHATS_UPSERT`, mas indica atualização em chat existente.

---

### 4.9 `PRESENCE_UPDATE` — Status de presença

**Sub-rota**: `POST {url}/presence-update`

```json
{
  "event": "PRESENCE_UPDATE",
  "instance": "michelin_default_...",
  "data": {
    "id": "5567999998888@s.whatsapp.net",
    "presences": {
      "5567999998888@s.whatsapp.net": {
        "lastKnownPresence": "composing",
        "lastSeen": null
      }
    }
  }
}
```

**Presenças**: `available` (online), `unavailable` (offline), `composing` (digitando), `recording` (gravando)

---

### 4.10 Outros eventos disponíveis (não configurados atualmente)

| Evento | Descrição |
|--------|-----------|
| `SEND_MESSAGE` | Confirmação de mensagem enviada |
| `GROUPS_UPSERT` | Novo grupo criado |
| `GROUPS_UPDATE` | Grupo atualizado |
| `GROUP_PARTICIPANTS_UPDATE` | Participantes do grupo alterados |
| `CHATS_DELETE` | Chat deletado |
| `CONTACTS_UPSERT` | Novo contato adicionado |
| `CALL` | Chamada recebida |
| `LABELS_EDIT` | Etiqueta editada |
| `LABELS_ASSOCIATION` | Etiqueta associada a chat |
| `TYPEBOT_START` | Bot iniciou sessão |
| `TYPEBOT_CHANGE_FLOW` | Fluxo do bot alterado |

---

## 5. Configuração Atual do Servidor

### Variáveis de ambiente (`/opt/evolution-api/.env`)

| Variável | Valor atual | Descrição |
|----------|-------------|-----------|
| `SERVER_NAME` | `evolution` | Nome do servidor |
| `SERVER_TYPE` | `http` | Protocolo |
| `SERVER_PORT` | `8080` | Porta interna |
| `SERVER_URL` | `https://143.95.211.30` | URL pública |
| `AUTHENTICATION_TYPE` | `apikey` | Tipo de autenticação |
| `AUTHENTICATION_API_KEY` | `85aabe5a...` | Chave de API global |
| `DATABASE_PROVIDER` | `postgresql` | Banco de dados |
| `DATABASE_CONNECTION_URI` | `postgresql://evolution:...@evolution-postgres:5432/evolution_db` | String de conexão |
| `DATABASE_SAVE_DATA_INSTANCE` | `true` | Salvar dados da instância |
| `DATABASE_SAVE_DATA_NEW_MESSAGE` | `true` | Salvar novas mensagens |
| `DATABASE_SAVE_MESSAGE_UPDATE` | `true` | Salvar atualizações de mensagens |
| `DATABASE_SAVE_DATA_CONTACTS` | `true` | Salvar contatos |
| `DATABASE_SAVE_DATA_CHATS` | `true` | Salvar chats |
| `DATABASE_SAVE_DATA_LABELS` | `true` | Salvar etiquetas |
| `DATABASE_SAVE_DATA_HISTORIC` | `true` | Salvar histórico |
| `DATABASE_SAVE_IS_ON_WHATSAPP` | `true` | Cache de verificação WhatsApp |
| `DATABASE_SAVE_IS_ON_WHATSAPP_DAYS` | `7` | Dias de cache para verificação |
| `DATABASE_DELETE_MESSAGE` | `true` | Deletar mensagens do banco quando deletadas no WhatsApp |
| `REDIS_ENABLED` | `true` | Redis habilitado |
| `REDIS_URI` | `redis://evolution-redis:6379/0` | URL do Redis |
| `CACHE_REDIS_ENABLED` | `true` | Cache Redis habilitado |
| `CACHE_REDIS_TTL` | `604800` | TTL de cache (7 dias) |
| `CORS_ORIGIN` | `*` | Origens CORS permitidas |
| `LOG_LEVEL` | `ERROR,WARN,INFO` | Nível de log |
| `QRCODE_MAX_COUNT` | `10` | Máximo de tentativas de QR Code |
| `CHECK_USER_EXISTS` | `true` | Verificar se número existe antes de enviar |
| `RABBITMQ_ENABLED` | `false` | RabbitMQ desabilitado |
| `S3_ENABLED` | `false` | MinIO/S3 desabilitado |
| `DEL_INSTANCE` | `false` | Não deletar instância ao desconectar |

### Estado atual do webhook da instância ativa

| Campo | Valor |
|-------|-------|
| **URL** | `https://michelin-seguros.vercel.app/api/webhook/evolution` |
| **Habilitado** | `true` |
| **Modo por eventos** | `true` (sub-rota por evento) |
| **Base64** | `false` |
| **Eventos ativos** | `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `CONTACTS_UPDATE`, `CHATS_UPDATE`, `CHATS_UPSERT`, `PRESENCE_UPDATE` |

### Banco de dados (PostgreSQL 15)

**Schema**: `evolution_api`

**Tabelas presentes:**

| Tabela | Descrição |
|--------|-----------|
| `Instance` | Instâncias do WhatsApp |
| `Session` | Sessões Baileys (credenciais) |
| `Chat` | Conversas |
| `Contact` | Contatos |
| `Message` | Mensagens (16.517 registros) |
| `MessageUpdate` | Atualizações de status de mensagens |
| `Media` | Metadados de mídias |
| `Webhook` | Configurações de webhook por instância |
| `Setting` | Configurações por instância |
| `Label` | Etiquetas do WhatsApp |
| `Chatwoot` | Integração Chatwoot |
| `Typebot` / `TypebotSetting` | Bot Typebot |
| `OpenaiBot` / `OpenaiCreds` / `OpenaiSetting` | Integração OpenAI |
| `Dify` / `DifySetting` | Integração Dify |
| `EvolutionBot` / `EvolutionBotSetting` | Evolution Bot nativo |
| `Flowise` / `FlowiseSetting` | Integração Flowise |
| `N8n` / `N8nSetting` | Integração N8n |
| `Evoai` / `EvoaiSetting` | Integração Evoai |
| `Rabbitmq`, `Nats`, `Sqs`, `Kafka` | Mensageria (desabilitados) |
| `Websocket` | Eventos via WebSocket |
| `Pusher` | Integração Pusher |
| `Proxy` | Configuração de proxy |
| `Template` | Templates de mensagens |
| `IntegrationSession` | Sessões de bots de IA |
| `IsOnWhatsapp` | Cache de verificação de números |

---

## 6. Erros Identificados e Correções Aplicadas

### Erro 1: Webhook apontando para URL expirada do ngrok (CRÍTICO) — CORRIGIDO

**Problema**: O webhook estava configurado para enviar eventos a `https://shrivel-cornfield-aliens.ngrok-free.dev/api/webhook/evolution`, uma URL temporária de desenvolvimento que havia expirado. Todos os eventos (novas mensagens, atualizações de status, etc.) estavam falhando com 404.

**Impacto**: O CRM não recebia nenhum evento do WhatsApp — novas mensagens, confirmações de leitura, desconexões, etc.

**Correção aplicada**: URL do webhook atualizada para `https://michelin-seguros.vercel.app/api/webhook/evolution` via API:
```bash
POST /webhook/set/michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2
```

**Arquivo local atualizado**: `.env` — variável `EVOLUTION_WEBHOOK_URL`

---

### Erro 2: `SERVER_URL` com domínio placeholder (MENOR) — CORRIGIDO

**Problema**: `SERVER_URL=https://dominio-padrao.exemplo.com` estava no `.env` do servidor. Esse valor aparecia nas respostas de erro do webhook como `server_url`.

**Correção aplicada**: Atualizado para `SERVER_URL=https://143.95.211.30` e container reiniciado.

---

### Erro 3: Domínio inválido no Traefik (MENOR — sem impacto funcional)

**Problema**: O `docker-compose.yml` referencia `dominio-padrao.exemplo.com` nas regras do Traefik e na configuração do Let's Encrypt. O Traefik tenta periodicamente gerar um certificado SSL para esse domínio e falha.

**Status**: Sem impacto funcional pois o acesso via IP `143.95.211.30` funciona corretamente. O CRM usa `NODE_TLS_REJECT_UNAUTHORIZED=0` para ignorar o certificado auto-assinado.

**Solução recomendada (futura)**: Configurar um domínio real (ex: `evolution.michelin-seguros.com.br`) e atualizar o `docker-compose.yml`.

---

### Aviso 4: Sem swap configurado

**Problema**: O servidor tem 1.7 GB de RAM e **sem swap**. Com Redis usando 512 MB + PostgreSQL + Evolution API, há risco de OOM killer em picos.

**Recomendação**: Criar swap file de 2 GB no servidor.

---

## 7. Configuração no Projeto CRM

### Variáveis de ambiente locais (`.env`)

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
EVOLUTION_API_URL=https://143.95.211.30
EVOLUTION_API_KEY=85aabe5a0c0dd037facb9b8210e0bb4763b80df6c7e40d0484d5aa70c0fa9493
EVOLUTION_WEBHOOK_URL=https://michelin-seguros.vercel.app/api/webhook/evolution
```

### Instância configurada

```
Nome: michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2
Token: 8B2CDA0E-BD9F-4BCA-B81E-608D4D291515
Número: 556796748603
```

### Endpoint de webhook no CRM

O servidor Express deve implementar:

```
POST /api/webhook/evolution/messages-upsert     ← nova mensagem
POST /api/webhook/evolution/messages-update     ← status de leitura
POST /api/webhook/evolution/messages-delete     ← mensagem deletada
POST /api/webhook/evolution/connection-update   ← conexão/desconexão
POST /api/webhook/evolution/qrcode-updated      ← QR Code
POST /api/webhook/evolution/contacts-update     ← contato atualizado
POST /api/webhook/evolution/chats-upsert        ← chat novo/atualizado
POST /api/webhook/evolution/chats-update        ← chat atualizado
POST /api/webhook/evolution/presence-update     ← digitando/online
```

---

## 8. Funcionalidades Disponíveis para Implementar no CRM

### Alta prioridade

| Funcionalidade | Endpoint | Benefício para o CRM |
|----------------|----------|----------------------|
| **Verificar número antes de enviar** | `POST /chat/whatsappNumbers` | Validar se o lead tem WhatsApp antes de campanha |
| **Indicador "digitando"** | `POST /chat/sendPresence` | Melhorar UX em respostas automáticas |
| **Busca de mensagens** | `POST /chat/findMessages` | Histórico completo por lead no CRM |
| **Foto de perfil** | `GET /chat/fetchProfilePictureUrl` | Enriquecer perfil do lead |
| **Marcar como lido** | `POST /message/markMessageAsRead` | Sincronizar status de leitura |
| **Etiquetas do WhatsApp** | API de labels | Sincronizar com status do lead no CRM |

### Média prioridade

| Funcionalidade | Endpoint | Benefício |
|----------------|----------|-----------|
| **Templates de mensagem** | `POST /template/create` + `sendTemplate` | Campanha de renovação com aprovação Meta |
| **Mensagens com botões** | `POST /message/sendButtons` | Fluxo de qualificação de leads |
| **Listas interativas** | `POST /message/sendList` | Menu de atendimento inicial |
| **Reações** | `POST /message/sendReaction` | Confirmar recebimento de documentos |

### Integrações de IA (quando disponível)

| Integração | Caso de uso |
|------------|-------------|
| **N8n** | Automações complexas (renovação, sinistro) |
| **OpenAI / GPT** | Assistente de triagem inicial de leads |
| **Typebot** | Fluxo de qualificação guiado com coleta de dados |
| **Evolution Bot** | Bot nativo para respostas simples fora do horário |

---

## 9. Exemplos de Uso no CRM

### Enviar mensagem para um lead

```typescript
// src/services/evolutionApi.ts

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = 'michelin_default_KjffljEGXMgY3rJbB8bYrnROJwc2';

export async function sendWhatsAppMessage(phone: string, text: string) {
  const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: JSON.stringify({
      number: phone.replace(/\D/g, ''), // remove formatação
      text,
      delay: 1000,
    }),
  });
  return response.json();
}
```

### Processar webhook de nova mensagem

```typescript
// api/webhook/evolution/messages-upsert.ts (Vercel Function)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { data, instance } = req.body;
  const { key, message, pushName, messageType } = data;
  
  // Ignorar mensagens próprias
  if (key.fromMe) return res.status(200).json({ ok: true });
  
  const phone = key.remoteJid.replace('@s.whatsapp.net', '');
  const text = message?.conversation || 
               message?.extendedTextMessage?.text || 
               '[mídia]';
  
  // Aqui: salvar no Firestore, notificar no CRM, etc.
  console.log(`Nova mensagem de ${pushName} (${phone}): ${text}`);
  
  return res.status(200).json({ received: true });
}
```

---

## 10. Manager Web

A Evolution API inclui um painel web para gerenciamento:

```
URL: https://143.95.211.30/manager
```

Permite:
- Ver e gerenciar instâncias
- Escanear QR Code
- Configurar webhooks visualmente
- Ver logs e status em tempo real

---

## 11. Referências

- **Documentação oficial**: https://doc.evolution-api.com
- **GitHub**: https://github.com/EvolutionAPI/evolution-api
- **Versão instalada**: `2.3.7`
- **WhatsApp Web version**: `2.3000.1041954612`
