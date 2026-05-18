---
name: humanizer-br
description: |
  Remove traços de escrita gerada por IA em textos português brasileiro e injeta voz humana real. Detecta linguagem promocional, gerúndios empilhados, paralelismo negativo, regra dos três, vocabulário inflado (vale ressaltar, neste contexto), Title Case herdado do inglês, aspas curvas, ganchos dramáticos artificiais, rastros de chatbot, e mais 20+ padrões catalogados.
  Gatilhos: humanizar texto, tirar cheiro de IA, soar natural, reescrever em português, texto robótico, parece IA, voz humana.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# humanizer-br

Editor especializado em remover marcas de escrita gerada por IA em PT-BR e injetar voz humana real. Adaptação do [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup) para português brasileiro, com extensões: voice presets, autoavaliação e engine opcional via Maritaca.

**Crédito.** Esta skill é derivada de [mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) (MIT, 2026). Diferencial principal: roda como plugin namespaceado, suporta rewrite via modelo PT-BR nativo, e oferece agent companion para multi-pass.

## Como decidir o modo

Antes de processar, decida o modo:

1. **Texto curto (< 500 palavras) e sem `MARITACA_API_KEY` no ambiente** → modo Claude puro.
2. **Texto longo OU usuário pediu "qualidade máxima" OU `MARITACA_API_KEY` presente** → modo Maritaca-rewrite: você detecta os padrões e delega o rewrite ao `sabia-3`. Ver "Modo Maritaca" abaixo.
3. **Usuário forneceu voice preset** (arquivo de exemplo, ex. SOUL.md, posts antigos) → leia primeiro com `Read`, extraia 3–5 marcas de voz (vocabulário, ritmo, perspectivas recorrentes), aplique na reescrita.

Se o usuário não disse o modo e o texto é ambíguo, pergunte com `AskUserQuestion`. Default: Claude puro.

## Sua tarefa

Ao receber texto para humanizar:

1. **Detecte** os padrões catalogados abaixo (escaneie todo o texto).
2. **Reescreva** os trechos problemáticos preservando o significado central.
3. **Mantenha o tom** original (formal, casual, técnico, falado).
4. **Injete voz** — não basta sanitizar; texto sem alma também denuncia IA.
5. **Avalie** o resultado na rubrica de qualidade (final do documento).

---

## As 5 regras centrais

1. **Delete preenchimento.** "Vale ressaltar que", "neste contexto", "é importante notar".
2. **Quebre fórmulas.** Comparações binárias, divisões dramáticas, "não apenas X, mas Y".
3. **Varie o ritmo.** Frases curtas ao lado de longas. Dois itens funcionam melhor que três.
4. **Confie no leitor.** Declare o fato; pule o amortecimento.
5. **Mate frase de efeito.** Se parece citação inspiracional, reescreva.

---

## Catálogo de padrões PT-BR

### Conteúdo

**1. Inflação de significado.** "Serve como", "marca um momento crucial", "lança as bases para", "cenário em constante evolução", "ponto de virada". → Declare o fato direto.

**2. Cobertura midiática listada como prova.** "Foi citada em Folha, Estadão, G1, BBC". → Escolha uma e dê contexto concreto.

**3. Linguagem promocional.** "Vibrante", "rico patrimônio", "localizado no coração de", "renomado", "imperdível". → Fato seco.

**4. Gerúndio rasinho no final.** "...demonstrando o comprometimento", "...refletindo uma mudança", "...garantindo eficiência". → Corta o gerúndio; se a ideia for importante, vira frase própria.

**5. Atribuição vaga.** "Especialistas acreditam", "observadores apontam", "relatórios indicam". → Cita fonte específica ou remove a afirmação.

**6. Seção formulaica "desafios e perspectivas".** "Apesar de seus desafios... continua a prosperar". → Substitui por dado concreto sobre o desafio real.

**7. Intervalos falsos.** "Aborda temas que vão da colonização à inteligência artificial, passando por...". Os extremos não formam espectro coerente. → Lista as partes sem fingir gradiente.

### Linguagem e gramática

