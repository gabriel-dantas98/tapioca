# DESIGN.md — humanizer-br

## Goal
Remover traços de escrita gerada por IA em PT-BR e injetar voz humana real, rodando 100% no Claude/CLI, sem dependência externa.

## Non-goals
- Traduzir ou reescrever em outras línguas.
- Classificar se um texto é IA (assume o input).
- Substituir editor humano (é assistiva).
- Otimizar SEO ou copy de conversão.
- Inventar fatos pra "deixar mais humano" — alucinação é pior que vaga.

## Inputs
- Texto PT-BR a humanizar.
- Voice preset opcional (arquivo de exemplo: SOUL.md, posts antigos).

## Outputs
- Texto humanizado, significado preservado.
- Lista dos padrões detectados (por categoria do catálogo).
- No modo agent: score na rubrica + diff conceitual.

## Voice/Tone
PT-BR natural. A skill aplica em si as próprias regras (aspas retas, sentence case, sem emoji decorativo).

## Open questions
- Endurecer o guard anti-alucinação com exemplos negativos no catálogo.
- Voice presets versionados como biblioteca reusável?
