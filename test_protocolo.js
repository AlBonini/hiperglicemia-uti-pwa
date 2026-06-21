/*
 * Testes do modulo protocolo.js (logica pura, sem DOM). Espelha os mesmos casos de
 * test_protocolo_hiperglicemia.py para garantir paridade exata entre a versao
 * desktop (Python/Tkinter) e a PWA (JS) do protocolo de hiperglicemia.
 * Uso: node test_protocolo.js
 */
const P = require('./protocolo.js');

let total = 0;
let falhas = 0;

function checar(num, descricao, resultado, esperado) {
  total += 1;
  const detalhes = [];
  for (const chave in esperado) {
    const esp = esperado[chave];
    const obt = resultado ? resultado[chave] : undefined;
    let ok;
    if (esp && esp.contem !== undefined) {
      ok = typeof obt === 'string' && obt.includes(esp.contem);
      if (!ok) detalhes.push(`${chave}: esperava conter "${esp.contem}", obtido=${JSON.stringify(obt)}`);
    } else if (esp && esp.naoContem !== undefined) {
      ok = typeof obt === 'string' && !obt.includes(esp.naoContem);
      if (!ok) detalhes.push(`${chave}: NAO deveria conter "${esp.naoContem}", obtido=${JSON.stringify(obt)}`);
    } else if (typeof esp === 'number') {
      ok = typeof obt === 'number' && Math.abs(obt - esp) < 0.005;
      if (!ok) detalhes.push(`${chave}: esperado=${esp} obtido=${JSON.stringify(obt)}`);
    } else {
      ok = obt === esp;
      if (!ok) detalhes.push(`${chave}: esperado=${JSON.stringify(esp)} obtido=${JSON.stringify(obt)}`);
    }
    if (!ok) {
      falhas += 1;
      console.log(`[FAIL] Caso ${num}: ${descricao}`);
      detalhes.forEach((d) => console.log('        -> ' + d));
      console.log('        resultado completo:', JSON.stringify(resultado));
      return;
    }
  }
  console.log(`[PASS] Caso ${num}: ${descricao}`);
}

function checarHelper(num, descricao, obtido, esperado) {
  total += 1;
  const ok = Math.abs(obtido - esperado) < 0.0001;
  if (!ok) {
    falhas += 1;
    console.log(`[FAIL] Caso ${num}: ${descricao} -> obtido=${obtido} esperado=${esperado}`);
  } else {
    console.log(`[PASS] Caso ${num}: ${descricao} -> obtido=${obtido}`);
  }
}

function pacienteBase(overrides) {
  return Object.assign({
    taxaAtual: null,
    bgConfirmado: false,
    naoCadEhh: false,
    glicPrev: null,
    glicNow: null,
    horasIntervalo: '',
    freqMonitor: '1',
    hba1c: '',
    kAtual: '',
    sintomatico: false,
    taxaReferencia: 0,
    ultimoTs: null,
    retomada: null,
  }, overrides || {});
}

// --- Helpers numericos ---
checarHelper('H1', 'arred05(3.74) -> 3.5', P.arred05(3.74), 3.5);
checarHelper('H2', 'arredBaixo05(2.25) -> 2.0', P.arredBaixo05(2.25), 2.0);
checarHelper('H3', 'obterDelta(2.9) -> 0.5', P.obterDelta(2.9), 0.5);
checarHelper('H4', 'obterDelta(6) -> 1.0', P.obterDelta(6), 1.0);
checarHelper('H5', 'obterDelta(9.5) -> 1.5', P.obterDelta(9.5), 1.5);
checarHelper('H6', 'obterDelta(14.5) -> 2.0', P.obterDelta(14.5), 2.0);
checarHelper('H7', 'obterDelta(19.5) -> 3.0', P.obterDelta(19.5), 3.0);
checarHelper('H8', 'obterDelta(20) -> 4.0', P.obterDelta(20), 4.0);

// Caso 1: bloqueio de inicio sem confirmar gatilho/exclusao CAD-EHH
checar(1, 'Bloqueio: nao confirmou BG>180x2 nem exclusao de CAD/EHH',
  P.calcularConduta(pacienteBase({ glicNow: 374 })),
  { erro: { contem: 'confirme' } });

// Caso 2: bolus e taxa inicial (374 -> 3.5 UI bolus / 3.5 UI/h)
checar(2, 'Inicio: bolus = taxa inicial = glicemia/100 arred. 0,5',
  P.calcularConduta(pacienteBase({ glicNow: 374, bgConfirmado: true, naoCadEhh: true })),
  { texto: { contem: 'Bolus EV de 3.5 UI' }, novaTaxa: 3.5 });

