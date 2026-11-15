#!/usr/bin/env python3
"""Smoke do usabilidade-br — não chama CLI de modelo.

Trava o contrato do passe de leis: números (44 px, 400 ms, 5 → Mais),
score em duas camadas, dedup, e texto que não copia o material de origem.

    python3 skills/usabilidade-br/tests/smoke_test.py
"""

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(SKILL))

spec = importlib.util.spec_from_file_location(
    "usabilidade_score", os.path.join(SKILL, "score.py")
)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)

failures = []


def check(cond, msg):
    if cond:
        print(f"  ok  {msg}")
    else:
        print(f" FAIL {msg}")
        failures.append(msg)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def section(md, heading):
    parts = re.split(r"\n## ", "\n" + md)
    for part in parts:
        if part.startswith(heading + "\n"):
            return part
    raise AssertionError(f"seção ausente: {heading}")


def parse_leis(md):
    found = {}
    current = None
    for line in md.splitlines():
        if line.startswith("## "):
            current = None
            continue
        matched = re.match(r"- id: ([a-z0-9-]+)\s*$", line)
        if matched:
            current = matched.group(1)
            found[current] = {}
            continue
        if current is None:
            continue
        matched = re.match(r"- (heuristica|familia|aplicavel): (.+)\s*$", line)
        if matched:
            value = matched.group(2).strip()
            if matched.group(1) == "heuristica":
                value = int(value)
            found[current][matched.group(1)] = value
    return found


COPIA_PROIBIDA = (
    "menos opções por tela",
    "botão grande, fácil de tocar",
    "siga padrões que a pessoa conhece",
    "junte o que é relacionado",
    "quebre a informação em blocos",
    "responda em até 0,4 segundo",
    "destaque a ação principal",
    "ação importante perto do dedo",
    "essencial no começo e no fim",
    "capriche no fim do fluxo",
    "mostre o progresso",
    "o sistema faz a parte difícil",
    "deixe a melhor opção marcada",
    "evite o erro antes dele acontecer",
    "erro com explicação e saída",
    "mesma função, mesmo visual",
    "agrupe com fundo ou borda",
    "menos passos até terminar",
    "avançado só quando precisar",
    "mostre que falta pouco",
    "20 leis de ux pra seguir",
    "20 leis de ux pra colar",
    "escolha as 2 ou 3",
)


def achado(familia, severidade, selector="button", rota="/", grupo=None, titulo="t"):
    item = {
        "rota": rota,
        "selector": selector,
        "familia": familia,
        "severidade": severidade,
        "titulo": titulo,
    }
    if grupo:
        item["grupo"] = grupo
    return item


print("== catálogo ==")
check(set(score.LEIS_SEMPRE).isdisjoint(score.LEIS_CONDICIONAIS), "sempre e condicional não se cruzam")
check(
    set(score.LEIS_SEMPRE) | set(score.LEIS_CONDICIONAIS) == set(score.LEIS),
    "toda lei está em sempre ou condicional",
)
check("erro-evitavel" not in {m["familia"] for m in score.LEIS.values()}, "H5 não virou lei")
check("erro-opaco" not in {m["familia"] for m in score.LEIS.values()}, "H9 não virou lei")
check(score.LEIS["fitts"]["criterio"].count("44") == 1, "Fitts cita 44 px")
check("400" in score.LEIS["doherty"]["criterio"], "Doherty cita 400 ms")
check("Mais" in score.LEIS["hick"]["criterio"] and "5" in score.LEIS["hick"]["criterio"], "Hick cita 5 e Mais")

leis_md = read(os.path.join(SKILL, "leis.md"))
parsed = parse_leis(leis_md)
check(set(parsed) == set(score.LEIS), "leis.md e score.py têm os mesmos ids")
for lei, meta in score.LEIS.items():
    bloco = parsed[lei]
    check(bloco.get("heuristica") == meta["heuristica"], f"{lei} heurística bate")
    check(bloco.get("familia") == meta["familia"], f"{lei} família bate")
    esperado = "sempre" if lei in score.LEIS_SEMPRE else "condicional"
    check(bloco.get("aplicavel") == esperado, f"{lei} aplicável = {esperado}")

check("44" in section(leis_md, "Fitts"), "prosa de Fitts tem 44")
check("400" in section(leis_md, "Doherty"), "prosa de Doherty tem 400")
check("Mais" in section(leis_md, "Hick") and "5" in section(leis_md, "Hick"), "prosa de Hick tem 5 e Mais")
for credito in ("Leandro Rezende", "Bold School", "Laws of UX", "lawsofux.com"):
    check(credito in leis_md, f"leis.md credita {credito}")
