# Boxing Coach 3D (Etapa 1)

Treinador virtual de boxe em 3D para o Boxing Fit: personagem humanoide completo com rig, 22 animações independentes, controlador JavaScript para combinações dinâmicas e página de demonstração vertical para iPhone.

Pasta independente. Não altera o app principal.

## Conteúdo

| Caminho | O que é |
|---|---|
| `assets/coach.glb` | Personagem + rig + 20 animações (1,06 MB, geometria quantizada + texturas WebP, sem WebAssembly) |
| `config/coach-config.json` | Nomes das animações, rótulos em português, duração, root motion, combinações e apelidos |
| `src/boxing-coach.js` | Controlador `BoxingCoach` (API de golpes, combos, velocidade, pausa) |
| `src/coach-stage.js` | Palco 3D reutilizável (renderer, luzes, ringue, câmera) |
| `integration/boxing-fit-3d.js` | Adaptador pronto para o app Boxing Fit (cronômetro e biblioteca) |
| `integration/boxing-fit.patch` | Patch do `index.html` e `sw.js` do app |
| `config/boxing-fit-map.json` | Mapa treino do app para movimentos do treinador |
| `INTEGRACAO_CODEX.md` | Passo a passo e prompt para o Codex |
| `METODO_DE_TREINO.md` | Como o Boxing Fit 3.0 personaliza o treino |
| `demo-standalone.html` | Demo em arquivo único (abre sem servidor) |
| `index.html` | Demonstração (câmera, zoom, lento, contínuo, golpe atual/próximo) |
| `vendor/` | three.js r165 local (sem CDN) |
| `source-pipeline/` | Scripts Blender/Python que geram o modelo e as animações (reprodutível) |
| `CREDITS.md` | Créditos e licenças |

## Rodar localmente

Precisa de um servidor HTTP (módulos ES não abrem via `file://`):

```bash
cd boxing-coach-3d
python3 -m http.server 8080
# abrir http://localhost:8080
```

No GitHub Pages funciona sem nenhuma configuração: basta publicar a pasta.

## Personagem

- Base anatômica MakeHuman/MPFB2 (CC0), masculino, atlético e musculoso, ~1,77 m.
- Rosto com escultura própria (mandíbula quadrada, nariz de boxeador, sobrancelhas marcadas), barba e cabelo curto escuros. Original, sem reproduzir nenhum ator.
- Luvas vermelhas com punho e faixa, shorts escuros com cós dourado e barra branca, botas de boxe pretas (paleta do visual aprovado).
- Rig humanoide de 23 ossos (pelve, 3 vértebras, pescoço, cabeça, clavículas, braços, mãos, coxas, canelas, pés, dedos dos pés), pesos de deformação do MakeHuman.
- 31.7 mil triângulos, 1 skin, texturas de pele 2048 px em WebP.

## Animações

Base ortodoxa (pé esquerdo à frente). Todos os clipes começam e terminam exatamente na mesma pose de guarda, por isso qualquer sequência encadeia sem saltos.

| Nome | Rótulo | Tipo |
|---|---|---|
| `jab` | Jab | golpe |
| `cross` | Direto | golpe |
| `leftHook` / `rightHook` | Cruzado de esquerda / direita | golpe |
| `leftUppercut` / `rightUppercut` | Uppercut de esquerda / direita | golpe |
| `slipLeft` / `slipRight` | Esquiva | defesa |
| `rollLeft` / `rollRight` | Rolagem por baixo do golpe | defesa |
| `blockHigh` | Bloqueio alto | defesa |
| `guard` | Retorno à guarda | defesa |
| `idle` | Base (ritmo, em loop) | movimentação |
| `stepForward` / `stepBack` | Passos | movimentação (root motion) |
| `stepLeft` / `stepRight` | Deslocamentos laterais | movimentação (root motion) |
| `pivotLeft` / `pivotRight` | Pivô sobre o pé da frente, 50° | movimentação (root motion) |
| `recoverBalance` | Recuperação de equilíbrio | movimentação (root motion) |
| `levelChange` | Troca de nível | extra (no modelo, não usada pelo app) |
| `sprawlLite` | Sprawl leve | extra (no modelo, não usada pelo app) |

Biomecânica: os pés são controlados por IK e ficam plantados (sem deslizar). Direto e cruzado de direita giram o pé de trás sobre a ponta com o calcanhar elevado; cruzado e uppercut de esquerda giram o pé da frente. Quadril e ombros rotacionam, o peso vai para a perna da frente, o ombro sobe para proteger o queixo e a mão livre fica na guarda. A cabeça compensa a rotação do tronco e mantém os olhos no adversário.

## API