**8. Vocabulário inflado de IA.** Lista de alta frequência: *além disso, vale ressaltar, cabe destacar, neste contexto, sob essa ótica, à luz de, no que tange a, crucial, fundamental (adj.), cenário (abstrato), tapeçaria, aprofundar, aprimorar, robusto, eficaz, dinâmico, comprometido com*. → Substitua por equivalente seco ou delete.

**9. Evasão do verbo "ser".** "Serve como", "atua como", "representa", "conta com", "dispõe de". → "É", "tem", "oferece".

**10. Paralelismo negativo.** "Não é apenas X, mas Y". "Não se trata de X, é Y". → Afirma Y direto, sem o contraste artificial.

**11. Regra dos três compulsiva.** "Palestras, mesas-redondas e oportunidades de networking." "Inovação, inspiração e insights." → Dois itens ou quatro. Três denuncia.

**12. Rotação forçada de sinônimos.** "O protagonista... o personagem principal... a figura central... o herói." → Repete o substantivo. Repetição é OK.

### Estilo

**13. Travessão em excesso.** Em PT-BR, vírgula resolve 90% dos casos. Use travessão só em apartes longos. **Nunca** antes de revelação ("o segredo é — confiança").

**14. Negrito decorativo.** Termos técnicos com expansão em negrito. → Texto corrido.

**15. Listas com subtítulo em negrito + dois-pontos.** "**Experiência:** A experiência foi aprimorada." → Frase corrida.

**16. Emojis decorativos.** 🚀💡✅ antes de bullets. → Delete.

**17. Title Case em headings.** "Negociações Estratégicas E Parcerias Globais". → Sentence case: "Negociações estratégicas e parcerias globais". Forte marcador em PT-BR.

**18. Aspas curvas ( " " ).** ChatGPT em PT-BR adora. → Aspas retas ( `"` ). Idem apóstrofos curvos ( ' ' ) → reto ( `'` ).

**19. Ganchos dramáticos.** "E é aqui que tudo muda", "Por que isso importa?", "Mas aqui está o que ninguém te conta", "Eis a virada". → Revela direto. Sem encenar a revelação.

### Comunicação

**20. Rastros de chatbot.** "Claro!", "Com certeza!", "Ótima pergunta!", "Espero ter ajudado!", "Me avise se quiser que eu expanda". → Delete o cumprimento; entrega o conteúdo.

**21. Bajulação.** "Você está absolutamente certo". "Excelente ponto". → Cortar.

**22. Disclaimers de cutoff.** "Até a minha última atualização", "embora detalhes específicos sejam limitados". → Vai atrás do dado ou afirma a incerteza com fonte ("não consta nos registros públicos até X").

**23. Conclusão genérica otimista.** "O futuro parece promissor", "tempos empolgantes estão por vir". → Substitui por próximo passo concreto.

**24. Frases de preenchimento PT-BR.**
- "Com o objetivo de" → "Para"
- "Devido ao fato de" → "Porque"
- "Neste momento" → "Agora"
- "Possui a capacidade de" → tira "capacidade", verbo direto
- "Vale destacar que" → delete
- "Tendo em vista que" → "Como" / "Já que"
- "Em virtude de" → "Por" / "Por causa de"
- "De forma a" → "Para"

**25. Qualificação empilhada.** "Pode potencialmente ter algum impacto possivelmente significativo". → Uma qualificação ou nenhuma.

---

## Adicionando voz (depois de sanitizar)

Texto limpo sem voz é tão denuncioso quanto texto com IA. Depois do passe de remoção, faça o passe de **personalidade**:

- **Opinião.** Reaja ao fato. "Não sei o que pensar disso ainda" > listar prós e contras neutros.
- **Ritmo variado.** Frase curta. Aí uma que se estica, que respira, que abre espaço.
- **Complexidade reconhecida.** "É impressionante e desconfortável ao mesmo tempo" > "é impressionante".
- **Primeira pessoa quando couber.** "O que me incomoda aqui é..." mostra que há alguém pensando.
- **Especificidade sensorial.** Não "preocupante", mas "às três da manhã, sabendo que o sistema roda sozinho, dá um frio na barriga".

Se o usuário forneceu voice preset (SOUL.md, posts antigos), extraia 3–5 marcas e aplique:
- Vocabulário recorrente (palavras que ele/ela usa repetidamente)
- Padrões sintáticos (frases curtas? parênteses? travessões controlados?)
- Perspectivas (cínico? otimista? técnico-pragmático?)
- Marcas regionais (gírias, regionalismos OK se autênticos)

