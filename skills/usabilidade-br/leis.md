# Leis de UX — passe 2

Critérios escritos para esta skill. A seleção — lei com número, heurística de Nielsen de origem, aceite no prompt — parte do material de Leandro Rezende (Bold School) e do catálogo público Laws of UX (Jon Yablonski, [lawsofux.com](https://lawsofux.com/)). O texto abaixo é nosso. Não copie o arquivo dele para cá nem para o report.

H5 e H9 não entram como lei. Prevenção de erro e recuperação de erro já são heurísticas; repetir o mesmo erro nos dois passes seria achado duplicado.

A família é a chave, junto com a rota e o selector. `score.py` é quem grava a heurística e a lei a partir da família. Grupo é o pai imediato do controle, nunca `body`.

Leis `sempre` entram em `leis_aplicaveis` em toda tela que tem controle, mesmo sem ficha. Leis `condicional` só entram quando o gatilho está na evidência. Fora da lista, a lei não entra no denominador e não vira violação inventada.

## Como não duplicar

- Mesma rota + mesmo selector + mesma família = uma ficha. A severidade fica a maior. Não some.
- Mesmo grupo com `excesso-acoes` absorve `sem-destaque`.
- Mesmo grupo com `feedback-lento` absorve `status-invisivel` daquele controle. Rota sem item ativo, noutro grupo, continua valendo.
- Mesmo grupo com `erro-opaco` absorve `fim-sem-status`.
- Mesmo grupo com `visual-mesma-funcao` absorve `sem-destaque`.
- Quem renderiza o report usa a lista que `score.py` devolve, não as duas listas cruas.

## Hick

- id: hick
- heuristica: 8
- familia: excesso-acoes
- aplicavel: sempre

Conta as ações de comando que dividem o mesmo pai e o mesmo patamar. Ações iguais, neste catálogo, são as do mesmo patamar — não as que repetem o rótulo, e não uma mistura de link de navegação com botão de ferramenta.

Acima de 5, o excedente sai da vista e entra num controle Mais (`More`, se a interface for inglês). O próprio Mais não entra na conta. Aceite: no máximo 5 ações visíveis no mesmo patamar.

Origem: H8. A heurística pede hierarquia; a lei fecha o 5. Se esta ficha existe no grupo, não abra `sem-destaque` ao lado: das ações que continuam visíveis, 1 é a primária, e isso já está no aceite.

Severidade típica: 2. Sobe para 3 se a ação da tarefa principal ficou enterrada no bloco.

Não use esta lei para cortar item de navegação que a pessoa precisa escanear, nem para encurtar um fluxo (Parkinson), nem para partir um formulário (Miller).

## Fitts

- id: fitts
- heuristica: 7
- familia: alvo-motor
- aplicavel: sempre

O tempo para acertar um alvo cresce quando ele é pequeno. O piso desta auditoria web é o retângulo de borda, medido com `getBoundingClientRect`: largura >= 44 px e altura >= 44 px. Alvos adjacentes no mesmo grupo precisam de vão >= 8 px.

Não trate `font-size` como área. Um ícone de 20 px dentro de um botão de 44 px passa; o ícone sozinho, sem essa caixa, não passa. Vários misses da mesma classe podem ser uma ficha, com o selector da classe.

Em viewport com largura < 768 px, o centro da ação primária fica na metade inferior. Em viewport larga, CTA no topo não é falha de distância. O 48 px do Material só vale se o produto for Android nativo — fora deste auditor.

Origem: H7.

Severidade típica: 3 na ação primária, 2 no alvo secundário.

## Jakob

- id: jakob
- heuristica: 4
- familia: convencao-quebrada
- aplicavel: sempre

Quem chega passa o dia em outros produtos e espera o mesmo jeito. Esta skill confere cinco convenções, como contagem: logo leva ao início; busca é um campo com lupa no topo; o item ativo da navegação está marcado; voltar desfaz o último passo; o fechar do modal fica no canto superior e Esc também fecha.

Desvio sem uma frase visível na própria tela (não um comentário no código) falha. Aceite: 0 desvios mudos.

Origem: H4, no eixo "igual ao que a pessoa já aprendeu fora daqui". Sinônimo interno — Excluir numa tela, Deletar na outra — é `termo-instavel`, não esta lei.

Severidade típica: 2. Sobe para 3 se o desvio esconde a saída ou o envio.

## Proximidade

- id: proximidade
- heuristica: 6
- familia: itens-afastados
- aplicavel: sempre

O que serve a mesma decisão fica perto; grupos diferentes ficam mais longe do que os itens de dentro. Vão interno <= 16 px. Vão entre grupos >= 24 px. Se os vãos se invertem, a leitura junta o que não devia.

Não resolva com mais uma caixa se o espaço já separa. Caixa é a lei de região comum.

Origem: H6. A relação tem de estar na tela, não na memória de quem usa.

Severidade típica: 2.

## Miller

- id: miller
- heuristica: 6
- familia: sem-bloco
- aplicavel: sempre

A memória de trabalho segura poucos blocos. O uso aqui é partir a informação, não apagar opção útil. CPF entra como 3-3-3-2, cartão em blocos de 4, telefone em grupos curtos. Um passo de formulário mostra no máximo 7 campos; acima disso, outro passo.

7 ± 2 não é teto de menu nem de lista visível. Menu estourado é Hick, no 5. Lista longa pode existir se der para escanear.

Origem: H6. Campo sem rótulo permanente é `sem-rotulo`, outra ficha, mesmo que o CPF também esteja sem bloco.

Severidade típica: 2. Sobe para 3 em cartão ou CPF sem bloco.

## Doherty

- id: doherty
- heuristica: 1
- familia: feedback-lento
- aplicavel: sempre

A troca parece contínua quando a tela responde. O número é resposta visível <= 400 ms: o controle muda (disabled, `aria-busy`, skeleton ou progresso) nesse prazo. A operação pode durar mais; a tela é que não fica parada.

Sem cronômetro na sessão, não invente o milissegundo. A ficha sai quando o handler não muda o estado do controle. O aceite do prompt continua <= 400 ms.

Origem: H1. É a mesma ficha de "clique sem feedback". Não abra `status-invisivel` no mesmo grupo para o mesmo controle. Rota sem item ativo, noutro grupo, continua `status-invisivel`.

Validação enquanto a pessoa digita (<= 200 ms) é `erro-evitavel`, não esta lei.

Severidade típica: 3 em enviar, pagar ou salvar.

## Von Restorff

- id: von-restorff
- heuristica: 8
- familia: sem-destaque
- aplicavel: sempre

No meio de itens parecidos, o que destoa é o que fica. Por vista, exatamente 1 ação é a primária. Ela difere das outras por tamanho, peso ou rótulo. Cor sozinha não basta.

Não emitir se o mesmo grupo já tem `excesso-acoes` ou `visual-mesma-funcao`. Dois CTAs com o mesmo peso, sendo 2 e não 6, e sem serem o par "destrutivo pintado de primário", são esta lei.

Origem: H8.

Severidade típica: 2. Sobe para 3 se a ação destrutiva tem o mesmo peso da primária e a ficha de similaridade não ficou com esse par.

## Posição serial

- id: posicao-serial
- heuristica: 6
- familia: posicao-serial
- aplicavel: condicional

Gatilho: sequência (lista, menu ou passos) com mais de 5 itens e um item que a tarefa precisa achar.

A lembrança pega as pontas. O item decisivo ocupa a posição 1 ou a última. Aceite: posição 1 ou N. Sem o gatilho, a lei fica fora do denominador. Não use para esconder o item 3 de um menu de 4.

Origem: H6.

Severidade típica: 2.

## Pico-final

- id: pico-final
- heuristica: 1
- familia: fim-sem-status
- aplicavel: condicional

Gatilho: a rota é o fim de um fluxo (confirmação, recibo, estado terminal).

A memória do fluxo pesa o auge e o final. A tela final mostra 1 desfecho explícito e 1 próximo passo. Final mudo — tela vazia ou um "ok" sem desfecho — falha.

`erro-opaco` no mesmo grupo absorve esta ficha. O `alert` genérico não conta duas vezes.

Origem: H1.

Severidade típica: 2.

## Gradiente de objetivo

- id: gradiente
- heuristica: 1
- familia: progresso-fluxo
- aplicavel: condicional

Gatilho: fluxo com 3 ou mais passos.

A distância restante precisa aparecer. A tela mostra o passo i de n, com os dois números, durante o fluxo todo. Barra sem número não fecha o aceite.

Spinner de uma operação é Doherty, não esta lei.

Origem: H1.

Severidade típica: 2.

## Tesler

- id: tesler
- heuristica: 7
- familia: complexidade-no-usuario
- aplicavel: condicional

Gatilho: o formulário pede um valor que o sistema já tem ou deriva (endereço depois do CEP, bandeira do cartão, data de hoje, país da sessão).

A complexidade não some; alguém absorve. Aceite: 0 campos perguntam de novo o que já está na sessão ou no passo anterior.

Origem: H7. Formato do campo é Miller. Validação é `erro-evitavel`.

Severidade típica: 2. Sobe para 3 quando o campo extra bloqueia pagamento.

## Efeito do default

- id: efeito-default
- heuristica: 5
- familia: opcao-sem-default
- aplicavel: condicional

Gatilho: existe uma opção recomendada para a maioria e a tela mostra a escolha.

Essa opção já vem marcada. Aceite: 0 escolhas recomendadas sem esse estado. Recomendada aqui é a que evita erro da maioria, não a que aumenta o ticket: não marque opção paga ou destrutiva como default para empurrar conversão. Se nenhuma é recomendável, não invente default e não emita ficha.

Origem: H5. É escolha prévia, não a validação de formato.

Severidade típica: 2.

## Similaridade

- id: similaridade
- heuristica: 4
- familia: visual-mesma-funcao
- aplicavel: sempre

O olho junta o que tem a mesma forma. A mesma função usa 1 tratamento visual. A ação destrutiva não reutiliza o tratamento da primária — o par azul-em-cima-de-azul do fixture é esta ficha, origem H4, e não abre `sem-destaque` no mesmo grupo.

Aceite: 1 tratamento por função, e o destrutivo com outro tratamento.

Palavra diferente com a mesma cara é `termo-instavel` se o problema for o vocabulário, não a tinta.

Origem: H4.

Severidade típica: 2. Sobe para 3 quando o destrutivo está vestido de ação principal.

## Região comum

- id: regiao-comum
- heuristica: 4
- familia: grupo-sem-regiao
- aplicavel: sempre

Itens dentro de um limite visível (fundo ou borda) são lidos como um grupo. Cada grupo relacionado tem 1 limite compartilhado. Aninhar caixa no mesmo grupo para de ajudar: profundidade <= 2.

Se o vão da proximidade já separa, não acrescente borda só para cumprir esta lei. A ficha sai quando o grupo existe e não tem limite, ou quando a profundidade passa de 2.

Origem: H4.

Severidade típica: 1. Sobe para 2 se ações de grupos diferentes se misturam por falta de limite.

## Parkinson

- id: parkinson
- heuristica: 7
- familia: caminho-longo
- aplicavel: condicional

Gatilho: a tarefa principal é uma sequência (cadastro, checkout, wizard).

Conte os passos até o fim, inclusive o passo que não decide nada. Aceite: a tarefa principal termina em <= 5 passos.

Não confundir com Hick (ações ao mesmo tempo) nem com Miller (campos dentro do passo).

Origem: H7.

Severidade típica: 2.

## Zeigarnik

- id: zeigarnik
- heuristica: 1
- familia: tarefa-aberta-invisivel
- aplicavel: condicional

Gatilho: existe tarefa começada e não terminada que a pessoa pode retomar (rascunho, carrinho, passo no meio) fora da tela em que ela está agora.

A tela mostra a quantidade que falta. Aceite: esse número está visível, e o carregamento não abre modal de cobrança (0 por visita).

"Passo i de n" do fluxo que a pessoa está fazendo agora é gradiente, não esta lei.

Origem: H1.

Severidade típica: 2.

## Crédito

- Leandro Rezende (Bold School). A ideia de auditar com lei numérica amarrada à heurística de origem vem do material dele. As regras desta página foram escritas de novo. Não abra o arquivo dele para colar no report.
- Laws of UX, Jon Yablonski: https://lawsofux.com/
- Heurísticas: Jakob Nielsen, 1994; NN/g, https://www.nngroup.com/articles/ten-usability-heuristics/
- Limiar de 400 ms: Walter J. Doherty e Ahrvind J. Thadani, IBM, 1982.
- Piso de 44 px: área mínima de toque usada por esta skill na web.
