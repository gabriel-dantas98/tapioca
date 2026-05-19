# Padrões esperados na fixture `ai-flavored.md`

Um humanizer-br funcional deve identificar pelo menos estes padrões no input. O CI roda o agent CLI (Cursor ou Claude) one-shot e faz grep no output para verificar.

## Padrões obrigatórios (test fails se < 8 detectados)

- Inflação de significado: "serve como uma prova", "papel fundamental", "cenário em constante evolução"
- Linguagem promocional: "fluida, intuitiva e poderosa"
- Gerúndio raso: "garantindo que os usuários"
- Paralelismo negativo: "não se trata apenas de... mas de"
- Regra dos três: três adjetivos seguidos, três cidades, três bullets com emojis
- Vocabulário inflado: "além disso", "no contexto atual"
- Atribuição vaga: "especialistas do setor acreditam"
- Cobertura midiática listada: "Folha, Estadão, G1 e BBC"
- Title Case em heading: "Negociações Estratégicas E Parcerias Globais"
- Aspas curvas: `"internacional"` (com aspas tipográficas)
- Emojis decorativos: 🚀💡✅
- Ganchos dramáticos: "Por que isso muda tudo?", "E é aqui que as coisas começam a fazer sentido"
- Seção formulaica "apesar de seus desafios"
- Conclusão genérica otimista: "futuro promissor", "tempos empolgantes por vir"
- Rastro de chatbot: "Espero ter ajudado!", "é só me avisar"

## Critério de aprovação

O output do agent deve:

1. Mencionar **≥ 8 dos padrões acima** no resumo de detecção (case-insensitive grep por termos-chave).
2. Conter **versão reescrita** do texto (parágrafo sem as marcas listadas).
3. **Não** introduzir novas alucinações factuais (nomes de pessoas, fontes específicas que não estavam no original).
4. **Não** conter emojis decorativos no output (a própria skill os condena).