// --- Coluna C1 (100-139) ---
checar(3, 'C1 subindo -> MANTER',
  P.calcularConduta(pacienteBase({ taxaAtual: 4, glicPrev: 110, glicNow: 130, horasIntervalo: '1' })),
  { texto: 'MANTER a velocidade (sem alteracao)', novaTaxa: 4 });

checar(4, 'C1 estavel -> REDUZIR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 4, glicPrev: 130, glicNow: 130, horasIntervalo: '1' })),
  { texto: { contem: 'REDUZIR a velocidade em 1xDelta (1 UI/h)' }, novaTaxa: 3 });

(function () {
  const r5 = P.calcularConduta(pacienteBase({ taxaAtual: 4.5, glicPrev: 160, glicNow: 130, horasIntervalo: '1' }));
  checar(5, 'C1 queda>25 -> SUSPENDER regra especial (retomar 50% com BG>=150)',
    r5, { texto: { contem: 'queda acentuada na faixa 100-139' }, suspender: true });
  total += 1;
  const ok5b = r5.retomada && r5.retomada.tipo === 'PCT' && Math.abs(r5.retomada.pct - 0.5) < 0.001 &&
    Math.abs(r5.retomada.referencia - 4.5) < 0.001;
  if (!ok5b) { falhas += 1; console.log('[FAIL] Caso 5b: retomada PCT 0,5 / referencia 4,5'); }
  else console.log('[PASS] Caso 5b: retomada PCT 0,5 / referencia 4,5');

  const bloqueado = P.retomarInfusao(pacienteBase({ glicNow: 120, retomada: r5.retomada }));
  total += 1;
  if (!bloqueado.bloqueadoGlicemia) { falhas += 1; console.log('[FAIL] Caso 5c: deveria bloquear com BG=120'); }
  else console.log('[PASS] Caso 5c: retomada bloqueada com BG=120 (<150)');

  const liberado = P.retomarInfusao(pacienteBase({ glicNow: 160, retomada: r5.retomada }));
  checar(5, 'Retomada liberada (BG=160): 50% de 4,5 arred. p/ baixo = 2,0', liberado,
    { ok: true, novaTaxa: 2.0, msg: { contem: 'RETOMADA' } });
}());

// --- Coluna C2 (140-179, ALVO) ---
checar(6, 'C2 subindo >25/h -> AUMENTAR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicPrev: 140, glicNow: 170, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 1xDelta (1 UI/h)' }, novaTaxa: 6 });

checar(7, 'C2 subindo 10/h -> MANTER',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicPrev: 150, glicNow: 160, horasIntervalo: '1' })),
  { texto: 'MANTER a velocidade (sem alteracao)', novaTaxa: 5 });

checar(8, 'C2 caindo 20/h -> REDUZIR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicPrev: 170, glicNow: 150, horasIntervalo: '1' })),
  { texto: { contem: 'REDUZIR a velocidade em 1xDelta (1 UI/h)' }, novaTaxa: 4 });

(function () {
  const r9 = P.calcularConduta(pacienteBase({ taxaAtual: 5, glicPrev: 200, glicNow: 150, horasIntervalo: '1' }));
  checar(9, 'C2 caindo 50/h -> SUSPENDER 30min, retomar com -2xDelta',
    r9, { texto: { contem: 'nova taxa 3 UI/h' }, suspender: true });
  total += 1;
  if (!(r9.retomada && r9.retomada.tipo === 'TEMPO' && Math.abs(r9.retomada.taxaFixa - 3.0) < 0.001)) {
    falhas += 1; console.log('[FAIL] Caso 9b: retomada TEMPO com taxaFixa=3');
  } else console.log('[PASS] Caso 9b: retomada TEMPO com taxaFixa=3');

  const cedo = P.retomarInfusao(pacienteBase({ retomada: r9.retomada }), new Date(r9.agoraISO));
  total += 1;
  if (!cedo.aguardar) { falhas += 1; console.log('[FAIL] Caso 9c: deveria bloquear antes de 30 min'); }
  else console.log('[PASS] Caso 9c: retomada por tempo bloqueada antes de 30 min');

  const depois = new Date(new Date(r9.agoraISO).getTime() + 31 * 60000);
  const tarde = P.retomarInfusao(pacienteBase({ retomada: r9.retomada }), depois);
  checar(9, 'Retomada por tempo liberada apos 30 min -> taxa fixa 3 UI/h', tarde,
    { ok: true, novaTaxa: 3.0 });
}());

