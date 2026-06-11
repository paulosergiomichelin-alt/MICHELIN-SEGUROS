'use strict';

const AGGER_LOGIN_URL = 'https://aggilizador.com.br/login';
const STORAGE_KEY = 'michelin_agger_pending';

// Mensagens internas — vindas do content.js (getPayload / clearPayload).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.acao === 'getPayload') {
    chrome.storage.session.get(STORAGE_KEY, (result) => {
      const entry = result[STORAGE_KEY];
      if (!entry?.payload || !entry?.savedAt) return sendResponse(null);
      if (Date.now() - entry.savedAt > 10 * 60 * 1000) {
        chrome.storage.session.remove(STORAGE_KEY);
        return sendResponse(null);
      }
      sendResponse(entry.payload);
    });
    return true; // async
  }

  if (message?.acao === 'clearPayload') {
    chrome.storage.session.remove(STORAGE_KEY, () => sendResponse(true));
    return true;
  }
});

// Recebe mensagens do sistema CRM (External Messaging).
// Origens permitidas estão declaradas em "externally_connectable" do manifest.
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message?.acao) {
    sendResponse({ ok: false, error: 'acao_ausente' });
    return false;
  }

  // Ping de detecção — usado pelo CRM para saber se a extensão está instalada.
  if (message.acao === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  // Recebe payload do lead e abre o Aggilizador em uma nova aba.
  if (message.acao === 'preencher_form') {
    if (!message.dados) {
      sendResponse({ ok: false, error: 'dados_ausentes' });
      return false;
    }

    const entry = { payload: message.dados, savedAt: Date.now() };

    // Grava em session storage ANTES de abrir a aba, garantindo que o
    // content.js encontre o payload quando a página do Agger carregar.
    chrome.storage.session.set({ [STORAGE_KEY]: entry }, () => {
      chrome.tabs.create({ url: AGGER_LOGIN_URL }, (tab) => {
        sendResponse({ ok: true, tabId: tab.id });
      });
    });

    return true; // mantém o canal aberto para o sendResponse assíncrono
  }

  sendResponse({ ok: false, error: 'acao_desconhecida' });
  return false;
});