check("Não copie" in leis_md or "não copie" in leis_md.lower(), "leis.md manda não copiar o arquivo")

print("== score em duas camadas ==")
doherty = achado("feedback-lento", 3, selector="#go", titulo="sem resposta")
duplicado = achado("feedback-lento", 2, selector="#go", titulo="H1 de novo")
so_um = score.score_layers([doherty], ["doherty"])
dois = score.score_layers([doherty, duplicado], ["doherty"])
check(so_um["geral"] == so_um["camada_nielsen"] == 97.0, "sev 3 em H1 deixa o geral em 97")
check(dois["geral"] == 97.0, "duplicata não soma a segunda severidade")
check(dois["duplicatas_removidas"] == 1, "uma duplicata removida")
check(dois["achados_unicos"] == 1, "lista única")
check(dois["achados"][0]["severidade"] == 3, "fica a severidade maior")
check(dois["achados"][0]["lei"] == "doherty", "família fecha a lei")
check(dois["achados"][0]["heuristica"] == 1, "família fecha a heurística")
check("400" in dois["achados"][0]["fix_cabecalho"], "fix cita 400 ms")
check("H1" in dois["achados"][0]["fix_cabecalho"], "fix cita H1")
check("Doherty" in dois["achados"][0]["fix_cabecalho"], "fix cita a lei")
media = round((so_um["camada_nielsen"] + so_um["camada_leis"]) / 2, 1)
check(so_um["geral"] != media, "geral não é a média das camadas")
check(so_um["camada_leis"] == 70.0, "lei única com sev 3 fica em 70")

sempre = list(score.LEIS_SEMPRE)
com_catalogo = score.score_layers([doherty], sempre)
esperado_leis = round((7 + 10 * (len(sempre) - 1)) / len(sempre) * 10, 1)
check(com_catalogo["camada_leis"] == esperado_leis, "lei sem ficha entra como 10 no denominador")
check(com_catalogo["geral"] == 97.0, "catálogo cheio não muda o geral")
check("pico-final" not in com_catalogo["por_lei"], "condicional de fora não entra na média")

par = score.score_layers(
    [
        achado("feedback-lento", 2, selector="#go"),
        achado("alvo-motor", 2, selector="#go"),
    ],
    ["doherty", "fitts"],
)
check(par["achados_unicos"] == 2, "famílias diferentes no mesmo selector não fundem")
check(par["geral"] == 96.0, "duas famílias descontam uma vez cada")
check(par["duplicatas_removidas"] == 0, "nada fundido nesse par")

hick = achado("excesso-acoes", 2, selector="#acoes", grupo="#acoes")
destaque = achado("sem-destaque", 3, selector="#acoes button", grupo="#acoes")
fundido = score.score_layers([hick, destaque], ["hick", "von-restorff"])
check(fundido["achados_unicos"] == 1, "Hick absorve destaque no mesmo grupo")
check(fundido["achados"][0]["familia"] == "excesso-acoes", "a ficha que fica é Hick")
check(fundido["achados"][0]["severidade"] == 3, "herda a pior severidade, sem somar")
check(fundido["geral"] == 97.0, "o grupo desconta 3, não 5")
check(fundido["por_lei"]["von-restorff"]["score"] == 10.0, "Von Restorff não leva a segunda multa")
check(fundido["duplicatas_removidas"] == 1, "supressão conta como duplicata")

solto = score.score_layers(
    [achado("sem-destaque", 2, selector=".cta", grupo=".cta")],
    ["von-restorff"],
)
check(solto["achados_unicos"] == 1, "destaque sem Hick continua")

vazio = score.score_layers([], [])
check(vazio["geral"] == 100.0 and vazio["camada_leis"] is None, "sem leis aplicáveis a camada leis fica nula")

nielsen = score.score_layers([achado("sem-ajuda", 2, selector="a")], [])
check(nielsen["achados"][0]["lei"] is None, "família Nielsen não ganha lei")
check("nenhuma" in nielsen["achados"][0]["fix_cabecalho"], "fix ainda cita o campo lei")
check("2" in nielsen["achados"][0]["criterio_numerico"], "aceite Nielsen também tem número")
check(nielsen["geral"] == 98.0, "sev 2 em H10 deixa o geral em 98")

estouro = score.score_layers(
    [achado("sem-ajuda", 4, selector=str(i)) for i in range(3)],
    [],
)
check(estouro["por_heuristica"]["10"]["score"] == 0.0, "bucket não fica negativo")
check(estouro["geral"] == 90.0, "três catastróficos em H10 tiram 10 no máximo")

try:
    score.score_layers([achado("familia-inventada", 2)], [])
    check(False, "família desconhecida estoura")
except ValueError:
    check(True, "família desconhecida estoura")

