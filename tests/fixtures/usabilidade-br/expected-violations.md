# Violações esperadas em `bad-page.html`

A fixture é uma página HTML deliberadamente ruim em múltiplas heurísticas. Um run funcional do `/tapioca:usabilidade-br` deve identificar pelo menos as seguintes.

## Mínimo aceitável (test passa se ≥ 8 detectadas)

### H1 — Visibilidade do status do sistema
- Form de pagamento submita sem mudança de estado. Uma ficha só: família `feedback-lento`, heurística H1, lei Doherty. Aceite: resposta visível <= 400 ms. Não abrir outra ficha de H1 para o mesmo botão.

### H2 — Correspondência sistema/mundo real
- Botões em inglês (`Submit`, `Delete`) em página PT-BR
- Heading `Submit Your Application` em página PT-BR
- Modal pergunta `Are you sure?` em vez de PT-BR
- Data exibida em ISO 8601 (`2026-05-18T14:32:00Z`) em vez de DD/MM/AAAA
- Mensagem de erro genérica (`alert('Erro')`)

### H3 — Controle e liberdade do usuário
- Botão `Delete` remove form sem confirmação
- Modal sem botão de fechar nem handler de ESC
- Modal `OK` apaga `document.body` (ação destrutiva sem reverso)

### H4 — Consistência e padronização
- `.btn-danger` e `.btn-primary` no mesmo azul. Uma ficha: família `visual-mesma-funcao`, lei Similaridade, origem H4. Não abrir `sem-destaque` para o mesmo par.
- Nav em inglês na página PT-BR já está em H2 (`linguagem-sistema`). Não abrir outra ficha H4 só por isso.

### H5 — Prevenção de erros
- Inputs sem validação em tempo real (CPF, email, senha)
- Form submit sem disabled state mesmo com campos vazios
- Sem indicação de campos obrigatórios

### H6 — Reconhecimento em vez de memorização
- Inputs usam só placeholder (some ao digitar) — sem label permanente (`sem-rotulo`)
- CPF sem bloco 3-3-3-2. Outra ficha: família `sem-bloco`, lei Miller. Não fundir com a do placeholder.
- Sem indicação de qual rota está ativa no nav (`status-invisivel`, origem H1, grupo do nav — não a ficha Doherty do submit)

### H7 — Flexibilidade e eficiência
- Nenhum atalho de teclado documentado
- Submit não tem tab order coerente
- Sem busca/filtro nos painéis

### H8 — Estética e design minimalista
- Heading em Title Case (`Bem-vindo Ao Painel De Controle`)
- Emojis decorativos no parágrafo (🚀💡✅)
- Linguagem promocional ("Vibrante", "inovadora", "serve como uma prova")
- Aspas curvas em `"inovadora"`
- `#acoes-iguais` tem 6 botões no mesmo patamar e nenhum controle Mais. Uma ficha: família `excesso-acoes`, lei Hick, origem H8. Aceite: no máximo 5 ações visíveis; o excedente entra em Mais. Não abrir uma segunda ficha H8 de "CTA demais" para esse grupo.
- `Submit` e `Delete` com o mesmo peso continuam na ficha de similaridade (H4), porque são 2, não mais de 5. Não duplicar aqui.

### H9 — Recuperação de erros
- `alert('Erro')` sem dizer qual campo nem como corrigir
- Form apagado em vez de manter dados ao dar erro

### H10 — Ajuda e documentação
- Ícones-only sem tooltip nem aria-label (🗑 ⚙ 📤)
- Empty state diz apenas "Nenhum dado disponível" sem CTA
- Sem help visível no app

---

## Passe 2 — leis que a fixture força

Cada item abaixo é uma ficha, com lei, heurística de origem e número de aceite. O que já foi fundido em H1 ou H8 não reaparece.

### Fitts (origem H7, família `alvo-motor`)
- `.btn` com altura 32 px e `.icon-only` com 20 px, ambos abaixo de 44 px
- Aceite: área de toque >= 44 px em cada eixo

### Hick (origem H8, família `excesso-acoes`)
- Já descrito em H8. Não repetir a ficha.

### Doherty (origem H1, família `feedback-lento`)
- Já descrito em H1. Não repetir a ficha. Aceite: resposta visível <= 400 ms.

### Miller (origem H6, família `sem-bloco`)
- Já descrito em H6.

## Critério de aprovação

O agent deve:

1. **Detectar ≥ 8 das categorias de heurística acima**, mencionando o número (H1..H10) e o sintoma. Nas fichas de lei, citar também a lei e o número de aceite (44 px, 400 ms ou Mais).
2. **Apontar severidade ≥ 2** (maior) em pelo menos 3 violações (H3 delete sem confirmação, H5 form sem validação, H9 erro genérico são severidade 3+).
3. **Gerar o HTML report** com a estrutura do SKILL.md: geral (camada Nielsen), camada leis, achados únicos, ficha uma vez só, fix prompt com lei e critério numérico.
4. **Não inventar violação** que não está na lista, e **não abrir a segunda ficha** quando o texto acima manda fundir (Doherty não repete H1; Hick não repete "CTA demais"; similaridade não repete destaque no par azul).

## Notas

- Esta fixture **não cobre apps com auth** — fluxos login-gated estão fora do escopo da v0.1.
- O agent deve gerar fix prompts mesmo sem `--code` (file:line ficará `null`, fix prompt diz "componente não localizado, ajustar manualmente").
- Idealmente o smoke test em CI roda o agent contra esta fixture servida via `python3 -m http.server`. Por enquanto a validação automatizada cobre só a presença dos arquivos; execução completa é manual até v0.2.
