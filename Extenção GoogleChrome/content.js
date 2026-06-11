(function () {
  'use strict';

  const STEP_KEY = 'michelin_agger_step';
  const FORMULARIO_URL = 'https://aggilizador.com.br/cotacao/auto/formulario';

  console.log('%c[Michelin Seguros] extensão ativa em ' + location.hostname, 'color:#d4a854;font-weight:bold');

  // ── CONFIG ────────────────────────────────────────────────────────────────────
  const CONFIG = {
    credentials: {
      email: 'michelinseguros@hotmail.com',
      password: 'Bw8ygomm@agger',
    },
    selectors: {
      login: {
        email: [
          'input[autocomplete="email"]',
          'input[autocomplete="username"]',
          'input[formcontrolname="email"]',
          'input[formcontrolname="login"]',
          'input[formcontrolname="usuario"]',
          'input[formcontrolname="username"]',
          'mat-form-field input[type="email"]',
          'mat-form-field input[type="text"]:not([type="password"]):not([type="hidden"])',
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
        insurer: ['seguradora_atual', 'seguradoraAtual', 'seguradora'],
        insuranceExpiry: ['vencimento_seguro', 'vencimentoSeguro', 'fim_vigencia'],
      },
    },
    timing: { maxWaitMs: 15000, pollIntervalMs: 200 },
  };

  // ── STORAGE (via message passing ao background.js) ───────────────────────────
  // chrome.storage.session não é acessível em content scripts; o background
  // expõe getPayload/clearPayload via chrome.runtime.onMessage.

  function getPayload() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ acao: 'getPayload' }, function (response) {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(response || null);
      });
    });
  }

  function clearPayload() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ acao: 'clearPayload' }, function () {
        if (chrome.runtime.lastError) { /* ignora */ }
        resolve();
      });
    });
  }

  // ── UI (toast) ────────────────────────────────────────────────────────────────

  function ensureToastRoot() {
    let el = document.getElementById('michelin-agger-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'michelin-agger-toast';
      el.style.cssText = [
        'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
        'background:#0b0b0c', 'color:#f5d68f',
        'font-family:system-ui,-apple-system,sans-serif',
        'padding:12px 16px', 'border-radius:12px',
        'border:1px solid rgba(245,214,143,0.3)',
        'font-size:12px', 'max-width:320px',
        'box-shadow:0 10px 30px rgba(0,0,0,0.4)',
        'font-weight:600', 'letter-spacing:0.04em',
        'transition:opacity .25s',
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg, ms) {
    if (ms === undefined) ms = 3500;
    const el = ensureToastRoot();
    el.textContent = 'Michelin → Agger: ' + msg;
    el.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.style.opacity = '0'; }, ms);
    console.log('[Michelin]', msg);
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function waitFor(predicate, opts) {
    opts = opts || {};
    var timeout = opts.timeout !== undefined ? opts.timeout : CONFIG.timing.maxWaitMs;
    var interval = opts.interval !== undefined ? opts.interval : CONFIG.timing.pollIntervalMs;
    var label = opts.label || 'elemento';
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var lastLog = 0;
      function tick() {
        try {
          var v = predicate();
          if (v) {
            console.log('[Michelin] ✓ ' + label + ' encontrado em ' + (Date.now() - start) + 'ms');
            return resolve(v);
          }
        } catch (_) {}
        var elapsed = Date.now() - start;
        if (elapsed - lastLog > 2000) {
          console.log('[Michelin] ... aguardando ' + label + ' (' + (elapsed / 1000).toFixed(1) + 's)');
          lastLog = elapsed;
        }
        if (elapsed > timeout) return reject(new Error('timeout aguardando ' + label));
        setTimeout(tick, interval);
      }
      tick();
    });
  }

  function queryDeepAll(root, selector) {
    var out = [];
    function walk(r) {
      try { out.push.apply(out, r.querySelectorAll(selector)); } catch (_) {}
      var all = r.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        if (all[i].shadowRoot) walk(all[i].shadowRoot);
      }
    }
    walk(root);
    return out;
  }

  function queryDeep(root, selector) {
    return queryDeepAll(root, selector)[0] || null;
  }

  function querySelectorByList(list) {
    for (var i = 0; i < list.length; i++) {
      var el = queryDeep(document, list[i]);
      if (el) return el;
    }
    return null;
  }

  function findField(candidates) {
    var norm = function (s) { return (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var wants = candidates.map(norm).filter(Boolean);
    var allInputs = queryDeepAll(document, 'input, select, textarea');
    // Exact match on id, name, or formcontrolname (Angular)
    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      var id = norm(el.id);
      var name = norm(el.name);
      var fcn = norm(el.getAttribute && el.getAttribute('formcontrolname'));
      if (wants.some(function (w) { return id === w || name === w || fcn === w; })) return el;
    }
    // Partial match on any attribute blob
    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      var blob = norm([
        el.id, el.name, el.placeholder,
        el.getAttribute && el.getAttribute('aria-label'),
        el.getAttribute && el.getAttribute('formcontrolname'),
      ].join(' '));
      if (wants.some(function (w) { return blob.includes(w); })) return el;
    }
    var labels = queryDeepAll(document, 'label, mat-label');
    for (var j = 0; j < labels.length; j++) {
      var lbl = labels[j];
      var txt = norm(lbl.textContent);
      if (!wants.some(function (w) { return txt.includes(w); })) continue;
      var forAttr = lbl.getAttribute('for');
      if (forAttr) {
        var byId = document.getElementById(forAttr);
        if (byId) return byId;
      }
      var nested = lbl.querySelector('input, select, textarea');
      if (nested) return nested;
      var parent = lbl.closest('mat-form-field, .form-group, .field, div');
      var sibling = parent && parent.querySelector('input, select, textarea');
      if (sibling) return sibling;
    }
    return null;
  }

  function findClickableByText(texts) {
    var norm = function (s) { return (s || '').trim().toLowerCase(); };
    var wants = texts.map(norm);
    var candidates = queryDeepAll(document, 'a, button, [role="button"], [role="menuitem"], li, span, div, mat-list-item, mat-card');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var txt = norm(el.textContent);
      if (!txt || txt.length > 80) continue;
      if (wants.some(function (w) { return txt === w || txt.includes(w); })) return el;
    }
    return null;
  }

  function setReactValue(el, value) {
    if (!el) return;
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    var setter = descriptor && descriptor.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Dispara o ciclo completo de eventos que o Angular usa para detectar mudança
  // e acionar auto-lookup (debounce em valueChanges).
  function triggerAngularInput(el, value) {
    if (!el) return;
    el.focus();
    setReactValue(el, value);
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function setIfPresent(candidates, value) {
    if (value === undefined || value === null || value === '') return false;
    var el = findField(candidates);
    if (!el) {
      console.warn('[Michelin] campo não encontrado para', candidates);
      return false;
    }
    setReactValue(el, String(value));
    return true;
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────────

  function findLoginField(kind) {
    var el = querySelectorByList(CONFIG.selectors.login[kind]);
    if (el) return el;
    var hints = kind === 'email'
      ? ['email', 'e-mail', 'usuario', 'username', 'login']
      : ['senha', 'password'];
    return findField(hints);
  }

  function logInputs() {
    console.log('[Michelin] inputs presentes:', queryDeepAll(document, 'input').map(function (i) {
      return {
        type: i.type, name: i.name, id: i.id,
        placeholder: i.placeholder, autocomplete: i.autocomplete,
        formcontrolname: i.getAttribute('formcontrolname'),
      };
    }));
  }

  async function tryLogin(credentialsOverride) {
    var creds = credentialsOverride || CONFIG.credentials;
    toast('Procurando tela de login...');
    console.log('[Michelin] usando e-mail:', creds.email);
    logInputs();

    var startLoc = location.href;
    var checkRedirect = function () { return location.href !== startLoc; };
    var emailEl, passEl;

    try {
      emailEl = await waitFor(
        function () { return checkRedirect() ? '__redirect__' : findLoginField('email'); },
        { label: 'campo de e-mail', timeout: 10000 }
      );
      if (emailEl === '__redirect__') { toast('Página mudou — Agger já autenticou.'); return false; }
      passEl = await waitFor(
        function () { return checkRedirect() ? '__redirect__' : findLoginField('password'); },
        { label: 'campo de senha', timeout: 5000 }
      );
      if (passEl === '__redirect__') { toast('Página mudou durante login.'); return false; }
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
    await new Promise(function (r) { setTimeout(r, 300); });

    toast('Submetendo login...');
    var btn = querySelectorByList(CONFIG.selectors.login.submit);
    if (!btn) btn = findClickableByText(['Entrar', 'Acessar', 'Login']);
    if (btn) {
      btn.click();
    } else if (passEl.form) {
      passEl.form.submit();
    } else {
      passEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    return true;
  }

  function goToFormulario() {
    toast('Indo para formulário de cotação auto...');
    console.log('[Michelin] redirecionando para', FORMULARIO_URL);
    location.href = FORMULARIO_URL;
  }

  // ── PREENCHIMENTO DO FORMULÁRIO ───────────────────────────────────────────────
  // O Agger usa auto-lookup: ao digitar CPF ele busca e preenche dados do cliente;
  // ao digitar a placa ele busca e preenche dados do veículo.
  // Portanto só precisamos preencher CPF e placa e aguardar cada auto-preenchimento.

  async function fillQuoteForm(payload) {
    var lead = payload.lead || {};
    var onlyDigits = function (s) { return (s || '').toString().replace(/\D+/g, ''); };

    // ── 1. Aguarda o formulário renderizar ──────────────────────────────────────
    toast('Aguardando formulário de cotação...');
    await waitFor(
      function () { return queryDeep(document, 'input:not([type="hidden"])'); },
      { label: 'campo inicial do formulário', timeout: 20000 }
    );
    await sleep(1000); // Angular precisa de um tick para inicializar os form controls
    logInputs();

    // ── 2. Preenche CPF e aguarda auto-lookup do cliente ────────────────────────
    var cpf = onlyDigits(lead.cpf);
    if (cpf) {
      toast('Buscando campo CPF...');
      var cpfEl = null;
      try {
        cpfEl = await waitFor(
          function () { return findField(['cpf']); },
          { label: 'campo CPF', timeout: 10000 }
        );
      } catch (_) {
        // Fallback: usa o primeiro input visível da página
        cpfEl = queryDeep(document, 'input:not([type="hidden"]):not([type="password"])');
        if (cpfEl) console.warn('[Michelin] CPF: usando input genérico como fallback', cpfEl);
      }

      if (cpfEl) {
        var countBefore = queryDeepAll(document, 'input:not([type="hidden"])').length;
        toast('Preenchendo CPF — aguardando busca automática...');
        triggerAngularInput(cpfEl, cpf);

        // Aguarda o auto-lookup adicionar novos campos OU timeout
        try {
          await waitFor(
            function () {
              return queryDeepAll(document, 'input:not([type="hidden"])').length > countBefore ? true : null;
            },
            { label: 'campos adicionais após CPF', timeout: 15000 }
          );
          await sleep(600); // Deixa o Angular terminar de renderizar
        } catch (_) {
          console.warn('[Michelin] timeout aguardando campos após CPF — continuando');
          await sleep(1000);
        }
        logInputs();
      } else {
        console.warn('[Michelin] campo CPF não encontrado — pulando');
      }
    }

    // ── 3. Preenche placa e aguarda auto-lookup do veículo ──────────────────────
    var plate = (lead.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (plate) {
      toast('Buscando campo placa...');
      var plateEl = null;
      try {
        plateEl = await waitFor(
          function () { return findField(['placa', 'plate']); },
          { label: 'campo placa', timeout: 10000 }
        );
      } catch (_) {
        console.warn('[Michelin] campo placa não encontrado');
      }

      if (plateEl) {
        toast('Preenchendo placa — aguardando busca automática...');
        triggerAngularInput(plateEl, plate);
        // Veículo demora um pouco mais (consulta externa); aguarda fixo
        await sleep(3500);
        logInputs();
      } else {
        console.warn('[Michelin] campo placa não encontrado — pulando');
      }
    }

    toast('CPF e placa preenchidos! O Agger completará os demais dados automaticamente. Confira e finalize.', 8000);
    console.log('[Michelin] preenchimento concluído — CPF=' + (cpf ? '✓' : '✗') + ' placa=' + (plate ? '✓' : '✗'));
  }

  // ── ORQUESTRADOR ──────────────────────────────────────────────────────────────

  function isLoginPage() {
    return /\/login\b/i.test(location.pathname) || !!querySelectorByList(CONFIG.selectors.login.password);
  }

  function isFormularioPage() {
    return /\/cotacao\/auto\/formulario/i.test(location.pathname);
  }

  var dumpTimer = null;
  function startStateDump() {
    stopStateDump();
    dumpTimer = setInterval(function () {
      console.log('[Michelin] estado: path=' + location.pathname +
        ' inputs=' + queryDeepAll(document, 'input').length +
        ' buttons=' + queryDeepAll(document, 'button').length);
    }, 3000);
  }
  function stopStateDump() {
    if (dumpTimer) { clearInterval(dumpTimer); dumpTimer = null; }
  }

  var currentRunId = 0;

  async function run() {
    var myId = ++currentRunId;
    var aborted = function () { return myId !== currentRunId; };

    console.log('[Michelin] run#' + myId + ' — path=' + location.pathname +
      ', isLogin=' + isLoginPage() + ', isForm=' + isFormularioPage());

    try {
      var payload = await getPayload();
      if (!payload) {
        console.log('[Michelin] sem payload em storage. Saindo.');
        return;
      }

      var step = sessionStorage.getItem(STEP_KEY) || 'pending';
      console.log('[Michelin] run#' + myId + ' — step=' + step + ', lead="' + (payload.lead && payload.lead.name || '?') + '"');

      startStateDump();

      if (isFormularioPage()) {
        toast('Formulário detectado — aguardando renderização...');
        sessionStorage.setItem(STEP_KEY, 'filling');
        await fillQuoteForm(payload);
        if (aborted()) return;
        sessionStorage.setItem(STEP_KEY, 'done');
        await clearPayload();
        stopStateDump();
        return;
      }

      if (isLoginPage()) {
        await tryLogin(payload.credentials);
        if (aborted()) return;
        await new Promise(function (r) { setTimeout(r, 2500); });
        if (aborted()) return;
        if (!isLoginPage() && !isFormularioPage()) {
          goToFormulario();
        } else if (isLoginPage()) {
          toast('Login não automatizado — faça login manual e o formulário será preenchido.', 8000);
        }
        return;
      }

      console.log('[Michelin] autenticado em outra página, redirecionando para formulário.');
      goToFormulario();
    } catch (e) {
      console.error('[Michelin] erro:', e);
      toast('Erro: ' + e.message + '. Veja console (F12).', 6000);
    }
  }

  // Intercepta navegação SPA (Angular usa pushState/replaceState)
  var _push = history.pushState;
  history.pushState = function () {
    var r = _push.apply(this, arguments);
    window.dispatchEvent(new Event('locationchange'));
    return r;
  };
  var _replace = history.replaceState;
  history.replaceState = function () {
    var r = _replace.apply(this, arguments);
    window.dispatchEvent(new Event('locationchange'));
    return r;
  };
  window.addEventListener('popstate', function () { window.dispatchEvent(new Event('locationchange')); });
  window.addEventListener('locationchange', function () { setTimeout(run, 400); });

  setTimeout(run, 400);
})();