try:
    score.score_layers([doherty], [])
    check(False, "lei fora de leis_aplicaveis estoura")
except ValueError:
    check(True, "lei fora de leis_aplicaveis estoura")

print("== cli ==")
payload = {"leis_aplicaveis": ["doherty", "fitts", "hick"], "achados": [doherty, duplicado]}
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
    json.dump(payload, handle)
    payload_path = handle.name
cli = subprocess.run(
    [sys.executable, os.path.join(SKILL, "score.py"), "--findings", payload_path],
    capture_output=True,
    text=True,
)
check(cli.returncode == 0, "cli sai 0")
saida = json.loads(cli.stdout)
check(saida["geral"] == saida["camada_nielsen"] == 97.0, "cli devolve geral = Nielsen")
check(saida["achados_unicos"] == 1, "cli devolve um achado")

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
    json.dump({"leis_aplicaveis": [], "achados": [{"familia": "nope", "severidade": 1, "selector": "a"}]}, handle)
    ruim_path = handle.name
ruim = subprocess.run(
    [sys.executable, os.path.join(SKILL, "score.py"), "--findings", ruim_path],
    capture_output=True,
    text=True,
)
check(ruim.returncode == 1, "cli recusa família desconhecida")

print("== contrato dos docs ==")
skill_md = read(os.path.join(SKILL, "SKILL.md"))
agent_md = read(os.path.join(ROOT, "agents", "usabilidade-br.md"))
design_md = read(os.path.join(SKILL, "DESIGN.md"))
esperado = read(os.path.join(ROOT, "tests", "fixtures", "usabilidade-br", "expected-violations.md"))
readme = read(os.path.join(ROOT, "README.md"))
agents = read(os.path.join(ROOT, "AGENTS.md"))

for familia in score.FAMILIAS:
    check(familia in skill_md, f"SKILL.md nomeia {familia}")
for nome in score.HEURISTICAS.values():
    check(nome in skill_md, f"SKILL.md mantém {nome}")

check("python3 skills/usabilidade-br/score.py" in skill_md, "SKILL manda rodar score.py")
check("leis.md" in skill_md, "SKILL aponta leis.md")
check("camada Nielsen" in skill_md, "SKILL diz que o geral é a camada Nielsen")
check("Não some as duas" in skill_md or "não soma" in skill_md.lower(), "SKILL proíbe somar as camadas")
for credito in ("Leandro Rezende", "Bold School", "Laws of UX"):
    check(credito in skill_md, f"SKILL credita {credito}")

desc = re.search(r"description: \|\n(.*)\nallowed-tools:", skill_md, re.S)
check(desc is not None and len(desc.group(1)) < 1024, "description cabe em 1024 caracteres")
check("44" in skill_md and "400" in skill_md and "Mais" in skill_md, "SKILL cita os três números")

check("score.py" in agent_md and "leis.md" in agent_md, "agent aponta score.py e leis.md")
check("camada" in design_md.lower() and "44" in design_md, "DESIGN cobre as duas camadas e o 44")
check("Leandro Rezende" in readme and "Laws of UX" in readme, "README credita as fontes")
check("score.py" in agents and "leis.md" in agents, "AGENTS.md aponta os arquivos novos")

for trecho in ("feedback-lento", "Doherty", "400", "alvo-motor", "44", "excesso-acoes", "Mais", "sem-bloco"):
    check(trecho in esperado, f"fixture esperada cita {trecho}")
check("Não abrir outra ficha" in esperado, "fixture esperada barra a ficha duplicada de H1")

html = read(os.path.join(ROOT, "tests", "fixtures", "usabilidade-br", "bad-page.html"))
check("box-sizing: border-box" in html and "height: 32px" in html, "botão do fixture mede 32 px")
check("height: 20px" in html, "ícone do fixture mede 20 px")
bloco = re.search(r'id="acoes-iguais".*?</section>', html, re.S)
check(bloco is not None and bloco.group(0).count("<button") == 6, "grupo igual tem 6 ações")
check(bloco is not None and "Mais" not in bloco.group(0), "o grupo de 6 não tem Mais")
check("alert('Erro')" in html and "aria-busy" not in html and "disabled" not in html, "submit não muda de estado")

print("== não copiar a fonte ==")
corpus = "\n".join((skill_md, leis_md, design_md, agent_md, readme, agents, esperado, read(os.path.join(SKILL, "score.py"))))
corpus_cf = corpus.casefold()
for frase in COPIA_PROIBIDA:
    check(frase.casefold() not in corpus_cf, f"não copia: {frase}")

print()
if failures:
    print(f"{len(failures)} falha(s)")
    sys.exit(1)
print("smoke usabilidade-br ok")
