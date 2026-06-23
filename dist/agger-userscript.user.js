// ==UserScript==
// @name         Michelin Seguros — Cotar no Agger
// @namespace    https://michelin-seguros.local/
// @version      1.5.0
// @description  Lê os dados de um lead vindos do CRM Michelin, faz login no Aggilizador e preenche o formulário de nova cotação automóvel.
// @author       Michelin Seguros
// @match        *://aggilizador.com.br/*
// @match        *://*.aggilizador.com.br/*
// @match        *://localhost/*
// @match        *://localhost:*/*
// @match        *://127.0.0.1/*
// @match        *://127.0.0.1:*/*
// @match        *://*.vercel.app/*
// @include      http://localhost*
// @include      http://127.0.0.1*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '1.5.0';
  const FORMULARIO_URL = 'https://aggilizador.com.br/cotacao/auto/formulario';

  // Log forçado — se você não vê esta linha no console (F12) de uma página
  // que casa o @match, o userscript não está rodando ali.
  console.log(`%c[Michelin Agger] userscript v${SCRIPT_VERSION} carregado em ${location.hostname}`,
    'color:#d4a854;font-weight:bold');

  // ────────────────────────────────────────────────────────────────────────────
  // Detecção: se estamos no CRM (não no Agger), só marcamos presença e saímos.
  // ────────────────────────────────────────────────────────────────────────────
  const isAggerHost = /(^|\.)aggilizador\.com\.br$/i.test(location.hostname);

  function markInstalled() {
    try {
      const html = document.documentElement;
      if (html) html.setAttribute('data-michelin-agger-installed', SCRIPT_VERSION);
    } catch (e) { console.warn('[Michelin Agger] não consegui marcar HTML:', e); }
    try {
      window.dispatchEvent(new CustomEvent('michelin-agger:installed', {
        detail: { version: SCRIPT_VERSION }
      }));
    } catch (_) {}
  }

  if (!isAggerHost) {
    // Roda já em document-start, e repete várias vezes para sobreviver a SPAs
    // que reescrevem o documento.
    markInstalled();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', markInstalled, { once: true });
    }
    window.addEventListener('load', markInstalled);
    setTimeout(markInstalled, 500);
    setTimeout(markInstalled, 1500);
    setTimeout(markInstalled, 3000);
    return;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CONFIG — edite aqui se algo não funcionar
  // ────────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    // Fallback caso o payload do CRM não traga credenciais (v1 antiga).
    // Quando o CRM envia v2+, as credenciais do payload têm prioridade.
    credentials: {
      email: 'michelinseguros@hotmail.com',
      password: 'Bw8ygomm@agger',
    },

    selectors: {
      login: {
        email: [
          // Angular Material — Agger usa Angular
          'input[autocomplete="email"]',
          'input[autocomplete="username"]',
          'input[formcontrolname="email"]',
          'input[formcontrolname="login"]',
          'input[formcontrolname="usuario"]',
          'input[formcontrolname="username"]',
          'mat-form-field input[type="email"]',
          'mat-form-field input[type="text"]:not([type="password"]):not([type="hidden"])',
          // Padrão
          'input[type="email"]',
          'input[name="email"]',
          'input[name="login"]',
          'input[name="usuario"]',
          'input[name="username"]',
          'input[id*="email" i]',
          'input[id*="login" i]',
          'input[id*="usuario" i]',
          'input[placeholder*="e-mail" i]',
          'input[placeholder*="email" i]',
          'input[placeholder*="usu" i]',
        ],
        password: [
          'input[autocomplete="current-password"]',
          'input[autocomplete="password"]',
          'input[formcontrolname="password"]',
          'input[formcontrolname="senha"]',
          'input[type="password"]',
          'input[name="password"]',
          'input[name="senha"]',
          'input[id*="senha" i]',
          'input[id*="password" i]',
        ],
        submit: [
          'button[type="submit"]',
          'input[type="submit"]',
          'button[mat-raised-button]',
          'button[mat-flat-button]',
          'button.mat-mdc-button',
        ],
      },
      navigation: {
        novaCotacao: [
          'Nova cotação', 'Nova Cotação', 'NOVA COTAÇÃO',
          '+ Nova cotação', 'Novo orçamento', 'Nova proposta',
          'Cotar', 'Cotação', 'COTAR',
        ],
        automovel: ['Automóvel', 'Automovel', 'AUTOMÓVEL', 'AUTO', 'Auto'],
        carro: ['Carro', 'CARRO', 'Veículo Leve', 'Passeio'],
      },
      quoteForm: {
        name: ['name', 'nome', 'segurado', 'cliente'],
        cpf: ['cpf'],
        rg: ['rg'],
        birthDate: ['nascimento', 'dataNascimento', 'birth'],
        civilStatus: ['estado_civil', 'estadoCivil', 'civil'],
        email: ['email', 'e-mail'],
        phone: ['telefone', 'celular', 'phone'],

        plate: ['placa', 'plate'],
        chassis: ['chassi', 'chassis'],
        renavam: ['renavam'],
        brandModel: ['modelo', 'marca_modelo', 'veiculo'],

        zipCodeOvernight: ['cep_pernoite', 'cepPernoite', 'cep'],
        addressOvernight: ['endereco_pernoite', 'enderecoPernoite', 'endereco', 'logradouro'],
        numberOvernight: ['numero_pernoite', 'numeroPernoite', 'numero'],

        ownerName: ['nome_proprietario', 'nomeProprietario', 'proprietario_nome'],
        ownerCpf: ['cpf_proprietario', 'cpfProprietario', 'proprietario_cpf'],

        hasInsurance: ['possui_seguro', 'possuiSeguro', 'seguro_atual'],
        insurer: ['seguradora_atual', 'seguradoraAtual', 'seguradora'],
        insuranceExpiry: ['vencimento_seguro', 'vencimentoSeguro', 'fim_vigencia'],
      },
    },

    timing: {
      maxWaitMs: 15000,
      pollIntervalMs: 200,
    },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // STORAGE — payload vindo do CRM
  // Usa localStorage (com TTL) + sessionStorage para sobreviver a redirects HTTP
  // do Agger entre /login e /cotacao/auto/formulario.
  // ────────────────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'michelin_agger_payload';
  const HASH_KEY = 'michelin_lead';
  const PAYLOAD_TTL_MS = 10 * 60 * 1000; // 10 minutos

  function readPayloadFromHash() {
    const hash = location.hash || '';
    const m = hash.match(new RegExp(`${HASH_KEY}=([^&]+)`));
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const json = decodeURIComponent(escape(atob(padded)));
      return JSON.parse(json);
    } catch (e) {
      console.warn('[Michelin] hash inválido:', e);
      return null;
    }
  }

  function persistPayload(payload) {
    const wrapped = { savedAt: Date.now(), payload };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped)); } catch (e) { console.warn('[Michelin] sessionStorage falhou:', e); }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped)); } catch (e) { console.warn('[Michelin] localStorage falhou:', e); }
  }

  function readWrapped(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const wrapped = JSON.parse(raw);
      if (!wrapped?.savedAt || !wrapped?.payload) return null;
      if (Date.now() - wrapped.savedAt > PAYLOAD_TTL_MS) {
        storage.removeItem(STORAGE_KEY);
        return null;
      }
      return wrapped.payload;
    } catch { return null; }
  }

  function getPayload() {
    return readWrapped(sessionStorage) || readWrapped(localStorage);
  }
  function clearPayload() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UI feedback — toast
  // ────────────────────────────────────────────────────────────────────────────
  function ensureToastRoot() {
    let el = document.getElementById('michelin-agger-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'michelin-agger-toast';
      el.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 2147483647;
        background: #0b0b0c; color: #f5d68f; font-family: system-ui, -apple-system, sans-serif;
        padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(245,214,143,0.3);
        font-size: 12px; max-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        font-weight: 600; letter-spacing: 0.04em; transition: opacity .25s;
      `;
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(msg, ms = 3500) {
    const el = ensureToastRoot();
    el.textContent = `Michelin → Agger: ${msg}`;
    el.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.opacity = '0'; }, ms);
    console.log('[Michelin]', msg);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DOM helpers
  // ────────────────────────────────────────────────────────────────────────────
  function waitFor(predicate, opts = {}) {
    const {
      timeout = CONFIG.timing.maxWaitMs,
      interval = CONFIG.timing.pollIntervalMs,
      label = 'elemento',
    } = opts;
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let lastLog = 0;
      const tick = () => {
        try {
          const v = predicate();
          if (v) {
            console.log(`[Michelin] ✓ ${label} encontrado em ${Date.now() - start}ms`);
            return resolve(v);
          }
        } catch (_) {}
        const elapsed = Date.now() - start;
        if (elapsed - lastLog > 2000) {
          console.log(`[Michelin] ... aguardando ${label} (${(elapsed / 1000).toFixed(1)}s)`);
          lastLog = elapsed;
        }
        if (elapsed > timeout) return reject(new Error(`timeout aguardando ${label}`));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  // Atravessa Shadow DOM em todas as buscas — Angular Material pode renderizar
  // em shadow roots em algumas configurações.
  function queryDeepAll(root, selector) {
    const out = [];
    const walk = (r) => {
      try {
        out.push(...r.querySelectorAll(selector));
      } catch (_) {}
      const all = r.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return out;
  }

  function queryDeep(root, selector) {
    return queryDeepAll(root, selector)[0] || null;
  }

  function querySelectorByList(list) {
    for (const sel of list) {
      const el = queryDeep(document, sel);
      if (el) return el;
    }
    return null;
  }

  function findField(candidates) {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const wants = candidates.map(norm).filter(Boolean);
    const allInputs = queryDeepAll(document, 'input, select, textarea');

    for (const el of allInputs) {
      const id = norm(el.id);
      const name = norm(el.name);
      if (wants.some(w => id === w || name === w)) return el;
    }
    for (const el of allInputs) {
      const blob = norm([el.id, el.name, el.placeholder, el.getAttribute?.('aria-label')].join(' '));
      if (wants.some(w => blob.includes(w))) return el;
    }
    const labels = queryDeepAll(document, 'label, mat-label');
    for (const lbl of labels) {
      const txt = norm(lbl.textContent);
      if (!wants.some(w => txt.includes(w))) continue;
      const forAttr = lbl.getAttribute('for');
      if (forAttr) {
        const el = document.getElementById(forAttr);
        if (el) return el;
      }
      const nested = lbl.querySelector('input, select, textarea');
      if (nested) return nested;
      const parent = lbl.closest('mat-form-field, .form-group, .field, div');
      const sibling = parent?.querySelector('input, select, textarea');
      if (sibling) return sibling;
    }
    return null;
  }

  function findClickableByText(texts) {
    const norm = (s) => (s || '').trim().toLowerCase();
    const wants = texts.map(norm);
    const candidates = queryDeepAll(document, 'a, button, [role="button"], [role="menuitem"], li, span, div, mat-list-item, mat-card');
    for (const el of candidates) {
      const txt = norm(el.textContent);
      if (!txt || txt.length > 80) continue;
      if (wants.some(w => txt === w || txt.includes(w))) return el;
    }
    return null;
  }

  function setReactValue(el, value) {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setIfPresent(candidates, value) {
    if (value === undefined || value === null || value === '') return false;
    const el = findField(candidates);
    if (!el) {
      console.warn('[Michelin] campo não encontrado para', candidates);
      return false;
    }
    setReactValue(el, String(value));
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fluxos
  // ────────────────────────────────────────────────────────────────────────────
  function findLoginField(kind) {
    // 1. seletores CSS
    const el = querySelectorByList(CONFIG.selectors.login[kind]);
    if (el) return el;
    // 2. fallback heurístico por label/placeholder/aria
    const hints = kind === 'email'
      ? ['email', 'e-mail', 'usuario', 'username', 'login']
      : ['senha', 'password'];
    return findField(hints);
  }

  function logInputs() {
    console.log('[Michelin] inputs presentes no momento:',
      queryDeepAll(document, 'input').map(i => ({
        type: i.type, name: i.name, id: i.id,
        placeholder: i.placeholder, autocomplete: i.autocomplete,
        formcontrolname: i.getAttribute('formcontrolname'),
      })));
  }

  // Retorna true se conseguiu autenticar; false se não tinha campos visíveis
  // ou se a URL mudou no meio (Agger redirecionou). Nunca trava o fluxo.
  async function tryLogin(credentialsOverride) {
    const creds = credentialsOverride || CONFIG.credentials;
    toast('Procurando tela de login...');
    console.log('[Michelin] usando e-mail:', creds.email);
    logInputs(); // dump inicial

    let emailEl, passEl;
    const startLoc = location.href;
    const checkRedirect = () => location.href !== startLoc;

    try {
      emailEl = await waitFor(
        () => checkRedirect() ? '__redirect__' : findLoginField('email'),
        { label: 'campo de e-mail', timeout: 10000 }
      );
      if (emailEl === '__redirect__') {
        toast('Página mudou durante login — Agger já autenticou.');
        return false;
      }
      passEl = await waitFor(
        () => checkRedirect() ? '__redirect__' : findLoginField('password'),
        { label: 'campo de senha', timeout: 5000 }
      );
      if (passEl === '__redirect__') {
        toast('Página mudou durante login.');
        return false;
      }
    } catch (e) {
      console.warn('[Michelin] login automático não disponível:', e.message);
      logInputs();
      toast('Sem tela de login — provavelmente já autenticado.');
      return false;
    }

    toast('Preenchendo credenciais...');
    setReactValue(emailEl, creds.email);
    setReactValue(passEl, creds.password);

    emailEl.dispatchEvent(new Event('blur', { bubbles: true }));
    passEl.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));

    toast('Submetendo login...');
    let btn = querySelectorByList(CONFIG.selectors.login.submit);
    if (!btn) btn = findClickableByText(['Entrar', 'Acessar', 'Login']);
    if (btn) {
      console.log('[Michelin] clicando em botão:', btn);
      btn.click();
    } else if (passEl.form) {
      console.log('[Michelin] sem botão visível, submetendo form diretamente');
      passEl.form.submit();
    } else {
      console.warn('[Michelin] nenhum botão de submit encontrado. Pressionando Enter.');
      passEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    return true;
  }

  function goToFormulario() {
    toast('Indo para formulário de cotação auto...');
    console.log('[Michelin] redirecionando para', FORMULARIO_URL);
    location.href = FORMULARIO_URL;
  }

  async function fillQuoteForm(payload) {
    toast('Aguardando formulário...');
    await waitFor(
      () => queryDeep(document, 'input, select, textarea'),
      { label: 'inputs do formulário', timeout: 20000 }
    );
    // dá tempo extra para Angular hidratar todos os controles
    await new Promise(r => setTimeout(r, 1500));
    logInputs();

    const lead = payload.lead || {};
    const f = CONFIG.selectors.quoteForm;
    let filled = 0;
    const onlyDigits = (s) => (s || '').toString().replace(/\D+/g, '');

    if (setIfPresent(f.name, lead.name)) filled++;
    if (setIfPresent(f.cpf, onlyDigits(lead.cpf))) filled++;
    if (setIfPresent(f.rg, lead.rg)) filled++;
    if (setIfPresent(f.birthDate, lead.birthDate)) filled++;
    if (setIfPresent(f.civilStatus, lead.civilStatus)) filled++;
    if (setIfPresent(f.email, lead.email)) filled++;
    if (setIfPresent(f.phone, onlyDigits(lead.phone))) filled++;

    if (setIfPresent(f.plate, (lead.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))) filled++;
    if (setIfPresent(f.chassis, lead.chassis)) filled++;
    if (setIfPresent(f.renavam, lead.renavam)) filled++;
    if (setIfPresent(f.brandModel, lead.brandModel)) filled++;

    if (setIfPresent(f.zipCodeOvernight, onlyDigits(lead.zipCodeOvernight))) filled++;
    if (setIfPresent(f.addressOvernight, lead.addressOvernight)) filled++;
    if (setIfPresent(f.numberOvernight, lead.numberOvernight)) filled++;

    if (lead.isOwnerDriver === false) {
      if (setIfPresent(f.ownerName, lead.ownerName)) filled++;
      if (setIfPresent(f.ownerCpf, onlyDigits(lead.ownerCpfCnpj))) filled++;
    }

    if (setIfPresent(f.insurer, lead.insurer)) filled++;
    if (setIfPresent(f.insuranceExpiry, lead.insuranceExpiry)) filled++;

    toast(`Preenchidos ${filled} campos. Confira e finalize manualmente.`, 6000);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Orquestrador
  // ────────────────────────────────────────────────────────────────────────────
  function isLoginPage() {
    return /\/login\b/i.test(location.pathname) || !!querySelectorByList(CONFIG.selectors.login.password);
  }
  function isFormularioPage() {
    return /\/cotacao\/auto\/formulario/i.test(location.pathname);
  }

  const STEP_KEY = 'michelin_agger_step';

  // Dump periódico do estado da página enquanto debugamos.
  let dumpTimer = null;
  function startStateDump() {
    stopStateDump();
    dumpTimer = setInterval(() => {
      const inputs = queryDeepAll(document, 'input').length;
      const buttons = queryDeepAll(document, 'button').length;
      const iframes = document.querySelectorAll('iframe').length;
      const shadows = queryDeepAll(document, '*').filter(e => e.shadowRoot).length;
      console.log(`[Michelin] estado: path=${location.pathname} inputs=${inputs} buttons=${buttons} iframes=${iframes} shadow=${shadows}`);
    }, 3000);
  }
  function stopStateDump() {
    if (dumpTimer) { clearInterval(dumpTimer); dumpTimer = null; }
  }

  // Aborta operações pendentes quando a URL muda.
  let currentRunId = 0;
  let currentLocation = location.href;

  async function run() {
    const myId = ++currentRunId;
    currentLocation = location.href;
    const aborted = () => myId !== currentRunId;

    // SEMPRE loga estado inicial — não silencia.
    console.log(`[Michelin] run#${myId} — path=${location.pathname}, isLogin=${isLoginPage()}, isForm=${isFormularioPage()}, hash=${location.hash ? 'sim' : 'não'}`);

    try {
      const fromHash = readPayloadFromHash();
      if (fromHash) {
        persistPayload(fromHash);
        sessionStorage.setItem(STEP_KEY, 'pending');
        // NÃO removemos o hash — manter pra sobreviver a redirects HTTP.
        toast(`Lead "${fromHash.lead?.name || '?'}" recebido.`);
      }

      const payload = getPayload();
      if (!payload) {
        console.log('[Michelin] sem payload em storage. Saindo.');
        return;
      }

      const step = sessionStorage.getItem(STEP_KEY) || 'pending';
      console.log(`[Michelin] run#${myId} — step=${step}, lead="${payload.lead?.name || '?'}"`);
      const credentials = payload.credentials;

      startStateDump();

      // CASO 1: já está no formulário — preenche.
      if (isFormularioPage()) {
        toast('Página do formulário detectada — aguardando renderização...');
        sessionStorage.setItem(STEP_KEY, 'filling');
        await fillQuoteForm(payload);
        if (aborted()) return;
        sessionStorage.setItem(STEP_KEY, 'done');
        clearPayload();
        stopStateDump();
        return;
      }

      // CASO 2: tela de login — tenta autenticar (não-travante).
      if (isLoginPage()) {
        await tryLogin(credentials);
        if (aborted()) return;
        // Espera mais tempo para o Agger processar o login.
        await new Promise(r => setTimeout(r, 2500));
        if (aborted()) return;
        // Força navegação para o formulário.
        if (!isLoginPage() && !isFormularioPage()) {
          goToFormulario();
        } else if (isLoginPage()) {
          toast('Login não automatizado — faça login manual e o resto continua.');
        } else if (isFormularioPage()) {
          // Já chegou no form — locationchange dispara novo run.
        }
        return;
      }

      // CASO 3: autenticado mas em outra página → vai pro formulário.
      console.log('[Michelin] autenticado em outra página, redirecionando para formulário.');
      goToFormulario();
    } catch (e) {
      console.error('[Michelin] erro:', e);
      toast(`Erro: ${e.message}. Veja console (F12).`, 6000);
    }
  }

  const _push = history.pushState;
  history.pushState = function (...args) { const r = _push.apply(this, args); window.dispatchEvent(new Event('locationchange')); return r; };
  const _replace = history.replaceState;
  history.replaceState = function (...args) { const r = _replace.apply(this, args); window.dispatchEvent(new Event('locationchange')); return r; };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
  window.addEventListener('locationchange', () => setTimeout(run, 400));

  setTimeout(run, 400);
})();
