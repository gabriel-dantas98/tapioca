# Violações esperadas em `bad-page.html`

A fixture é uma página HTML deliberadamente ruim em múltiplas heurísticas. Um run funcional do `/tapioca:usabilidade-br` deve identificar pelo menos as seguintes.

## Mínimo aceitável (test passa se ≥ 8 detectadas)

### H1 — Visibilidade do status do sistema
- Form de pagamento submita sem loading state nem feedback
- Botão `Submit` não muda estado durante a operação

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
- `.btn-danger` tem o mesmo estilo visual de `.btn-primary` (azul) — destrutivo deveria ser visualmente distinto
- Nav mistura PT (`Home` em inglês mas...) — wait, todos em inglês — falta de consistência com o resto da página em PT-BR

### H5 — Prevenção de erros
- Inputs sem validação em tempo real (CPF, email, senha)
- Form submit sem disabled state mesmo com campos vazios
- Sem indicação de campos obrigatórios

### H6 — Reconhecimento em vez de memorização
- Inputs usam só placeholder (some ao digitar) — sem label permanente
- Sem indicação de qual rota está ativa no nav

### H7 — Flexibilidade e eficiência
- Nenhum atalho de teclado documentado
- Submit não tem tab order coerente
- Sem busca/filtro nos painéis

### H8 — Estética e design minimalista
- Heading em Title Case (`Bem-vindo Ao Painel De Controle`)
- Emojis decorativos no parágrafo (🚀💡✅)
- Linguagem promocional ("Vibrante", "inovadora", "serve como uma prova")
- Aspas curvas em `"inovadora"`
- Dois CTAs com mesma proeminência visual (`Submit` e `Delete` lado a lado)

### H9 — Recuperação de erros
- `alert('Erro')` sem dizer qual campo nem como corrigir
- Form apagado em vez de manter dados ao dar erro

### H10 — Ajuda e documentação
- Ícones-only sem tooltip nem aria-label (🗑 ⚙ 📤)
- Empty state diz apenas "Nenhum dado disponível" sem CTA
- Sem help visível no app

---

## Critério de aprovação

O agent deve:

1. **Detectar ≥ 8 das categorias acima**, mencionando o número da heurística (H1..H10) e o sintoma específico.
2. **Apontar severidade ≥ 2** (maior) em pelo menos 3 violações (H3 delete sem confirmação, H5 form sem validação, H9 erro genérico são severidade 3+).
3. **Gerar o HTML report** com a estrutura definida no SKILL.md (header com score, seção por heurística, fix prompts copiáveis).
4. **Não inventar violação** em heurística que está OK (não há nenhuma totalmente OK aqui — a fixture é propositalmente ruim — mas se o agent reportar uma violação que não existe na lista acima, falha por falso positivo).

## Notas

- Esta fixture **não cobre apps com auth** — fluxos login-gated estão fora do escopo da v0.1.
- O agent deve gerar fix prompts mesmo sem `--code` (file:line ficará `null`, fix prompt diz "componente não localizado, ajustar manualmente").
- Idealmente o smoke test em CI roda o agent contra esta fixture servida via `python3 -m http.server`. Por enquanto a validação automatizada cobre só a presença dos arquivos; execução completa é manual até v0.2.
