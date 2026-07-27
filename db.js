/*
 * Persistencia local (IndexedDB) - equivalente ao SQLite (estado dos 5 pacientes)
 * + ao log CSV (historico) do app desktop. Tudo fica salvo no navegador, vinculado
 * a este app, e sobrevive a fechar/reabrir (ver Db.estadoPadrao para o shape).
 */
(function (global) {
  'use strict';

  var DB_NOME = 'hiperglicemia_uti_db';
  var DB_VERSAO = 2;
  var dbPromise = null;

  function abrirDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains('pacientes')) {
          db.createObjectStore('pacientes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('historico')) {
          var store = db.createObjectStore('historico', { keyPath: 'logId', autoIncrement: true });
          store.createIndex('porPaciente', 'idPaciente');
        }
        if (!db.objectStoreNames.contains('leitos')) {
          db.createObjectStore('leitos', { keyPath: 'leito' });
        }
      };
      req.onsuccess = function (ev) { resolve(ev.target.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function estadoPadrao(id) {
    return {
      id: id,
      nome: '', idade: '', hba1c: '', glicGatilho: '',
      bgConfirmado: false, naoCadEhh: false,
      totalInfundido: '', kAtual: '', sintomatico: false,
      glicPrev: '', glicNow: '', horasIntervalo: '', freqMonitor: '1',
      taxaAtual: null,
      taxaReferencia: 0,
      retomada: null,
      resAcao: '---', resAcaoCor: '#5E35B1', resDelta: '---', resVazao: '---',
      ultimoTs: null,
      alertaAtraso: false,
    };
  }

  function salvarPaciente(estado) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pacientes', 'readwrite');
        tx.objectStore('pacientes').put(estado);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function carregarPaciente(id) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pacientes', 'readonly');
        var req = tx.objectStore('pacientes').get(id);
        req.onsuccess = function () { resolve(req.result || estadoPadrao(id)); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function apagarPaciente(id) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['pacientes', 'historico'], 'readwrite');
        tx.objectStore('pacientes').delete(id);
        var idx = tx.objectStore('historico').index('porPaciente');
        var cursorReq = idx.openCursor(IDBKeyRange.only(id));
        cursorReq.onsuccess = function (ev) {
          var cursor = ev.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function adicionarHistorico(entrada) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('historico', 'readwrite');
        tx.objectStore('historico').add(entrada);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function listarHistorico(idPaciente) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('historico', 'readonly');
        var idx = tx.objectStore('historico').index('porPaciente');
        var req = idx.getAll(IDBKeyRange.only(idPaciente));
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function estadoPadraoLeito(leito) {
    return {
      leito: leito,
      nome: '', idade: '',
      admHosp: '', admUti: '', diasUti: '',
      atendimento: '', prontuario: '', clinico: '', investimento: '',
      motivo: '', antecedentes: '',
      antibioticos: [],
      dispositivos: '', cirurgia: '', examesPendentes: '', culturasPendentes: '', pendencias: '',
    };
  }

  function salvarLeito(estado) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leitos', 'readwrite');
        tx.objectStore('leitos').put(estado);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function carregarLeito(leito) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leitos', 'readonly');
        var req = tx.objectStore('leitos').get(leito);
        req.onsuccess = function () { resolve(req.result || estadoPadraoLeito(leito)); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function apagarLeito(leito) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leitos', 'readwrite');
        tx.objectStore('leitos').delete(leito);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function listarTodosLeitos() {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leitos', 'readonly');
        var req = tx.objectStore('leitos').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function exportarTudo() {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['pacientes', 'historico', 'leitos'], 'readonly');
        var saida = { pacientes: [], historico: [], leitos: [], exportadoEm: new Date().toISOString() };
        tx.objectStore('pacientes').getAll().onsuccess = function (ev) { saida.pacientes = ev.target.result; };
        tx.objectStore('historico').getAll().onsuccess = function (ev) { saida.historico = ev.target.result; };
        tx.objectStore('leitos').getAll().onsuccess = function (ev) { saida.leitos = ev.target.result; };
        tx.oncomplete = function () { resolve(saida); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function importarTudo(dados) {
    return abrirDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['pacientes', 'historico', 'leitos'], 'readwrite');
        (dados.pacientes || []).forEach(function (p) { tx.objectStore('pacientes').put(p); });
        (dados.historico || []).forEach(function (h) {
          var copia = Object.assign({}, h);
          delete copia.logId;
          tx.objectStore('historico').add(copia);
        });
        (dados.leitos || []).forEach(function (l) { tx.objectStore('leitos').put(l); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  global.Db = {
    estadoPadrao: estadoPadrao,
    salvarPaciente: salvarPaciente,
    carregarPaciente: carregarPaciente,
    apagarPaciente: apagarPaciente,
    adicionarHistorico: adicionarHistorico,
    listarHistorico: listarHistorico,
    estadoPadraoLeito: estadoPadraoLeito,
    salvarLeito: salvarLeito,
    carregarLeito: carregarLeito,
    apagarLeito: apagarLeito,
    listarTodosLeitos: listarTodosLeitos,
    exportarTudo: exportarTudo,
    importarTudo: importarTudo,
  };
}(typeof self !== 'undefined' ? self : this));