// --- Coluna C3 (180-249) ---
checar(10, 'C3 subindo 70/h -> AUMENTAR 2xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 7, glicPrev: 150, glicNow: 220, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 2xDelta (3 UI/h)' }, novaTaxa: 10 });

checar(11, 'C3 estavel -> AUMENTAR 1xDelta (nao e MANTER)',
  P.calcularConduta(pacienteBase({ taxaAtual: 7, glicPrev: 220, glicNow: 220, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 1xDelta (1.5 UI/h)' }, novaTaxa: 8.5 });

checar(12, 'C3 caindo 15/h -> MANTER',
  P.calcularConduta(pacienteBase({ taxaAtual: 7, glicPrev: 235, glicNow: 220, horasIntervalo: '1' })),
  { texto: 'MANTER a velocidade (sem alteracao)', novaTaxa: 7 });

checar(13, 'C3 caindo 40/h -> REDUZIR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 7, glicPrev: 260, glicNow: 220, horasIntervalo: '1' })),
  { texto: { contem: 'REDUZIR a velocidade em 1xDelta (1.5 UI/h)' }, novaTaxa: 5.5 });

checar(14, 'C3 caindo 60/h -> SUSPENDER 30min, retomar com -2xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 7, glicPrev: 280, glicNow: 220, horasIntervalo: '1' })),
  { texto: { contem: 'nova taxa 4 UI/h' }, suspender: true });

// --- Coluna C4 (>=250) ---
checar(15, 'C4 subindo 5/h -> AUMENTAR 2xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 12, glicPrev: 255, glicNow: 260, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 2xDelta (4 UI/h)' }, novaTaxa: 16 });

checar(16, 'C4 estavel -> AUMENTAR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 12, glicPrev: 260, glicNow: 260, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 1xDelta (2 UI/h)' }, novaTaxa: 14 });

checar(17, 'C4 caindo 40/h -> MANTER',
  P.calcularConduta(pacienteBase({ taxaAtual: 12, glicPrev: 300, glicNow: 260, horasIntervalo: '1' })),
  { texto: 'MANTER a velocidade (sem alteracao)', novaTaxa: 12 });

checar(18, 'C4 caindo 65/h -> REDUZIR 1xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 12, glicPrev: 325, glicNow: 260, horasIntervalo: '1' })),
  { texto: { contem: 'REDUZIR a velocidade em 1xDelta (2 UI/h)' }, novaTaxa: 10 });

checar(19, 'C4 caindo 80/h -> SUSPENDER 30min, retomar com -2xDelta',
  P.calcularConduta(pacienteBase({ taxaAtual: 12, glicPrev: 340, glicNow: 260, horasIntervalo: '1' })),
  { texto: { contem: 'nova taxa 8 UI/h' }, suspender: true });

// --- Tabela 3: hipoglicemia ---
(function () {
  const r20 = P.calcularConduta(pacienteBase({ taxaAtual: 5, glicNow: 30 }));
  checar(20, 'Hipoglicemia <40 (grave) -> 25g glicose, retomar 30%',
    r20, { texto: { contem: 'HIPOGLICEMIA GRAVE!' }, suspender: true });
  total += 1;
  if (!r20.retomada || Math.abs(r20.retomada.pct - 0.3) > 0.001) {
    falhas += 1; console.log('[FAIL] Caso 20b: retomada_pct=0,30');
  } else console.log('[PASS] Caso 20b: retomada_pct=0,30 para faixa <50');
}());

checar(21, 'Hipoglicemia 50-74 -> 12,5g glicose, retomar 40%',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicNow: 60 })),
  { texto: { contem: '12,5 g de glicose (25 mL de SG 50%) EV.' }, suspender: true });

checar(22, 'Hipoglicemia 75-99 assintomatico -> sem glicose hipertonica',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicNow: 85, sintomatico: false })),
  { texto: { naoContem: 'Administrar' } });

checar(23, 'Hipoglicemia 75-99 sintomatico -> COM glicose hipertonica',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, glicNow: 85, sintomatico: true })),
  { texto: { contem: 'paciente sintomatico' } });

(function () {
  const r = P.calcularConduta(pacienteBase({ taxaAtual: 5, glicNow: 30 }));
  const bloqueado = P.retomarInfusao(pacienteBase({ glicNow: 120, retomada: r.retomada }));
  total += 1;
  if (!bloqueado.bloqueadoGlicemia) { falhas += 1; console.log('[FAIL] Caso 24a: deveria bloquear BG=120'); }
  else console.log('[PASS] Caso 24a: retomada bloqueada com BG=120');

  const liberado = P.retomarInfusao(pacienteBase({ glicNow: 160, retomada: r.retomada }));
  checar(24, 'Retomada liberada (BG=160): 30% de 5 = 1,5 UI/h', liberado, { ok: true, novaTaxa: 1.5 });
}());

