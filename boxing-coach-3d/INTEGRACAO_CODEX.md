# Integração do Boxing Fit 3.0 (aprender shadow boxing + treinador 3D)

Documento para o ChatGPT/Codex executar no repositório `pedrorizzu-hash/Boxing-fit`. Tudo aqui foi aplicado e testado numa cópia local do repositório.

## O que muda

- `index.html` é **substituído**: app só de boxe no modelo BetterMe. Tem questionário inicial, jornadas de aulas que desbloqueiam golpes, aula do dia, treinos rápidos, monte seu treino, combinações chamadas pelo número só com golpes aprendidos, esforço e dor, sequência, conquistas e base canhota. O método está em `boxing-coach-3d/METODO_DE_TREINO.md`.
- `sw.js`: cache `boxing-fit-v4` com os arquivos do treinador 3D.
- Pasta nova `boxing-coach-3d/`: modelo, animações (22, incluindo troca de nível e sprawl leve), controlador e adaptador.
- O visual, o backup e o treinador SVG antigo continuam: o SVG é a reserva quando o 3D não carrega.

Dados salvos no iPhone **não se perdem**. A chave `boxingFitV3` é migrada automaticamente: o histórico e o nome ficam, e o questionário abre na primeira vez para montar o plano.

## Passo a passo

1. Criar a branch: `git checkout -b feat/boxing-fit-3`.
2. Copiar a pasta `boxing-coach-3d/` para a raiz do repositório (opcionais: `source-pipeline/`, `demo-standalone.html`).
3. Aplicar o patch: `git apply boxing-coach-3d/integration/boxing-fit.patch`.
   - Se não aplicar porque o `index.html` mudou depois de 18/11/2026: substituir `index.html` e `sw.js` pelos arquivos do pacote `publicar-boxing-fit.zip` e reaplicar à mão as mudanças feitas depois dessa data.
4. Testar localmente: `python3 -m http.server` e abrir `http://localhost:8000`.
5. Commit: "Boxing Fit 3.0: aprenda shadow boxing com treinador 3D". Abrir pull request para a `main`.

Não alterar:
- Não remover o SVG de `#stage` nem o bloco "Articulated coach": é a reserva sem WebGL.
- `setStage()` reescreve `className` do palco; o adaptador usa o atributo `data-coach3d` por isso.
- O cronômetro continua baseado em `deadline` (sem desvio quando a tela pausa).

## Contrato entre app e treinador 3D

O app chama em `render()`:

```js
window.BoxingFit3D.sync({ key, title, move, running, remaining, seq, block, call, speed, stance })
```

| Campo | Significado |
|---|---|
| `block` | `warm`, `tech`, `calls`, `burst`, `rest`, `cool`, `mob` |
| `seq` | Movimentos que o 3D repete no bloco de técnica |
| `call` | `{ id, seq }` da combinação chamada agora; cada `id` novo dispara a animação na hora |
| `stance` | `southpaw` espelha o treinador |

Na biblioteca: `window.BoxingFit3D.demo(key, nome, seq, stance)`.

Comportamento:

| Bloco | O que o 3D faz |
|---|---|
| Técnica | Repete `seq` no ritmo indicado; não começa uma repetição que não cabe no tempo restante |
| Chamadas | Executa cada combinação chamada no instante em que o app fala o número |
| Explosão | 1-2 contínuo em velocidade 1,3 |
| Descanso e volta à calma | Base com ritmo |
| Pausa e retomada | Congela e retoma do mesmo quadro |

## Testes de aceitação

1. Primeira abertura: o questionário aparece (9 telas). No fim, a tela de resultado mostra aulas, ritmo, foco e previsão de conclusão.
2. Início: o cartão mostra a aula do dia com o golpe que será aprendido; o calendário da semana mostra os dias do plano.
3. Aula 1: aquecimento, aula em câmera lenta com 3 pontos-chave, prática guiada, rounds e volta à calma.
4. Na aula 2 (jab), os rounds terminam com chamadas ("um", "um, um", "entra, um"), e o treinador 3D executa cada uma.
5. Pausar e continuar: o cronômetro e o 3D congelam e retomam juntos.
6. Fim do treino: formulário de esforço e dor. Ao salvar, aparece o golpe desbloqueado e as conquistas novas.
7. Golpes: os aprendidos aparecem com ✓ e os outros com 🔒 e o número da aula; todos têm demonstração 3D com acertos e erros comuns.
8. Treinos rápidos e "Monte seu treino" liberam depois da aula do jab e só chamam golpes aprendidos.
9. Base canhota no questionário: o treinador aparece espelhado.
10. Evolução: golpes aprendidos, conquistas, carga semanal, histórico e calorias (com o peso informado).
11. Modo avião depois de uma visita: o app abre com o 3D (cache v4).
12. Renomear `boxing-coach-3d/assets/coach.glb`: o app funciona com o SVG, sem erro na tela.

## Prompt para colar no Codex

> No repositório pedrorizzu-hash/Boxing-fit, crie a branch `feat/boxing-fit-3`. Copie a pasta `boxing-coach-3d/` anexada para a raiz. Rode `git apply boxing-coach-3d/integration/boxing-fit.patch`; se falhar, substitua `index.html` e `sw.js` pelos arquivos anexados. Não altere arquivos dentro de `boxing-coach-3d/`. Suba um servidor local, execute os testes de aceitação 1 a 10 de `boxing-coach-3d/INTEGRACAO_CODEX.md`, faça commit com a mensagem "Boxing Fit 3.0: aprenda shadow boxing com treinador 3D" e abra um pull request para a main com o resumo da seção "O que muda".
