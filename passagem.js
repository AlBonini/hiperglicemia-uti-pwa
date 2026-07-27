/*
 * Passagem de plantao - UTI com 10 leitos.
 * Quadro de leito baseado no modelo LEITO (identificacao, ADM hosp/UTI, atendimento,
 * prontuario, clinico responsavel, investimento terapeutico, motivo, antecedentes,
 * antibioticos, dispositivos, cirurgia, exames/culturas pendentes, pendencias).
 * Persistencia local via IndexedDB (Db.*leito*, ver db.js) - nada sai do dispositivo.
 */
(function () {
  'use strict';

  var NUM_LEITOS = 10;
  var leitoAtivoId = 1;
  var estados = {};

  function qs(id) { return document.getElementById(id); }

  // --- TOASTS ---
  function toast(mensagem, tipo, duracaoMs) {
    tipo = tipo || 'info';
    duracaoMs = duracaoMs || (tipo === 'erro' ? 6500 : 4500);
    var container = qs('toast-container');
    var div = document.createElement('div');
    div.className = 'toast ' + tipo;
    div.textContent = mensagem;
    container.appendChild(div);
    setTimeout(function () {
      div.style.transition = 'opacity .3s';
      div.style.opacity = '0';
      setTimeout(function () { div.remove(); }, 300);
    }, duracaoMs);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDataBr(iso) {
    if (!iso) return '-';
    var partes = iso.split('-');
    if (partes.length !== 3) return iso;
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function calcularDiasUti(isoAdmUti) {
    if (!isoAdmUti) return '';
    var admUti = new Date(isoAdmUti + 'T00:00:00');
    if (isNaN(admUti.getTime())) return '';
    var hoje = new Date();
    var hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    var dias = Math.round((hojeSemHora - admUti) / 86400000) + 1;
    return dias > 0 ? String(dias) : '1';
  }

  // --- ANTIBIOTICOS (linhas dinamicas) ---
  function renderAntibioticos(lista) {
    var container = qs('listaAntibioticos');
    container.innerHTML = '';
    (lista || []).forEach(function (atb, idx) {
      var linha = document.createElement('div');
      linha.className = 'linha-atb';
      linha.dataset.idx = String(idx);
      linha.innerHTML =
        '<input type="text" class="atb-nome" placeholder="Nome" maxlength="30" value="' + escapeHtml(atb.nome || '') + '">' +
        '<input type="date" class="atb-inicio" value="' + escapeHtml(atb.inicio || '') + '">' +
        '<input type="date" class="atb-fim" value="' + escapeHtml(atb.fim || '') + '">' +
        '<button type="button" class="atb-remover" title="Remover">&times;</button>';
      container.appendChild(linha);
    });
  }

  function lerAntibioticosDoDom() {
    var linhas = qs('listaAntibioticos').querySelectorAll('.linha-atb');
    var lista = [];
    linhas.forEach(function (linha) {
      lista.push({
        nome: linha.querySelector('.atb-nome').value,
        inicio: linha.querySelector('.atb-inicio').value,
        fim: linha.querySelector('.atb-fim').value,
      });
    });
    return lista;
  }

  // --- LEITURA / ESCRITA DO FORMULARIO ---
  function lerFormularioParaEstado(base) {
    var e = Object.assign({}, base);
    e.nome = qs('campoNome').value;
    e.idade = qs('campoIdade').value;
    e.admHosp = qs('campoAdmHosp').value;
    e.admUti = qs('campoAdmUti').value;
    e.diasUti = qs('campoDiasUti').value;
    e.atendimento = qs('campoAtendimento').value;
    e.prontuario = qs('campoProntuario').value;
    e.clinico = qs('campoClinico').value;
    e.investimento = qs('campoInvestimento').value;
    e.motivo = qs('campoMotivo').value;
    e.antecedentes = qs('campoAntecedentes').value;
    e.antibioticos = lerAntibioticosDoDom();
    e.dispositivos = qs('campoDispositivos').value;
    e.cirurgia = qs('campoCirurgia').value;
    e.examesPendentes = qs('campoExames').value;
    e.culturasPendentes = qs('campoCulturas').value;
    e.pendencias = qs('campoPendencias').value;
    return e;
  }

  function preencherFormulario(e) {
    qs('campoNome').value = e.nome || '';
    qs('campoIdade').value = e.idade || '';
    qs('campoAdmHosp').value = e.admHosp || '';
    qs('campoAdmUti').value = e.admUti || '';
    qs('campoDiasUti').value = e.diasUti || '';
    qs('campoAtendimento').value = e.atendimento || '';
    qs('campoProntuario').value = e.prontuario || '';
    qs('campoClinico').value = e.clinico || '';
    qs('campoInvestimento').value = e.investimento || '';
    qs('campoMotivo').value = e.motivo || '';
    qs('campoAntecedentes').value = e.antecedentes || '';
    renderAntibioticos(e.antibioticos);
    qs('campoDispositivos').value = e.dispositivos || '';
    qs('campoCirurgia').value = e.cirurgia || '';
    qs('campoExames').value = e.examesPendentes || '';
    qs('campoCulturas').value = e.culturasPendentes || '';
    qs('campoPendencias').value = e.pendencias || '';

    qs('leitoTitulo').textContent = 'Leito ' + e.leito + (e.nome && e.nome.trim() ? ' - ' + e.nome.trim() : ' - vago');
    atualizarTituloAba(e.leito, e.nome);
  }

  function atualizarTituloAba(leito, nome) {
    var btn = document.querySelector('.tabs button[data-id="' + leito + '"]');
    if (btn) btn.textContent = 'L' + leito;
    if (btn) btn.title = nome && nome.trim() ? nome.trim() : ('Leito ' + leito + ' vago');
    if (btn) btn.classList.toggle('ocupado', !!(nome && nome.trim()));
  }

  // --- ABAS ---
  function montarAbas() {
    var nav = qs('tabs');
    nav.innerHTML = '';
    for (var i = 1; i <= NUM_LEITOS; i++) {
      var btn = document.createElement('button');
      btn.dataset.id = String(i);
      btn.textContent = 'L' + i;
      if (i === leitoAtivoId) btn.classList.add('ativo');
      btn.addEventListener('click', function () { trocarLeito(parseInt(this.dataset.id, 10)); });
      nav.appendChild(btn);
    }
  }

  function marcarAbaAtiva(id) {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('ativo', parseInt(b.dataset.id, 10) === id);
    });
  }

  function salvarEstadoAtual() {
    estados[leitoAtivoId] = lerFormularioParaEstado(estados[leitoAtivoId]);
    return Db.salvarLeito(estados[leitoAtivoId]);
  }

  function trocarLeito(novoId) {
    if (novoId === leitoAtivoId) return;
    salvarEstadoAtual().then(function () {
      leitoAtivoId = novoId;
      marcarAbaAtiva(novoId);
      preencherFormulario(estados[novoId]);
    });
  }

  // --- ACOES ---
  function aoClicarAddAtb() {
    var lista = lerAntibioticosDoDom();
    lista.push({ nome: '', inicio: '', fim: '' });
    renderAntibioticos(lista);
    salvarEstadoAtual();
  }

  function aoClicarRemoverAtb(idx) {
    var lista = lerAntibioticosDoDom();
    lista.splice(idx, 1);
    renderAntibioticos(lista);
    salvarEstadoAtual();
  }

  function aoMudarAdmUti() {
    var atual = qs('campoDiasUti').value.trim();
    if (atual !== '') return;
    var calculado = calcularDiasUti(qs('campoAdmUti').value);
    if (calculado) qs('campoDiasUti').value = calculado;
    salvarEstadoAtual();
  }

  function aoClicarNovo() {
    if (!window.confirm('Limpar TODOS os dados do leito ' + leitoAtivoId + '?')) return;
    Db.apagarLeito(leitoAtivoId).then(function () {
      var novo = Db.estadoPadraoLeito(leitoAtivoId);
      estados[leitoAtivoId] = novo;
      preencherFormulario(novo);
      toast('Leito ' + leitoAtivoId + ' limpo.', 'info');
    });
  }

  // --- CENSO / RELATORIO ---
  function resumoAntibioticos(lista) {
    if (!lista || !lista.length) return '-';
    return lista.map(function (a) {
      if (!a.nome || !a.nome.trim()) return null;
      var ativo = !a.fim;
      var periodo = fmtDataBr(a.inicio) + (a.fim ? (' a ' + fmtDataBr(a.fim)) : ' (em uso)');
      return escapeHtml(a.nome) + (ativo ? ' <b>*</b>' : '') + ' (' + periodo + ')';
    }).filter(Boolean).join('<br>') || '-';
  }

  function aoClicarRelatorio() {
    salvarEstadoAtual().then(function () {
      var linhas = '';
      for (var i = 1; i <= NUM_LEITOS; i++) {
        var e = estados[i] || Db.estadoPadraoLeito(i);
        var vago = !e.nome || !e.nome.trim();
        linhas += '<tr' + (vago ? ' style="color:#999;"' : '') + '>' +
          '<td><b>' + i + '</b></td>' +
          '<td>' + (vago ? 'vago' : escapeHtml(e.nome)) + (e.idade ? ' (' + escapeHtml(e.idade) + 'a)' : '') + '</td>' +
          '<td>' + escapeHtml(e.diasUti || '-') + '</td>' +
          '<td>' + escapeHtml(e.clinico || '-') + '</td>' +
          '<td>' + escapeHtml(e.investimento || '-') + '</td>' +
          '<td>' + escapeHtml(e.motivo || '-') + '</td>' +
          '<td>' + resumoAntibioticos(e.antibioticos) + '</td>' +
          '<td>' + escapeHtml(e.dispositivos || '-') + '</td>' +
          '<td>' + escapeHtml(e.pendencias || '-') + '</td>' +
          '</tr>';
      }

      qs('relatorioTitulo').textContent = 'Censo - Passagem de Plantao (' + new Date().toLocaleString('pt-BR') + ')';
      qs('relatorioConteudo').innerHTML =
        '<div class="tabela-scroll"><table><thead><tr><th>Leito</th><th>Paciente</th><th>Dias UTI</th><th>Clinico</th>' +
        '<th>Investimento</th><th>Motivo</th><th>ATB (* em uso)</th><th>Dispositivos</th><th>Pendencias</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table></div>';

      qs('relatorio-overlay').classList.remove('hidden');
    });
  }

  // --- INICIALIZACAO ---
  function carregarTodosLeitos() {
    var promessas = [];
    for (var i = 1; i <= NUM_LEITOS; i++) {
      promessas.push(Db.carregarLeito(i).then(function (e) { estados[e.leito] = e; }));
    }
    return Promise.all(promessas);
  }

  function ligarEventos() {
    qs('btnNovo').addEventListener('click', aoClicarNovo);
    qs('btnRelatorio').addEventListener('click', aoClicarRelatorio);
    qs('btnFecharRelatorio').addEventListener('click', function () {
      qs('relatorio-overlay').classList.add('hidden');
    });
    qs('btnAddAtb').addEventListener('click', aoClicarAddAtb);

    qs('listaAntibioticos').addEventListener('click', function (ev) {
      if (ev.target && ev.target.classList.contains('atb-remover')) {
        var linha = ev.target.closest('.linha-atb');
        aoClicarRemoverAtb(parseInt(linha.dataset.idx, 10));
      }
    });

    qs('campoAdmUti').addEventListener('change', aoMudarAdmUti);

    qs('campoNome').addEventListener('input', function () {
      atualizarTituloAba(leitoAtivoId, this.value);
      qs('leitoTitulo').textContent = 'Leito ' + leitoAtivoId + (this.value.trim() ? ' - ' + this.value.trim() : ' - vago');
    });

    document.querySelector('main').addEventListener('blur', function (ev) {
      if (ev.target && ev.target.matches('input, select, textarea')) salvarEstadoAtual();
    }, true);
    qs('campoInvestimento').addEventListener('change', salvarEstadoAtual);

    window.addEventListener('beforeunload', salvarEstadoAtual);
  }

  function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('Falha ao registrar service worker:', e);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    montarAbas();
    ligarEventos();
    carregarTodosLeitos().then(function () {
      preencherFormulario(estados[leitoAtivoId]);
      for (var i = 1; i <= NUM_LEITOS; i++) atualizarTituloAba(i, estados[i].nome);
      registrarServiceWorker();
    });
  });
}());