// --- Pausa manual / retomada manual ---
(function () {
  const rp = P.pausarInfusao(pacienteBase({ taxaAtual: 8 }));
  total += 1;
  if (!(rp.retomada && rp.retomada.tipo === 'PCT' && Math.abs(rp.retomada.pct - 0.5) < 0.001)) {
    falhas += 1; console.log('[FAIL] Caso 25: pausa manual deveria configurar retomada 50%/BG150');
  } else console.log('[PASS] Caso 25: pausa manual configura retomada 50%/BG150');

  const bloqueado = P.retomarInfusao(pacienteBase({ glicNow: 140, retomada: rp.retomada }));
  total += 1;
  if (!bloqueado.bloqueadoGlicemia) { falhas += 1; console.log('[FAIL] Caso 25b: deveria bloquear BG=140'); }
  else console.log('[PASS] Caso 25b: retomada manual bloqueada com BG=140 (<150)');

  const liberado = P.retomarInfusao(pacienteBase({ glicNow: 155, retomada: rp.retomada }));
  checar(26, 'Retomada manual liberada (BG=155): 50% de 8 = 4 UI/h', liberado, { ok: true, novaTaxa: 4.0 });
}());

// --- Nutricao interrompida ---
checar(27, 'Nutricao suspensa -> reducao imediata de 50%',
  P.nutricaoSuspensa(pacienteBase({ taxaAtual: 10 })),
  { texto: { contem: 'reduzida em 50%' }, novaTaxa: 5.0 });

// --- Alertas adicionais ---
checar(28, 'Taxa >=20 UI/h -> alerta para notificar medico',
  P.calcularConduta(pacienteBase({ taxaAtual: 19, glicPrev: 250, glicNow: 300, horasIntervalo: '1' })),
  { texto: { contem: 'Taxa >= 20 UI/h e incomum' }, cor: '#ff8c00', novaTaxa: 25.0 });

checar(29, 'HbA1c 8,5% + glicemia 105 (estavel) -> alerta de hipoglicemia relativa',
  P.calcularConduta(pacienteBase({ taxaAtual: 4, hba1c: '8.5', glicPrev: 105, glicNow: 105, horasIntervalo: '1' })),
  { texto: { contem: 'Hipoglicemia relativa (HbA1c 8.5%)' }, cor: '#ff8c00' });

checar(30, 'K+ 3,0 (<3,5) -> alerta de reavaliacao de potassio',
  P.calcularConduta(pacienteBase({ taxaAtual: 5, kAtual: '3.0', glicPrev: 150, glicNow: 160, horasIntervalo: '1' })),
  { texto: { contem: 'K+ 3 mEq/L < 3,5' }, cor: '#ff8c00' });

// --- Regressao: intervalo vazio usa Freq., nao tempo real entre cliques ---
(function () {
  const inicio = P.calcularConduta(pacienteBase({ glicNow: 280, bgConfirmado: true, naoCadEhh: true }));
  const p2 = pacienteBase({
    taxaAtual: inicio.novaTaxa,
    glicPrev: inicio.glicNowAplicado,
    glicNow: 260,
    horasIntervalo: '',
    freqMonitor: '1',
  });
  checar(31, 'Regressao: intervalo vazio usa Freq. (1h), nao tempo real entre cliques',
    P.calcularConduta(p2), { texto: { contem: 'AUMENTAR a velocidade em 1xDelta' } });
}());

// --- Regressao: taxaAtual chegando como STRING numerica (bug real pego no navegador:
// leitor de campo do app.js devolvia a string do input em vez de parseFloat, causando
// concatenacao "3"+1="31" em vez de soma 3+1=4 dentro de calcularConduta) ---
checar(32, 'Regressao: taxaAtual como string "3" nao deve concatenar (deve somar como numero)',
  P.calcularConduta(pacienteBase({ taxaAtual: '3', glicPrev: 280, glicNow: 260, horasIntervalo: '1' })),
  { texto: { contem: 'AUMENTAR a velocidade em 1xDelta (1 UI/h)' }, novaTaxa: 4 });

console.log(`\n== Resumo: ${total - falhas}/${total} casos OK ==`);
process.exit(falhas ? 1 : 0);
