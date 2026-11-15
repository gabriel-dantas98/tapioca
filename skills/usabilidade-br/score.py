#!/usr/bin/env python3
"""Score de duas camadas do usabilidade-br.

Cada achado entra uma vez. A família fecha a heurística de origem e a lei.
A camada Nielsen desconta o peso uma vez. A camada leis relê só os achados
que têm lei. O geral é a camada Nielsen — a mesma multa não soma de novo.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

PESO = {0: 0.5, 1: 1.0, 2: 2.0, 3: 3.0, 4: 5.0}

HEURISTICAS = {
    1: "Visibilidade do status do sistema",
    2: "Correspondência entre sistema e mundo real",
    3: "Controle e liberdade do usuário",
    4: "Consistência e padronização",
    5: "Prevenção de erros",
    6: "Reconhecimento em vez de memorização",
    7: "Flexibilidade e eficiência de uso",
    8: "Estética e design minimalista",
    9: "Ajude usuários a reconhecer, diagnosticar e recuperar de erros",
    10: "Ajuda e documentação",
}

# Lei -> heurística de origem, família e aceite numérico.
# H5 (erro-evitavel) e H9 (erro-opaco) não são leis: já estão no passe Nielsen.
LEIS = {
    "hick": {
        "nome": "Hick",
        "heuristica": 8,
        "familia": "excesso-acoes",
        "criterio": "no máximo 5 ações visíveis no mesmo patamar; acima disso o excedente fica num controle Mais; das que permanecem, 1 é a primária",
    },
    "fitts": {
        "nome": "Fitts",
        "heuristica": 7,
        "familia": "alvo-motor",
        "criterio": "área de toque >= 44 px em cada eixo, com vão >= 8 px entre alvos adjacentes",
    },
    "jakob": {
        "nome": "Jakob",
        "heuristica": 4,
        "familia": "convencao-quebrada",
        "criterio": "0 controles fogem da convenção da plataforma sem um motivo visível na própria tela",
    },
    "proximidade": {
        "nome": "Proximidade",
        "heuristica": 6,
        "familia": "itens-afastados",
        "criterio": "vão interno do grupo <= 16 px e vão entre grupos distintos >= 24 px",
    },
    "miller": {
        "nome": "Miller",
        "heuristica": 6,
        "familia": "sem-bloco",
        "criterio": "dígitos longos em blocos de até 4 (CPF 3-3-3-2); um passo de formulário mostra no máximo 7 campos",
    },
    "doherty": {
        "nome": "Doherty",
        "heuristica": 1,
        "familia": "feedback-lento",
        "criterio": "resposta visível <= 400 ms",
    },
    "von-restorff": {
        "nome": "Von Restorff",
        "heuristica": 8,
        "familia": "sem-destaque",
        "criterio": "exatamente 1 ação primária por vista, distinta por tamanho, peso ou rótulo — cor sozinha não conta",
    },
    "posicao-serial": {
        "nome": "Posição serial",
        "heuristica": 6,
        "familia": "posicao-serial",
        "criterio": "em sequência com mais de 5 itens, o item decisivo ocupa a posição 1 ou a última",
    },
    "pico-final": {
        "nome": "Pico-final",
        "heuristica": 1,
        "familia": "fim-sem-status",
        "criterio": "a tela final do fluxo mostra 1 desfecho explícito e 1 próximo passo",
    },
    "gradiente": {
        "nome": "Gradiente de objetivo",
        "heuristica": 1,
        "familia": "progresso-fluxo",
        "criterio": "fluxo com 3 ou mais passos exibe passo i de n o tempo todo",
    },
    "tesler": {
        "nome": "Tesler",
        "heuristica": 7,
        "familia": "complexidade-no-usuario",
        "criterio": "0 campos pedem um valor que o sistema já tem ou consegue derivar",
    },
    "efeito-default": {
        "nome": "Efeito do default",
        "heuristica": 5,
        "familia": "opcao-sem-default",
        "criterio": "0 escolhas com opção recomendada ficam sem essa opção já marcada",
    },
    "similaridade": {
        "nome": "Similaridade",
        "heuristica": 4,
        "familia": "visual-mesma-funcao",
        "criterio": "1 tratamento visual por função; a ação destrutiva não reutiliza o tratamento da primária",
    },
    "regiao-comum": {
        "nome": "Região comum",
        "heuristica": 4,
        "familia": "grupo-sem-regiao",
        "criterio": "cada grupo relacionado tem 1 limite compartilhado; aninhamento de caixas no mesmo grupo <= 2",
    },
    "parkinson": {
        "nome": "Parkinson",
        "heuristica": 7,
        "familia": "caminho-longo",
        "criterio": "a tarefa principal termina em <= 5 passos contados",
    },
    "zeigarnik": {
        "nome": "Zeigarnik",
        "heuristica": 1,
        "familia": "tarefa-aberta-invisivel",
        "criterio": "tarefa interrompida mostra a quantidade que falta; 0 modais de cobrança por carregamento",
    },
}

LEIS_SEMPRE = (
    "hick",
    "fitts",
    "jakob",
    "proximidade",
    "miller",
    "doherty",
    "von-restorff",
    "similaridade",
    "regiao-comum",
)

LEIS_CONDICIONAIS = (
    "posicao-serial",
    "pico-final",
    "gradiente",
    "tesler",
    "efeito-default",
    "parkinson",
    "zeigarnik",
)

# Famílias sem lei. O passe Nielsen usa estas; o passe 2 não reabre o sintoma.
NIELSEN_ONLY = {
    "status-invisivel": {
        "heuristica": 1,
        "criterio": "0 estados atuais (rota, modo, seleção) que só se descobrem adivinhando",
    },
    "linguagem-sistema": {
        "heuristica": 2,
        "criterio": "0 mensagens de sistema (código cru, data ISO, jargão) voltadas a quem usa o produto",
    },
    "sem-saida": {
        "heuristica": 3,
        "criterio": "0 ações destrutivas sem confirmação, e 0 overlays que não fecham com Esc",
    },
    "termo-instavel": {
        "heuristica": 4,
        "criterio": "1 termo por ação no produto; sinônimos a mais = 0",
    },
    "erro-evitavel": {
        "heuristica": 5,
        "criterio": "validação do campo aparece em <= 200 ms depois da digitação, antes do envio",
    },
    "sem-rotulo": {
        "heuristica": 6,
        "criterio": "0 campos cujo único nome é um placeholder",
    },
    "sem-atalho": {
        "heuristica": 7,
        "criterio": "0 ações repetidas de teclado sem atalho documentado num lugar só",
    },
    "ruido-visual": {
        "heuristica": 8,
        "criterio": "1 ação primária identificável em <= 3 s; 0 enfeites sem função",
    },
    "erro-opaco": {
        "heuristica": 9,
        "criterio": "a mensagem cita 1 campo, 1 causa e 1 correção; 0 dados do formulário são apagados",
    },
    "sem-ajuda": {
        "heuristica": 10,
        "criterio": "ajuda contextual em <= 2 cliques; empty state tem 1 próximo passo",
    },
}

# Se a família da esquerda existe no grupo, a da direita sai.
# A severidade que fica é a maior das duas — uma multa, não a soma.
SUPRIMIR = {
    "excesso-acoes": ("sem-destaque",),
    "feedback-lento": ("status-invisivel",),
    "erro-opaco": ("fim-sem-status",),
    "visual-mesma-funcao": ("sem-destaque",),
}


def _familias():
    out = {}
    for lei, meta in LEIS.items():
        out[meta["familia"]] = {
            "heuristica": meta["heuristica"],
            "lei": lei,
            "criterio": meta["criterio"],
        }
    for familia, meta in NIELSEN_ONLY.items():
        if familia in out:
            raise RuntimeError(f"família repetida: {familia}")
        out[familia] = {
            "heuristica": meta["heuristica"],
            "lei": None,
            "criterio": meta["criterio"],
        }
    return out


FAMILIAS = _familias()


def _round1(value):
    return round(float(value), 1)


def _bucket(penalty):
    return _round1(max(0.0, 10.0 - penalty))


def fix_cabecalho(achado):
    heuristica = achado["heuristica"]
    nome_h = HEURISTICAS[heuristica]
    if achado["lei"]:
        lei = f"{LEIS[achado['lei']]['nome']} — {achado['criterio_numerico']}"
    else:
        lei = "nenhuma — passe Nielsen, sem lei numérica correspondente"
    return (
        f"Lei: {lei}\n"
        f"Heurística de origem: H{heuristica} — {nome_h}\n"
        f"Família: {achado['familia']}\n"
        f"Severidade: {achado['severidade']}\n"
        f"Critério de aceitação numérico: {achado['criterio_numerico']}\n"
    )


def _severidade(raw):
    if "severidade" not in raw:
        raise ValueError("achado sem severidade")
    sev = int(raw["severidade"])
    if sev not in PESO:
        raise ValueError(f"severidade fora de 0..4: {sev}")
    return sev


def merge_findings(findings):
    """Funde rota+selector+família. Severidade repetida vira a maior, não a soma."""
    grouped = {}
    order = []
    for raw in findings:
        familia = raw.get("familia")
        if familia not in FAMILIAS:
            raise ValueError(f"familia desconhecida: {familia}")
        rota = raw.get("rota") or "/"
        selector = (raw.get("selector") or "").strip()
        if not selector:
            evidencia = raw.get("evidencia") or {}
            selector = (evidencia.get("selector") or "").strip()
        if not selector:
            raise ValueError(f"achado sem selector ({familia})")
        key = (rota, selector, familia)
        if key not in grouped:
            order.append(key)
            grouped[key] = []
        grouped[key].append(raw)

    merged = []
    removed = 0
    for key in order:
        group = grouped[key]
        removed += len(group) - 1
        rota, selector, familia = key
        meta = FAMILIAS[familia]
        base = {}
        for item in group:
            for field, value in item.items():
                if field not in base or base[field] in (None, "", [], {}):
                    base[field] = value
            if (item.get("codigo") or {}).get("file"):
                base["codigo"] = item["codigo"]
            if item.get("fix_prompt"):
                base["fix_prompt"] = item["fix_prompt"]
            if len(item.get("titulo") or "") > len(base.get("titulo") or ""):
                base["titulo"] = item["titulo"]
            if len(item.get("descricao") or "") > len(base.get("descricao") or ""):
                base["descricao"] = item["descricao"]
        grupos = [item.get("grupo") for item in group if item.get("grupo")]
        base["rota"] = rota
        base["selector"] = selector
        base["grupo"] = grupos[0] if grupos else selector
        base["familia"] = familia
        base["heuristica"] = meta["heuristica"]
        base["lei"] = meta["lei"]
        base["criterio_numerico"] = meta["criterio"]
        base["severidade"] = max(_severidade(item) for item in group)
        merged.append(base)
    return merged, removed


def _grupo(achado):
    return achado.get("grupo") or achado.get("selector") or ""


def suppress_overlaps(merged):
    """Tira a ficha redundante do mesmo grupo. A que fica herda a pior severidade."""
    by_group = defaultdict(list)
    for achado in merged:
        by_group[(achado["rota"], _grupo(achado))].append(achado)

    drop_ids = set()
    for items in by_group.values():
        by_familia = {}
        for achado in items:
            by_familia.setdefault(achado["familia"], []).append(achado)
        for dominant, victims in SUPRIMIR.items():
            if dominant not in by_familia:
                continue
            dom = by_familia[dominant][0]
            for victim_name in victims:
                for victim in by_familia.get(victim_name, []):
                    dom["severidade"] = max(int(dom["severidade"]), int(victim["severidade"]))
                    drop_ids.add(id(victim))

    kept = [achado for achado in merged if id(achado) not in drop_ids]
    for achado in kept:
        achado["fix_cabecalho"] = fix_cabecalho(achado)
    return kept, len(drop_ids)


def _dedupe_leis(leis_aplicaveis):
    seen = []
    for lei in leis_aplicaveis:
        if lei not in LEIS:
            raise ValueError(f"lei desconhecida: {lei}")
        if lei not in seen:
            seen.append(lei)
    return seen


def score_layers(findings, leis_aplicaveis):
    leis = _dedupe_leis(leis_aplicaveis)
    merged, merged_away = merge_findings(findings)
    unique, suppressed = suppress_overlaps(merged)

    for achado in unique:
        lei = achado["lei"]
        if lei and lei not in leis:
            raise ValueError(
                f"achado da lei {lei} ({achado['familia']}) fora de leis_aplicaveis"
            )

    penalties_h = defaultdict(float)
    penalties_l = defaultdict(float)
    for achado in unique:
        peso = PESO[int(achado["severidade"])]
        penalties_h[achado["heuristica"]] += peso
        if achado["lei"]:
            penalties_l[achado["lei"]] += peso

    por_heuristica = {}
    for numero in range(1, 11):
        por_heuristica[str(numero)] = {
            "score": _bucket(penalties_h[numero]),
            "nome": HEURISTICAS[numero],
        }
    camada_nielsen = _round1(sum(item["score"] for item in por_heuristica.values()))

    por_lei = {}
    for lei in leis:
        por_lei[lei] = {
            "score": _bucket(penalties_l[lei]),
            "nome": LEIS[lei]["nome"],
            "heuristica": LEIS[lei]["heuristica"],
        }
    if leis:
        camada_leis = _round1(sum(item["score"] for item in por_lei.values()) / len(leis) * 10)
    else:
        camada_leis = None

    return {
        "achados": unique,
        "achados_unicos": len(unique),
        "duplicatas_removidas": merged_away + suppressed,
        "camada_nielsen": camada_nielsen,
        "camada_leis": camada_leis,
        "geral": camada_nielsen,
        "por_heuristica": por_heuristica,
        "por_lei": por_lei,
    }


def score_payload(payload):
    if "achados" not in payload or "leis_aplicaveis" not in payload:
        raise ValueError("payload precisa de achados e leis_aplicaveis")
    if not isinstance(payload["achados"], list):
        raise ValueError("achados precisa ser lista")
    if not isinstance(payload["leis_aplicaveis"], list):
        raise ValueError("leis_aplicaveis precisa ser lista")
    return score_layers(payload["achados"], payload["leis_aplicaveis"])


def main(argv=None):
    parser = argparse.ArgumentParser(description="Score de duas camadas do usabilidade-br")
    parser.add_argument("--findings", required=True, help="JSON com leis_aplicaveis e achados")
    args = parser.parse_args(argv)
    try:
        with open(args.findings, encoding="utf-8") as handle:
            payload = json.load(handle)
        result = score_payload(payload)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
