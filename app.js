(function () {
  'use strict';

  var NUM_PACIENTES = 5;
  var pacienteAtivoId = 1;
  var estados = {};
  var backups = {};

  function qs(id) { return document.getElementById(id); }

  // --- TOASTS (substitui messagebox) ---
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

  function fmtHora(d) {
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  // --- LEITURA / ESCRITA DO FORMULARIO ---
  function lerTaxaCampo() {
    var v = qs('campoTaxa').value.trim();
    if (v === '') return null;
    if (v.toUpperCase() === 'SUSPENSO') return 'SUSPENSO';
    var n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function freqSelecionada() {
    var radios = document.querySelectorAll('input[name="freq"]');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) return radios[i].value;
    }
    return '1';
  }

  function lerFormularioParaEstado(base) {
    var e = Object.assign({}, base);
    e.nome = qs('campoNome').value;
    e.idade = qs('campoIdade').value;
    e.hba1c = qs('campoHba1c').value;
    e.glicGatilho = qs('campoGlicGatilho').value;
    e.bgConfirmado = qs('campoBgConfirmado').checked;
    e.naoCadEhh = qs('campoNaoCadEhh').checked;
    e.totalInfundido = qs('campoTotalInfundido').value;
    e.kAtual = qs('campoK').value;
    e.sintomatico = qs('campoSintomatico').checked;
    e.glicPrev = qs('campoGlicPrev').value;
    e.glicNow = qs('campoGlicNow').value;
    e.horasIntervalo = qs('campoHoras').value;
    e.freqMonitor = freqSelecionada();
    e.taxaAtual = lerTaxaCampo();
    return e;
  }

  function preencherFormulario(e) {
    qs('campoNome').value = e.nome || '';
    qs('campoIdade').value = e.idade || '';
    qs('campoHba1c').value = e.hba1c || '';
    qs('campoGlicGatilho').value = e.glicGatilho || '';
    qs('campoBgConfirmado').checked = !!e.bgConfirmado;
    qs('campoNaoCadEhh').checked = !!e.naoCadEhh;
    qs('campoTotalInfundido').value = e.totalInfundido || '';
    qs('campoK').value = e.kAtual || '';
    qs('campoSintomatico').checked = !!e.sintomatico;
    qs('campoGlicPrev').value = e.glicPrev || '';
    qs('campoGlicNow').value = e.glicNow || '';
    qs('campoHoras').value = e.horasIntervalo || '';
    document.querySelectorAll('input[name="freq"]').forEach(function (r) {
      r.checked = (r.value === (e.freqMonitor || '1'));
    });
    qs('campoTaxa').value = e.taxaAtual === null || e.taxaAtual === undefined ? '' : String(e.taxaAtual);
    qs('btnCalcular').disabled = (e.taxaAtual === 'SUSPENSO');

    qs('resAcao').textContent = e.resAcao || '---';
    qs('resAcao').style.color = e.resAcaoCor || Protocolo.COR_PRIMARIA;
    qs('resDelta').textContent = e.resDelta || '---';
    qs('resVazao').textContent = e.resVazao || '---';

    qs('ultimoHorario').textContent = e.ultimoTs ? ('Ult: ' + fmtHora(new Date(e.ultimoTs))) : 'Ult: --:--';
    qs('alertaAtraso').textContent = e.alertaAtraso ? 'ATRASO' : '';

    atualizarTituloAba(e.id, e.nome);
  }

  function atualizarTituloAba(id, nome) {
    var btn = document.querySelector('.tabs button[data-id="' + id + '"]');
    if (btn) btn.textContent = nome && nome.trim() ? nome.trim().slice(0, 10) : ('P' + id);
  }

  // --- ABAS ---
  function montarAbas() {
    var nav = qs('tabs');
    nav.innerHTML = '';
    for (var i = 1; i <= NUM_PACIENTES; i++) {
      var btn = document.createElement('button');
      btn.dataset.id = String(i);
      btn.textContent = 'P' + i;
      if (i === pacienteAtivoId) btn.classList.add('ativo');
      btn.addEventListener('click', function () { trocarPaciente(parseInt(this.dataset.id, 10)); });
      nav.appendChild(btn);
    }
  }

  function marcarAbaAtiva(id) {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('ativo', parseInt(b.dataset.id, 10) === id);
    });
  }

  function salvarEstadoAtual() {
    estados[pacienteAtivoId] = lerFormularioParaEstado(estados[pacienteAtivoId]);
    return Db.salvarPaciente(estados[pacienteAtivoId]);
  }

  function trocarPaciente(novoId) {
    if (novoId === pacienteAtivoId) return;
    salvarEstadoAtual().then(function () {
      pacienteAtivoId = novoId;
      marcarAbaAtiva(novoId);
      preencherFormulario(estados[novoId]);
    });
  }

  // --- BACKUP / DESFAZER (1 nivel, como no app desktop) ---
  function fazerBackup() {
    backups[pacienteAtivoId] = JSON.parse(JSON.stringify(estados[pacienteAtivoId]));
  }

  function desfazer() {
    var b = backups[pacienteAtivoId];
    if (!b) { toast('Nada para desfazer ainda.', 'info'); return; }
    estados[pacienteAtivoId] = b;
    preencherFormulario(b);
    Db.salvarPaciente(b);
    toast('Valores restaurados.', 'info');
  }

  // --- HISTORICO ---
  function registrarHistorico(estado, glicAnteriorAplicado, glicAtualAplicado, taxaAnteriorTexto, novaTaxaTexto,
                               novaTaxaNumerica, deltaInfo, acao, alertaTempo) {
    return Db.adicionarHistorico({
      idPaciente: estado.id,
      nome: estado.nome,
      idade: estado.idade,
      hba1c: estado.hba1c,
      ts: new Date().toISOString(),
      glicAnterior: glicAnteriorAplicado,
      glicAtual: glicAtualAplicado,
      taxaAnteriorTexto: taxaAnteriorTexto,
      novaTaxaTexto: novaTaxaTexto,
      novaTaxaNumerica: novaTaxaNumerica,
      deltaInfo: deltaInfo,
      acao: acao,
      alertaTempo: !!alertaTempo,
    });
  }

  // --- ACOES PRINCIPAIS ---
  function aoClicarCalcular() {
    fazerBackup();
    var estadoAtual = lerFormularioParaEstado(estados[pacienteAtivoId]);
    var taxaAnteriorTexto = estadoAtual.taxaAtual === null ? 'Inicio' : String(estadoAtual.taxaAtual);
    // capturado ANTES de calcularConduta sobrescrever glicPrev/glicNow para a proxima rodada
    var glicAnteriorOriginal = (estadoAtual.glicPrev === '' || estadoAtual.glicPrev == null) ? '---' : estadoAtual.glicPrev;

    var r = Protocolo.calcularConduta(estadoAtual, new Date());

    if (r.erro) { toast(r.erro, 'aviso'); return; }

    estadoAtual.resDelta = r.deltaInfo;
    estadoAtual.resAcaoCor = r.cor;
    estadoAtual.alertaAtraso = r.alertaTempo;
    estadoAtual.ultimoTs = r.agoraISO;

    if (r.suspender) {
      estadoAtual.resAcao = r.texto;
      estadoAtual.resVazao = 'SUSPENSO';
      estadoAtual.taxaAtual = 'SUSPENSO';
      if (r.retomada) estadoAtual.retomada = r.retomada;
    } else {
      estadoAtual.resAcao = r.texto;
      estadoAtual.resVazao = Protocolo.fmt(r.novaTaxa) + ' UI/h = ' + Protocolo.fmt(r.novaTaxa) + ' mL/h';
      estadoAtual.taxaAtual = Protocolo.fmt(r.novaTaxa);
      if (r.novaTaxa > 0) estadoAtual.taxaReferencia = r.novaTaxa;
      estadoAtual.retomada = null;
    }

    // espelha o desktop: glicemia atual passa a ser a anterior na proxima rodada
    estadoAtual.glicPrev = Protocolo.fmt(r.glicNowAplicado);
    estadoAtual.glicNow = '';
    estadoAtual.horasIntervalo = '';

    estados[pacienteAtivoId] = estadoAtual;
    preencherFormulario(estadoAtual);

    registrarHistorico(
      estadoAtual,
      glicAnteriorOriginal,
      r.glicNowAplicado, taxaAnteriorTexto,
      r.suspender ? 'SUSPENSO' : Protocolo.fmt(r.novaTaxa),
      r.suspender ? 0 : r.novaTaxa,
      r.deltaInfo, r.texto, r.alertaTempo
    );
    Db.salvarPaciente(estadoAtual);
  }

  function aplicarRetomada(r) {
    if (r.info) { toast(r.info, 'info'); return; }
    if (r.erro) { toast(r.erro, 'aviso'); return; }
    if (r.aguardar) {
      toast('Suspensao por tempo ainda em curso.\nFaltam ~' + r.faltamMin + ' min para completar os ' +
        r.limite + ' min indicados pelo protocolo.', 'aviso');
      return;
    }
    if (r.bloqueadoGlicemia) {
      toast('Glicemia atual: ' + Protocolo.fmt(r.glicNow) + ' mg/dL.\n\nA infusao so deve ser retomada quando a ' +
        'glicemia for >= ' + Protocolo.fmt(r.gate) + ' mg/dL.', 'aviso');
      return;
    }
    if (r.ok) {
      fazerBackup();
      var e = estados[pacienteAtivoId];
      e.taxaAtual = Protocolo.fmt(r.novaTaxa);
      if (r.novaTaxa > 0) e.taxaReferencia = r.novaTaxa;
      e.resAcao = r.msg;
      e.resAcaoCor = Protocolo.COR_PRIMARIA;
      e.resVazao = Protocolo.fmt(r.novaTaxa) + ' UI/h = ' + Protocolo.fmt(r.novaTaxa) + ' mL/h';
      e.resDelta = '---';
      e.retomada = null;
      if (r.glicPrevAplicado !== undefined) {
        e.glicPrev = Protocolo.fmt(r.glicPrevAplicado);
        e.glicNow = '';
      }
      estados[pacienteAtivoId] = e;
      preencherFormulario(e);
      registrarHistorico(e, e.glicPrev || '---', r.glicPrevAplicado, 'SUSPENSO', Protocolo.fmt(r.novaTaxa),
        r.novaTaxa, '---', r.msg, false);
      Db.salvarPaciente(e);
      toast(r.msg, 'sucesso');
    }
  }

  function aoClicarRetomar() {
    var estadoAtual = lerFormularioParaEstado(estados[pacienteAtivoId]);
    estados[pacienteAtivoId] = estadoAtual;
    var r = Protocolo.retomarInfusao(estadoAtual, new Date());
    aplicarRetomada(r);
  }

  function aoClicarPausar() {
    fazerBackup();
    var estadoAtual = lerFormularioParaEstado(estados[pacienteAtivoId]);
    var r = Protocolo.pausarInfusao(estadoAtual);
    estadoAtual.retomada = r.retomada;
    estadoAtual.taxaAtual = 'SUSPENSO';
    estadoAtual.resAcao = r.texto;
    estadoAtual.resAcaoCor = r.cor;
    estadoAtual.resVazao = 'SUSPENSO';
    estadoAtual.resDelta = '---';
    estados[pacienteAtivoId] = estadoAtual;
    preencherFormulario(estadoAtual);
    registrarHistorico(estadoAtual, estadoAtual.glicPrev || '---', estadoAtual.glicNow || '---',
      'PAUSA MANUAL', 'SUSPENSO', 0, '---', r.texto, false);
    Db.salvarPaciente(estadoAtual);
    toast('Infusao suspensa manualmente.\nPara retomar: informe a Glicemia Atual (>=150 mg/dL) e toque RETOMAR ' +
      '(libera 50% da taxa anterior).', 'aviso', 7000);
  }

  function aoClicarNutricao() {
    fazerBackup();
    var estadoAtual = lerFormularioParaEstado(estados[pacienteAtivoId]);
    var r = Protocolo.nutricaoSuspensa(estadoAtual);
    if (r.info) { toast(r.info, 'info'); return; }
    estadoAtual.taxaAtual = Protocolo.fmt(r.novaTaxa);
    estadoAtual.taxaReferencia = r.novaTaxa;
    estadoAtual.resAcao = r.texto;
    estadoAtual.resAcaoCor = r.cor;
    estadoAtual.resVazao = Protocolo.fmt(r.novaTaxa) + ' UI/h = ' + Protocolo.fmt(r.novaTaxa) + ' mL/h';
    estadoAtual.resDelta = r.deltaInfo;
    estados[pacienteAtivoId] = estadoAtual;
    preencherFormulario(estadoAtual);
    registrarHistorico(estadoAtual, estadoAtual.glicPrev || '---', estadoAtual.glicNow || '---',
      'NUTRICAO SUSPENSA -50%', Protocolo.fmt(r.novaTaxa), r.novaTaxa, r.deltaInfo, r.texto, false);
    Db.salvarPaciente(estadoAtual);
    toast('Taxa reduzida para ' + Protocolo.fmt(r.novaTaxa) + ' UI/h.\nReforce a monitorizacao da glicemia (1/1h).', 'aviso');
  }

  function aoClicarNovo() {
    if (!window.confirm('Apagar TODOS os dados da aba ' + pacienteAtivoId + '?')) return;
    Db.apagarPaciente(pacienteAtivoId).then(function () {
      var novo = Db.estadoPadrao(pacienteAtivoId);
      estados[pacienteAtivoId] = novo;
      delete backups[pacienteAtivoId];
      preencherFormulario(novo);
      toast('Dados da aba apagados.', 'info');
    });
  }

  // --- RELATORIO (substitui o PDF do app desktop) ---
  function calcularConsumo(historico, horasJanela) {
    var agora = new Date();
    var inicioJanela = new Date(agora.getTime() - horasJanela * 3600000);
    var ordenado = historico.slice().sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
    if (!ordenado.length) return 0;
    var total = 0;
    for (var i = 0; i < ordenado.length; i++) {
      var tAtual = new Date(ordenado[i].ts);
      var rate = ordenado[i].novaTaxaNumerica || 0;
      var tFim = (i < ordenado.length - 1) ? new Date(ordenado[i + 1].ts) : agora;
      var interInicio = tAtual > inicioJanela ? tAtual : inicioJanela;
      var interFim = tFim < agora ? tFim : agora;
      if (interFim > interInicio) {
        total += ((interFim - interInicio) / 3600000) * rate;
      }
    }
    return Math.round(total * 100) / 100;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function aoClicarRelatorio() {
    var e = estados[pacienteAtivoId];
    if (!e.nome || !e.nome.trim()) { toast('Preencha o nome.', 'aviso'); return; }

    Db.listarHistorico(pacienteAtivoId).then(function (historico) {
      if (!historico.length) { toast('Sem historico para esta aba.', 'info'); return; }
      historico.sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });

      var linhas = historico.map(function (h) {
        var dt = new Date(h.ts);
        var dataHora = dt.toLocaleDateString('pt-BR') + ' ' + fmtHora(dt);
        var conduta = (h.alertaTempo ? '[ATRASO] ' : '') + (h.acao || '');
        var corLinha = /SUSPEND|HIPOGLICEMIA/i.test(conduta) ? 'color:#c62828;' : '';
        return '<tr><td>' + dataHora + '</td><td>' + escapeHtml(h.glicAnterior) + ' -&gt; ' +
          escapeHtml(h.glicAtual) + '</td><td>' + escapeHtml(h.taxaAnteriorTexto) + ' -&gt; ' +
          escapeHtml(h.novaTaxaTexto) + '</td><td style="' + corLinha + '">' + escapeHtml(conduta) + '</td></tr>';
      }).join('');

      var uso6 = calcularConsumo(historico, 6);
      var uso12 = calcularConsumo(historico, 12);
      var uso24 = calcularConsumo(historico, 24);

      qs('relatorioTitulo').textContent = 'Prontuario - ' + e.nome;
      qs('relatorioConteudo').innerHTML =
        '<p><b>Paciente:</b> ' + escapeHtml(e.nome) + ' - <b>Emissao:</b> ' +
        new Date().toLocaleString('pt-BR') + '</p>' +
        '<table><thead><tr><th>Data/Hora</th><th>Glicemia</th><th>Taxa (UI/h)</th><th>Conduta</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table>' +
        '<h3>Resumo de Consumo de Insulina Regular (Estimado)</h3>' +
        '<table><thead><tr><th>Periodo</th><th>Ultimas 6h</th><th>Ultimas 12h</th><th>Ultimas 24h</th></tr></thead>' +
        '<tbody><tr><td>Total (UI)</td><td>' + uso6 + ' UI</td><td>' + uso12 + ' UI</td><td>' + uso24 + ' UI</td></tr></tbody></table>';

      qs('relatorio-overlay').classList.remove('hidden');
    });
  }

  // --- INICIALIZACAO ---
  function carregarTodosPacientes() {
    var promessas = [];
    for (var i = 1; i <= NUM_PACIENTES; i++) {
      promessas.push(Db.carregarPaciente(i).then(function (e) { estados[e.id] = e; }));
    }
    return Promise.all(promessas);
  }

  function ligarEventos() {
    qs('btnCalcular').addEventListener('click', aoClicarCalcular);
    qs('btnPausar').addEventListener('click', aoClicarPausar);
    qs('btnRetomar').addEventListener('click', aoClicarRetomar);
    qs('btnNutricao').addEventListener('click', aoClicarNutricao);
    qs('btnDesfazer').addEventListener('click', desfazer);
    qs('btnNovo').addEventListener('click', aoClicarNovo);
    qs('btnRelatorio').addEventListener('click', aoClicarRelatorio);
    qs('btnFecharRelatorio').addEventListener('click', function () {
      qs('relatorio-overlay').classList.add('hidden');
    });

    qs('campoNome').addEventListener('input', function () {
      atualizarTituloAba(pacienteAtivoId, this.value);
    });

    document.querySelector('main').addEventListener('blur', function (ev) {
      if (ev.target && ev.target.matches('input')) salvarEstadoAtual();
    }, true);
    document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function (el) {
      el.addEventListener('change', salvarEstadoAtual);
    });

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
    carregarTodosPacientes().then(function () {
      preencherFormulario(estados[pacienteAtivoId]);
      registrarServiceWorker();
    });
  });
}());