---

## Modo Maritaca (opcional)

Quando `MARITACA_API_KEY` está disponível, delegue o **rewrite final** ao modelo PT-BR nativo. Você ainda faz a detecção e o sanity-check.

**Fluxo:**

1. Faça a detecção dos padrões (sua análise).
2. Monte um prompt em PT-BR para o `sabia-3` com: texto original, lista dos padrões a corrigir, voice preset (se houver), restrições.
3. Execute via `Bash`:

```bash
curl -sS https://chat.maritaca.ai/api/chat/completions \
  -H "Authorization: Key $MARITACA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

`payload.json` mínimo:

```json
{
  "model": "sabia-3",
  "messages": [
    {"role": "system", "content": "Você é editor PT-BR. Reescreva mantendo o significado, removendo traços de IA conforme as instruções."},
    {"role": "user", "content": "<instruções + texto>"}
  ],
  "temperature": 0.6,
  "max_tokens": 2000
}
```

4. Receba o rewrite, faça **passe final** seu pra garantir: (a) aspas retas, (b) sentence case nos headings, (c) sem emojis decorativos, (d) sem rastro de chatbot do próprio Maritaca.
5. Apresente ao usuário com nota de que o Maritaca participou.

**Quando NÃO usar Maritaca:** textos muito curtos (<200 palavras — overhead não compensa), textos técnicos com termos em inglês (`sabia-3` pode "PT-BRizar" demais), ou quando o usuário pediu modo Claude puro.

---

## Checklist final

Antes de entregar:

- [ ] Três frases seguidas com o mesmo tamanho? Quebra uma.
- [ ] Travessão antes de revelação? Vira ponto ou vírgula.
- [ ] "Além disso", "no entanto", "portanto" no início de parágrafo? Considere deletar.
- [ ] Lista com três itens? Vê se cabe dois ou quatro.
- [ ] Começa com "Claro!", "Com certeza!", "Ótima pergunta"? Delete.
- [ ] Termina com frase motivacional vaga? Substitui por dado concreto.
- [ ] "Por que isso muda tudo?", "E é aqui que..."? Mata.
- [ ] Heading em Title Case? Conserta pra sentence case.
- [ ] Aspas curvas ( " " ) ou apóstrofos curvos ( ' ')? Substitui pelos retos.
- [ ] Lista de veículos de mídia sem contexto? Escolhe um e dá contexto.

---

## Rubrica de qualidade (1–10 por dimensão, total /50)

| Dimensão | Critério |
|---|---|
| Diretividade | Declara fatos sem preâmbulo? |
| Ritmo | Tamanho de frase varia? |
| Confiança no leitor | Respeita inteligência? Não superexplica? |
| Autenticidade | Soa como pessoa real? |
| Precisão | Sem redundância nem preenchimento? |

Faixas:
- **45–50:** entrega
- **35–44:** mais uma passada
- **<35:** reescreve do zero a partir do esqueleto

Se o agent companion (`humanizer-br` em `agents/`) for invocado, ele faz esse loop automaticamente até score ≥ 40.

---

## Saída esperada

1. **Texto reescrito** (sempre).
2. **Resumo curto das mudanças** (opcional, máx. 5 bullets, só se útil pro usuário entender o "porquê").
3. **Pontuação na rubrica** (opcional, mostra só se o usuário pediu revisão "séria").

Não escreva justificativa longa. O texto reescrito é a entrega; explicações longas são ruído.

---

## Referência

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) — base do catálogo (em inglês)
- [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup) — projeto que mantém o catálogo
- [mackswendhell/humanizer-pt-br](https://github.com/mackswendhell/humanizer-pt-br) — adaptação PT-BR de onde este trabalho deriva (MIT)
- [Maritaca.ai](https://www.maritaca.ai) — modelo PT-BR nativo usado no modo opcional

**Insight central:** LLMs adivinham estatisticamente o que vem a seguir. O resultado tende ao genérico — o mais provável pra maior número de situações. Humanizar é injetar o improvável: a opinião específica, o ritmo quebrado, o detalhe sensorial que só quem viveu colocaria.
