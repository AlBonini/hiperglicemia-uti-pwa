# Insulina EV Hiperglicemia - UTI (PWA)

Calculadora de infusao continua de insulina regular EV (1 UI/mL) para controle da
hiperglicemia no paciente critico, baseada no protocolo POP-UTI-END-001 (v1.0,
Santa Casa de Misericordia de Tatui, SCCM 2024 / Surviving Sepsis Campaign / AMIB).

NAO se aplica a Cetoacidose Diabetica (CAD) ou Estado Hiperglicemico Hiperosmolar
(EHH) - estes seguem protocolo proprio.

Inclui tambem um quadro de leito para **passagem de plantao em UTI de 10 leitos**
(`passagem.html`), baseado no modelo de quadro de leito (identificacao, ADM
hospitalar/UTI, atendimento, prontuario, clinico responsavel, investimento
terapeutico, motivo da internacao, antecedentes, antibioticos em uso, dispositivos,
cirurgia, exames/culturas pendentes e pendencias), com um leito por aba e um censo
imprimivel dos 10 leitos.

PWA 100% client-side (sem backend): toda a logica roda no navegador e os dados
de cada paciente/leito ficam salvos localmente no aparelho (IndexedDB), nunca saem
do dispositivo. Instalavel na tela inicial do Android/iOS pelo navegador.

Ferramenta de apoio a decisao clinica e a organizacao da passagem de plantao. A
responsabilidade da prescricao e das informacoes clinicas e da equipe assistencial.

## Arquivos

- `protocolo.js` - logica clinica pura (Tabelas 1/2/3, bolus, pausa/retomada)
- `db.js` - persistencia local (IndexedDB) - pacientes (insulina), historico e leitos (passagem de plantao)
- `app.js` - interface da calculadora de insulina (DOM)
- `index.html` / `style.css` - UI
- `passagem.html` / `passagem.js` - quadro de leito / passagem de plantao (UTI 10 leitos)
- `sw.js` / `manifest.json` / `icons/` - PWA (offline + instalavel)
- `test_protocolo.js` - suite de testes (`node test_protocolo.js`)