```js
import { BoxingCoach } from './src/boxing-coach.js';

const coach = await BoxingCoach.load({
  parent: scene,                         // THREE.Scene ou Group
  configUrl: 'config/coach-config.json', // padrão
  baseUrl: '',                           // prefixo se a pasta estiver em outro caminho
  onProgress: p => {},                   // 0..1
});

// no loop de renderização
coach.update(deltaSegundos);

coach.playMove('jab');                    // Promise, resolve ao terminar
await coach.playCombo(['jab','cross','leftHook','slipRight','cross']);
coach.setSpeed(0.6);   // lento (aprendizagem). 1 = normal. Aceita 0.1 a 2
coach.pause(); coach.resume(); coach.stop();
coach.resetPosition(); // volta ao centro, de frente

coach.on('moveStart', e => {}); // {name,label,index,total,next,duration}
coach.on('moveEnd',   e => {});
coach.on('comboStart', e => {}); coach.on('comboEnd', e => {});

coach.currentMove; coach.nextMove; coach.isPlaying; coach.paused;
coach.duration('cross');           // segundos na velocidade 1
coach.combos;                      // combinações do config
coach.moveNames;
coach.autoRecenter = true;         // após combos com passos, volta ao centro com passos reais
```

Se o servidor não servir arquivos `.glb`, é possível embutir o modelo: gere um módulo `export default "<base64 do GLB>"` e aponte `modelModule` no config (a demo publicada usa isso). No GitHub Pages o `.glb` funciona normalmente.

Nomes em português também são aceitos via `aliases` do config (`direto`, `bloqueio`, `saidaLateral`...).

### Comportamento do sequenciador

- Fila: cada ação aparece na ordem exata, uma de cada vez, sem sobrepor clipes.
- Golpes e defesas emendam com 0,08 s de crossfade (fluidez). Como início e fim são a mesma guarda, não há mistura incorreta de poses.
- Passos e pivôs usam root motion: no fim do clipe o deslocamento é aplicado ao `coach.root` e o próximo clipe começa com corte seco na pose idêntica. Isso evita pés deslizando.
- Sem fila, o treinador volta para `idle` (base com ritmo).
- `playCombo` chamado durante outra combinação interrompe a atual com transição suave.

## Sincronizar com o cronômetro do Boxing Fit

Duração de cada movimento: `config.moves[nome].duration` (velocidade 1). Duração de uma combinação na velocidade `s`:

```js
const dur = names => names.reduce((t, n) => t + coach.duration(n), 0) / coach.getSpeed();
```

Exemplo para um round de 3 min repetindo uma combinação com descanso de ritmo:

```js
async function roundLoop(combo, timer) {        // timer: objeto do app
  while (timer.running && timer.remaining > dur(combo.moves) + 0.5) {
    await coach.playCombo(combo.moves);
    await new Promise(r => setTimeout(r, 900 / coach.getSpeed()));
  }
}
timer.onPause  = () => coach.pause();
timer.onResume = () => coach.resume();
timer.onRest   = () => coach.stop();            // descanso: base em idle
timer.onStop   = () => coach.resetPosition();
// voz/sinal sonoro: use coach.on('moveStart', e => falar(e.label))
```

Regras práticas: pausar o cronômetro deve chamar `coach.pause()`; o mixer só avança em `coach.update(dt)`, então chame-o no mesmo `requestAnimationFrame` do app. Ao trocar de aba, limite o `dt` (o controlador já limita a 0,1 s).

## Integração no Boxing Fit

Ver `INTEGRACAO_CODEX.md`: patch pronto, alterações exatas, sincronização com o cronômetro, testes de aceitação e prompt para o Codex.

## Desempenho e Safari (iPhone)

- Total da pasta ~2 MB; carregamento inicial ~1,8 MB (three.js 664 KB + GLB 1,06 MB + config). Não usa WebAssembly nem fetch de blob, então funciona também em páginas com política de segurança restrita.
- 31,7 mil triângulos, 1 malha com skin (23 ossos), 1 luz com sombra 1024 px, pixel ratio limitado a 2.
- Cabelo e barba usam recorte por alpha (sem transparência ordenada).
- Falha de carregamento mostra mensagem e botão “Tentar novamente”.

Limitações conhecidas do Safari:
- Import maps exigem iOS 16.4+. Para iOS mais antigo seria preciso empacotar com um bundler.
- WebP em glTF exige iOS 14+.
- Com Modo Pouca Energia o Safari limita a 30 fps; a animação continua correta (é baseada em tempo).
- Em iPhones antigos (A12 ou anterior), se houver queda de fps, desligue a sombra (`renderer.shadowMap.enabled = false`) ou reduza o pixel ratio para 1,5.

## Validação feita

- Cada um dos 20 clipes renderizado quadro a quadro (frente e lateral) no Blender para conferir pés, quadril, extensão e retorno.
- As 8 combinações executadas no navegador (Chrome headless com WebGL por software): eventos `moveStart`/`moveEnd` na ordem exata em todas.
- Todos os movimentos individuais executados, com retorno ao centro automático após passos/pivôs.
- Sem erros no console.
- Não testado em iPhone físico (não disponível neste ambiente).

## Limitações honestas

- Animações feitas por keyframes com IK, não por captura de movimento (Mixamo e bancos de mocap não estavam acessíveis). Ficam convincentes e tecnicamente corretas, mas sem a microvariação de mocap profissional.
- Expressões faciais não animadas (sem ossos de mandíbula/olhos).
- Cabelo e barba são cascas texturizadas, não fios.
