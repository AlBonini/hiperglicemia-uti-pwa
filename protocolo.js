/*
 * Logica clinica do Protocolo de Controle da Hiperglicemia no Paciente Critico
 * (Infusao Continua de Insulina Regular EV, 1 UI/mL) - UTI Santa Casa de Tatui.
 * Porte fiel de protocolo_hiperglicemia.py (app desktop) para uso em uma PWA.
 * NAO se aplica a Cetoacidose Diabetica (CAD) ou Estado Hiperglicemico Hiperosmolar.
 *
 * Modulo puro: nenhuma funcao aqui toca o DOM ou armazenamento - recebe um objeto
 * de estado do paciente e devolve um objeto de resultado. Isso permite testar toda
 * a logica em Node, sem navegador, e reusar exatamente as mesmas funcoes na UI.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Protocolo = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOLUS_MAXIMO = 10.0;
  var RETOMADA_BG_MIN = 150;
  var SUSPENSAO_MINUTOS = 30;
  var ALERTA_TAXA_ALTA = 20;
  var K_BAIXO = 3.5;
  var HBA1C_ALTA = 8.0;
  var REL_HIPO_MIN = 70;
  var REL_HIPO_MAX = 110;

  var COR_PRIMARIA = '#5E35B1';
  var COR_ALERTA = '#ff8c00';
  var COR_PERIGO = 'red';

  var ROTULOS_COLUNA = {
    C1: 'BG 100-139',
    C2: 'BG 140-179 (ALVO)',
    C3: 'BG 180-249',
    C4: 'BG >=250',
  };

  function arred05(valor) {
    return Math.floor(valor * 2 + 0.5) / 2.0;
  }

  function arredBaixo05(valor) {
    return Math.floor(valor * 2) / 2.0;
  }

  function round2(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function fmt(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return '---';
    x = round2(Number(x));
    if (Math.abs(x - Math.trunc(x)) < 1e-9) return String(Math.trunc(x));
    var txt = x.toFixed(2);
    if (txt.endsWith('0')) txt = txt.slice(0, -1);
    return txt;
  }

  function numOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    var s = String(v).replace(',', '.').trim();
    if (s === '') return null;
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  // --- TABELA 2: Delta conforme a taxa de infusao vigente ---
  function obterDelta(taxa) {
    if (taxa < 3) return 0.5;
    if (taxa <= 6) return 1.0;
    if (taxa <= 9.5) return 1.5;
    if (taxa <= 14.5) return 2.0;
    if (taxa <= 19.5) return 3.0;
    return 4.0;
  }

  // --- TABELA 1: Grade de titulacao horaria (alvo 140-180 mg/dL) ---
  function classificarColunaBG(bg) {
    if (bg >= 100 && bg <= 139) return 'C1';
    if (bg >= 140 && bg <= 179) return 'C2';
    if (bg >= 180 && bg <= 249) return 'C3';
    if (bg >= 250) return 'C4';
    return null;
  }

  function avaliarTabela1(coluna, varH) {
    if (coluna === 'C1') {
      if (varH > 0) return ['MANTER', 0];
      if (varH >= -25) return ['REDUZIR', 1];
      return ['SUSPENDER_ESPECIAL', 2];
    }
    if (coluna === 'C2') {
      if (varH > 25) return ['AUMENTAR', 1];
      if (varH >= 0) return ['MANTER', 0];
      if (varH >= -25) return ['REDUZIR', 1];
      return ['SUSPENDER', 2];
    }
    if (coluna === 'C3') {
      if (varH > 50) return ['AUMENTAR', 2];
      if (varH >= 0) return ['AUMENTAR', 1];
      if (varH >= -25) return ['MANTER', 0];
      if (varH >= -50) return ['REDUZIR', 1];
      return ['SUSPENDER', 2];
    }
    if (coluna === 'C4') {
      if (varH > 0) return ['AUMENTAR', 2];
      if (varH >= -25) return ['AUMENTAR', 1];
      if (varH >= -50) return ['MANTER', 0];
      if (varH >= -75) return ['REDUZIR', 1];
      return ['SUSPENDER', 2];
    }
    throw new Error('Coluna invalida: ' + coluna);
  }

  /**
   * Calcula a conduta (mesma logica de calcular() no app desktop).
   * p: { taxaAtual: null|'SUSPENSO'|number, bgConfirmado, naoCadEhh, glicPrev, glicNow,
   *      horasIntervalo, freqMonitor, hba1c, kAtual, sintomatico, taxaReferencia, ultimoTs }
   * agora: Date (opcional, default = new Date())
   */
  function calcularConduta(p, agora) {
    agora = agora || new Date();

    var freqH = parseFloat(p.freqMonitor);
    if (!Number.isFinite(freqH)) freqH = 1.0;
    var limiteMin = freqH * 60 + 10;

    var alertaTempo = false;
    if (p.ultimoTs) {
      var ultimoDt = new Date(p.ultimoTs);
      if (!Number.isNaN(ultimoDt.getTime())) {
        var diffMin = (agora - ultimoDt) / 60000;
        if (diffMin > limiteMin) alertaTempo = true;
      }
    }

    var glicPrev = numOrNull(p.glicPrev);
    var glicNow = numOrNull(p.glicNow);
    var taxaAtualNum = p.taxaAtual === 'SUSPENSO' ? 0.0 : numOrNull(p.taxaAtual);

    if (glicNow === null) {
      return { erro: 'Informe a Glicemia Atual.' };
    }

    function finalizar(texto, novaTaxa, cor, deltaInfo, suspender) {
      if (alertaTempo) {
        texto = 'ATRASO na monitorizacao! | ' + texto;
        cor = COR_PERIGO;
      }
      return {
        alertaTempo: alertaTempo,
        texto: texto,
        cor: cor,
        deltaInfo: deltaInfo || '---',
        suspender: !!suspender,
        novaTaxa: suspender ? 0.0 : round2(novaTaxa),
        glicNowAplicado: glicNow,
        agoraISO: agora.toISOString(),
      };
    }

    // === INICIO DO PROTOCOLO (sem taxa vigente) ===
    if (p.taxaAtual === null) {
      if (!p.bgConfirmado || !p.naoCadEhh) {
        return {
          erro: 'Antes de iniciar, confirme:\n1) Glicemia > 180 mg/dL em DUAS medidas; e\n' +
                '2) Paciente NAO esta em CAD/EHH (estes seguem protocolo proprio).',
        };
      }
      var taxaInicial = arred05(glicNow / 100.0);
      var bolus = Math.min(taxaInicial, BOLUS_MAXIMO);
      var textoIni = 'INICIAR infusao. Bolus EV de ' + fmt(bolus) + ' UI (max ' + fmt(BOLUS_MAXIMO) +
        ' UI) + iniciar bomba a ' + fmt(taxaInicial) + ' UI/h.';
      return finalizar(textoIni, taxaInicial, COR_PRIMARIA,
        'Calculo: ' + fmt(glicNow) + ' / 100 = ' + fmt(glicNow / 100.0) + ' -> arred. 0,5 -> ' + fmt(taxaInicial) + ' UI/h',
        false);
    }

    // === TABELA 3: HIPOGLICEMIA (glicemia < 100) ===
    if (glicNow < 100) {
      var tierPct, glicoseTxt, comunicar;
      if (glicNow < 50) {
        tierPct = 0.30; glicoseTxt = '25 g de glicose (50 mL de SG 50%) EV em bolus'; comunicar = true;
      } else if (glicNow < 75) {
        tierPct = 0.40; glicoseTxt = '12,5 g de glicose (25 mL de SG 50%) EV'; comunicar = true;
      } else {
        tierPct = 0.50; comunicar = false;
        if (p.sintomatico) {
          glicoseTxt = '12,5 g de glicose (25 mL de SG 50%) EV (paciente sintomatico)';
          comunicar = true;
        } else {
          glicoseTxt = null;
        }
      }

      var gravidade = '';
      if (glicNow < 40) gravidade = 'HIPOGLICEMIA GRAVE! ';
      else if (glicNow < 54) gravidade = 'Hipoglicemia clinicamente significativa (nivel 2). ';

      var partes = [gravidade + 'SUSPENDER a infusao.'];
      if (glicoseTxt) partes.push('Administrar ' + glicoseTxt + '.');
      partes.push('Reavaliar glicemia a cada 15 min até >=100 mg/dL. Quando >=' + fmt(RETOMADA_BG_MIN) +
        ' mg/dL, retomar a ' + Math.round(tierPct * 100) + '% da taxa anterior (arredondada p/ baixo).');
      if (comunicar) partes.push('Comunicar o medico.');
      var textoHipo = partes.join(' ');

      var taxaReferenciaHipo = (taxaAtualNum && taxaAtualNum > 0) ? taxaAtualNum : (p.taxaReferencia || 0);
      var rHipo = finalizar(textoHipo, 0.0, COR_PERIGO,
        'Tabela 3 (hipoglicemia) | retomar a ' + Math.round(tierPct * 100) + '% de ' + fmt(taxaReferenciaHipo) + ' UI/h',
        true);
      rHipo.retomada = { tipo: 'PCT', pct: tierPct, gate: RETOMADA_BG_MIN, referencia: round2(taxaReferenciaHipo) };
      return rHipo;
    }

    // === TABELAS 1 e 2: TITULACAO HORARIA (glicemia >= 100) ===
    if (glicPrev === null) {
      return { erro: 'Informe a Glicemia Anterior para calcular a variacao horaria.' };
    }

    var horas = numOrNull(p.horasIntervalo);
    if (horas === null || horas <= 0) {
      // Em branco -> usa a frequencia de monitorizacao selecionada (1h/2h/4h), NUNCA
      // o tempo real decorrido entre cliques (ambiguo: digitacao lenta infla o
      // intervalo: uso rapido/teste deflaciona, distorcendo a variacao mg/dL/h).
      horas = freqH;
    }

    var varH = (glicNow - glicPrev) / horas;
    var coluna = classificarColunaBG(glicNow);
    var par = avaliarTabela1(coluna, varH);
    var acaoTab = par[0];
    var nDelta = par[1];
    var delta = obterDelta(taxaAtualNum);

    var alertas = [];
    var cor = COR_PRIMARIA;

    var hba1cVal = numOrNull(p.hba1c);
    if (hba1cVal !== null && hba1cVal >= HBA1C_ALTA && glicNow >= REL_HIPO_MIN && glicNow <= REL_HIPO_MAX) {
      alertas.push('Hipoglicemia relativa (HbA1c ' + fmt(hba1cVal) + '%): evite progredir abaixo de ' +
        fmt(REL_HIPO_MAX) + ' mg/dL; priorize estabilidade');
      cor = COR_ALERTA;
    }

    var kVal = numOrNull(p.kAtual);
    if (kVal !== null && kVal < K_BAIXO) {
      alertas.push('K+ ' + fmt(kVal) + ' mEq/L < 3,5: reavaliar potassio com mais frequencia');
      cor = COR_ALERTA;
    }

    var novaTaxa, textoAcao, suspender = false, retomada = null;

    if (acaoTab === 'AUMENTAR') {
      novaTaxa = taxaAtualNum + nDelta * delta;
      textoAcao = 'AUMENTAR a velocidade em ' + nDelta + 'xDelta (' + fmt(nDelta * delta) + ' UI/h)';
    } else if (acaoTab === 'MANTER') {
      novaTaxa = taxaAtualNum;
      textoAcao = 'MANTER a velocidade (sem alteracao)';
    } else if (acaoTab === 'REDUZIR') {
      novaTaxa = Math.max(0.0, taxaAtualNum - nDelta * delta);
      textoAcao = 'REDUZIR a velocidade em ' + nDelta + 'xDelta (' + fmt(nDelta * delta) + ' UI/h)';
    } else if (acaoTab === 'SUSPENDER') {
      var taxaResumo = Math.max(0.0, taxaAtualNum - nDelta * delta);
      retomada = { tipo: 'TEMPO', taxaFixa: round2(taxaResumo), minutos: SUSPENSAO_MINUTOS, ts: agora.toISOString() };
      novaTaxa = 0.0;
      textoAcao = 'SUSPENDER a infusao por ' + SUSPENSAO_MINUTOS + ' min; depois retomar reduzindo ' +
        nDelta + 'xDelta (nova taxa ' + fmt(taxaResumo) + ' UI/h)';
      cor = COR_PERIGO;
      suspender = true;
    } else { // SUSPENDER_ESPECIAL (C1, queda > 25 mg/dL/h) - nota* da Tabela 1
      retomada = { tipo: 'PCT', pct: 0.5, gate: RETOMADA_BG_MIN, referencia: round2(taxaAtualNum) };
      novaTaxa = 0.0;
      textoAcao = 'SUSPENDER a infusao (queda acentuada na faixa 100-139). Checar glicemia em 15 min ' +
        '(garantir >100 mg/dL). Quando >=' + fmt(RETOMADA_BG_MIN) + ' mg/dL, retomar a 50% da taxa ' +
        'anterior (arredondada p/ baixo).';
      cor = COR_PERIGO;
      suspender = true;
    }

    if (!suspender && novaTaxa !== taxaAtualNum) {
      alertas.push('Retornar a monitorizacao horaria (alteracao de taxa)');
    }
    if (Math.max(taxaAtualNum, novaTaxa) >= ALERTA_TAXA_ALTA) {
      alertas.push('Taxa >= ' + fmt(ALERTA_TAXA_ALTA) + ' UI/h e incomum: notificar medico p/ investigar');
      if (cor === COR_PRIMARIA) cor = COR_ALERTA;
    }

    var textoFinal = textoAcao;
    if (alertas.length) textoFinal += ' | ' + alertas.join(' | ');

    var deltaInfo = 'Delta=' + fmt(delta) + ' UI/h | variacao=' + fmt(varH) + ' mg/dL/h (' + fmt(horas) +
      'h) | ' + ROTULOS_COLUNA[coluna];

    var r = finalizar(textoFinal, novaTaxa, cor, deltaInfo, suspender);
    if (retomada) r.retomada = retomada;
    return r;
  }

  /** Mirrors retomar_infusao(): decide se libera a retomada e a nova taxa. */
  function retomarInfusao(p, agora) {
    agora = agora || new Date();
    var retomada = p.retomada;

    if (!retomada || !retomada.tipo) {
      return { info: 'Nao ha suspensao pendente para retomar.' };
    }

    if (retomada.tipo === 'TEMPO') {
      var minutosPassados = 0;
      if (retomada.ts) {
        var dt = new Date(retomada.ts);
        if (!Number.isNaN(dt.getTime())) minutosPassados = (agora - dt) / 60000;
      }
      var limite = retomada.minutos || SUSPENSAO_MINUTOS;
      if (minutosPassados < limite) {
        return { aguardar: true, faltamMin: Math.round(limite - minutosPassados), limite: Math.round(limite) };
      }
      var novaTaxaTempo = retomada.taxaFixa;
      return {
        ok: true,
        novaTaxa: novaTaxaTempo,
        msg: 'RETOMADA (pos ' + Math.round(limite) + ' min de suspensao): infusao reiniciada a ' + fmt(novaTaxaTempo) + ' UI/h',
      };
    }

    if (retomada.tipo === 'PCT') {
      var glicNow = numOrNull(p.glicNow);
      if (glicNow === null) {
        return { erro: 'Informe a Glicemia Atual para liberar a retomada.' };
      }
      var gate = retomada.gate || RETOMADA_BG_MIN;
      if (glicNow < gate) {
        return { bloqueadoGlicemia: true, glicNow: glicNow, gate: gate };
      }
      var ref = retomada.referencia;
      if (!ref || ref <= 0) {
        return { erro: 'Nao ha taxa de referencia memorizada para retomar. Calcule novamente.' };
      }
      var pct = retomada.pct;
      var novaTaxaPct = arredBaixo05(ref * pct);
      return {
        ok: true,
        novaTaxa: novaTaxaPct,
        msg: 'RETOMADA: ' + Math.round(pct * 100) + '% da taxa anterior (' + fmt(ref) + ' UI/h) = ' + fmt(novaTaxaPct) + ' UI/h',
        glicPrevAplicado: glicNow,
      };
    }

    return { erro: 'Tipo de retomada desconhecido.' };
  }

  /** Mirrors pausar_infusao(): suspensao manual, sempre com retomada por 50%/BG>=150. */
  function pausarInfusao(p) {
    var taxaAtualNum = p.taxaAtual === 'SUSPENSO' ? 0 : numOrNull(p.taxaAtual);
    var retomada = null;
    if (taxaAtualNum && taxaAtualNum > 0) {
      retomada = { tipo: 'PCT', pct: 0.5, gate: RETOMADA_BG_MIN, referencia: round2(taxaAtualNum) };
    }
    return {
      retomada: retomada,
      texto: 'INFUSAO SUSPENSA MANUALMENTE PELO PROFISSIONAL.',
      cor: COR_PERIGO,
    };
  }

  /** Mirrors nutricao_suspensa(): reducao imediata de 50%, sem suspender a bomba. */
  function nutricaoSuspensa(p) {
    var taxaAtualNum = p.taxaAtual === 'SUSPENSO' ? null : numOrNull(p.taxaAtual);
    if (taxaAtualNum === null || taxaAtualNum === undefined || taxaAtualNum <= 0) {
      return { info: 'Nao ha taxa de infusao ativa para reduzir.' };
    }
    var novaTaxa = round2(taxaAtualNum * 0.5);
    return {
      novaTaxa: novaTaxa,
      texto: 'NUTRICAO INTERROMPIDA ABRUPTAMENTE: insulina reduzida em 50% imediatamente. ' +
        'Reforcar monitorizacao (risco de hipoglicemia).',
      cor: COR_ALERTA,
      deltaInfo: 'Reducao de seguranca: -50% (item 17 do protocolo)',
    };
  }

  return {
    BOLUS_MAXIMO: BOLUS_MAXIMO,
    RETOMADA_BG_MIN: RETOMADA_BG_MIN,
    SUSPENSAO_MINUTOS: SUSPENSAO_MINUTOS,
    ALERTA_TAXA_ALTA: ALERTA_TAXA_ALTA,
    K_BAIXO: K_BAIXO,
    HBA1C_ALTA: HBA1C_ALTA,
    REL_HIPO_MIN: REL_HIPO_MIN,
    REL_HIPO_MAX: REL_HIPO_MAX,
    COR_PRIMARIA: COR_PRIMARIA,
    COR_ALERTA: COR_ALERTA,
    COR_PERIGO: COR_PERIGO,
    ROTULOS_COLUNA: ROTULOS_COLUNA,
    arred05: arred05,
    arredBaixo05: arredBaixo05,
    fmt: fmt,
    numOrNull: numOrNull,
    obterDelta: obterDelta,
    classificarColunaBG: classificarColunaBG,
    avaliarTabela1: avaliarTabela1,
    calcularConduta: calcularConduta,
    retomarInfusao: retomarInfusao,
    pausarInfusao: pausarInfusao,
    nutricaoSuspensa: nutricaoSuspensa,
  };
}));
