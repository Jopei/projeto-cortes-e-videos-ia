"""Deterministic first line of defence against IP infringement in generated
stories (plano §6: "blocklist de IP é blocker"). The LLM is also told to be
100% original, but a plain word-boundary match on well-known protected
franchises/characters is cheap and catches the obvious cases. Not meant to
be exhaustive — extend `BLOCKED_TERMS` as needed (matching is accent- and
case-insensitive, on whole words/phrases).
"""

from __future__ import annotations

import re
import unicodedata

BLOCKED_TERMS: tuple[str, ...] = (
    # Studios / mascots
    "disney", "pixar", "mickey mouse", "minnie mouse", "donald duck", "pato donald", "goofy", "pateta",
    "simba", "mufasa", "rapunzel", "moana", "buzz lightyear",
    # Marvel / DC
    "marvel", "avengers", "vingadores", "iron man", "homem de ferro", "captain america", "capitao america",
    "hulk", "spider-man", "spiderman", "homem-aranha", "homem aranha", "black panther",
    "pantera negra", "thanos", "deadpool", "wolverine", "x-men", "guardioes da galaxia",
    "batman", "superman", "wonder woman", "mulher maravilha", "flash gordon",
    "aquaman", "justice league", "liga da justica",
    # Fantasy / sci-fi franchises
    "harry potter", "hogwarts", "voldemort", "dumbledore", "hermione", "gandalf", "frodo", "mordor",
    "senhor dos aneis", "lord of the rings", "hobbit", "game of thrones", "guerra dos tronos",
    "star wars", "jedi", "darth vader", "luke skywalker", "yoda", "stormtrooper", "star trek", 
    "terminator", "exterminador do futuro", "jurassic park", "jurassic world",
    "narnia", "percy jackson", "crepusculo", "hunger games", "jogos vorazes",
    # Games / anime
    "pokemon", "pikachu", "mario bros", "super mario", "zelda", "sonic the hedgehog",
    "minecraft", "fortnite", "league of legends", "overwatch", "final fantasy", "kratos",
    "naruto", "sasuke", "goku", "dragon ball", "luffy", "attack on titan", "shingeki",
    "death note", "sailor moon", "evangelion", "my hero academia", "demon slayer", "jujutsu kaisen",
    # Other characters / brands
    "sherlock holmes", "james bond", "007", "indiana jones", "transformers", "optimus prime", "power rangers",
    "shrek", "scooby-doo", "scooby doo", "bob esponja", "spongebob", "peppa pig", "turma da monica",
    "stranger things", "breaking bad", "the witcher", "geralt de rivia", "squid game", "round 6",
)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.lower()).strip()


def _compile(terms: tuple[str, ...]) -> list[tuple[str, re.Pattern[str]]]:
    return [
        (term, re.compile(rf"(?<![0-9a-z]){re.escape(_normalize(term))}(?![0-9a-z])"))
        for term in terms
    ]


_PATTERNS = _compile(BLOCKED_TERMS)


def find_blocked_terms(text: str | None, extra_terms: tuple[str, ...] = ()) -> list[str]:
    """Return the blocklist entries found in `text` (empty list = clean)."""
    if not text:
        return []
    normalized = _normalize(text)
    found = [term for term, pattern in _PATTERNS if pattern.search(normalized)]
    for term, pattern in _compile(extra_terms):
        if pattern.search(normalized):
            found.append(term)
    return found
