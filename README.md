# Insulina EV Hiperglicemia - UTI (PWA)

Calculadora de infusao continua de insulina regular EV (1 UI/mL) para controle da
hiperglicemia no paciente critico, baseada no protocolo POP-UTI-END-001 (v1.0,
Santa Casa de Misericordia de Tatui, SCCM 2024 / Surviving Sepsis Campaign / AMIB).

NAO se aplica a Cetoacidose Diabetica (CAD) ou Estado Hiperglicemico Hiperosmolar
(EHH) - estes seguem protocolo proprio.

PWA 100% client-side (sem backend): toda a logica roda no navegador e os dados
de cada paciente ficam salvos localmente no aparelho (IndexedDB), nunca saem do
dispositivo. Instalavel na tela inicial do Android/iOS pelo navegador.

Ferramenta de apoio a decisao clinica. A responsabilidade da prescricao e do
medico assistente.

## Arquivos

- `protocolo.js` - logica clinica pura (Tabelas 1/2/3, bolus, pausa/retomada)
- `db.js` - persistencia local (IndexedDB)
- `app.js` - interface (DOM)
- `index.html` / `style.css` - UI
- `sw.js` / `manifest.json` / `icons/` - PWA (offline + instalavel)
- `test_protocolo.js` - suite de testes (`node test_protocolo.js`)
