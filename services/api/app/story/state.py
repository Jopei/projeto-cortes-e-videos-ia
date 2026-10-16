"""Allowed status transitions for a story series / episode and the single
compare-and-set primitive every state change must go through (plano §3).

`transition()` issues `UPDATE ... WHERE id = :id AND status IN (:expected)`
and requires `rowcount == 1`; two workers racing for the same transition
therefore have exactly one winner, the loser gets `TransitionConflict`.
The statement is flushed (not committed) — the caller owns the transaction,
so the status change commits atomically with whatever else it did.
"""

from __future__ import annotations

from typing import Iterable

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.story import EpisodeStatus as E
from app.models.story import SeriesStatus as S
from app.models.story import StoryEpisode, StorySeries


class StateError(Exception):
    """Base for transition errors."""


class InvalidTransition(StateError):
    """`expected_from -> to` is not in the transition table (programming/request error)."""

    def __init__(self, current, to) -> None:
        self.current = current
        self.to = to
        super().__init__(f"Transition {getattr(current, 'value', current)} -> {getattr(to, 'value', to)} is not allowed")


class TransitionConflict(StateError):
    """The row was not in any of the expected statuses when the UPDATE ran
    (somebody else moved it first, or it was never in that state)."""

    def __init__(self, obj_id, to, expected) -> None:
        self.obj_id = obj_id
        self.to = to
        self.expected = tuple(expected)
        super().__init__(
            f"Could not move {obj_id} to {getattr(to, 'value', to)}: "
            f"not in {[getattr(x, 'value', x) for x in self.expected]}"
        )


SERIES_TRANSITIONS: dict[S, frozenset[S]] = {
    S.PLANNING: frozenset({S.PLANNED, S.PLAN_FAILED, S.CANCELED}),
    S.PLAN_FAILED: frozenset({S.PLANNING, S.CANCELED}),
    S.PLANNED: frozenset({S.PLANNING, S.ACTIVE, S.CANCELED}),
    S.ACTIVE: frozenset({S.PAUSED, S.COMPLETED, S.CANCELED}),
    S.PAUSED: frozenset({S.ACTIVE, S.CANCELED}),
    S.COMPLETED: frozenset(),
    S.CANCELED: frozenset(),
}

# "Intermediate" (not yet approved/scheduled) states that can be invalidated
# by an edit of the previous episode / of the bible.
_STALEABLE = {
    E.PLANNED, E.SCRIPTING, E.VALIDATING, E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL,
    E.GENERATING_MEDIA, E.ASSEMBLING, E.PENDING_REVIEW, E.REJECTED, E.NEEDS_ATTENTION,
}

EPISODE_TRANSITIONS: dict[E, frozenset[E]] = {
    E.PLANNED: frozenset({E.SCRIPTING}),
    E.SCRIPTING: frozenset({E.VALIDATING}),
    E.VALIDATING: frozenset({E.SCRIPT_READY, E.SCRIPTING, E.NEEDS_ATTENTION}),
    # `validating`/`scripting` from the script-review stages = the user edited
    # the script (PUT script) or asked for a new one (regenerate scope=script).
    E.SCRIPT_READY: frozenset({E.AWAITING_SCRIPT_APPROVAL, E.GENERATING_MEDIA, E.VALIDATING, E.SCRIPTING}),
    E.AWAITING_SCRIPT_APPROVAL: frozenset({E.GENERATING_MEDIA, E.VALIDATING, E.SCRIPTING}),
    # `scripting` from the media stages = re-script after a scene/narration failure.
    E.GENERATING_MEDIA: frozenset({E.ASSEMBLING, E.NEEDS_ATTENTION, E.SCRIPTING}),
    E.ASSEMBLING: frozenset({E.PENDING_REVIEW, E.NEEDS_ATTENTION, E.SCRIPTING}),
    E.PENDING_REVIEW: frozenset({E.SCHEDULED, E.APPROVED, E.REJECTED}),
    # `approved` = approved but no publishing slot yet; the tick retries.
    E.APPROVED: frozenset({E.SCHEDULED, E.PENDING_REVIEW}),
    E.SCHEDULED: frozenset({E.PUBLISHED, E.PENDING_REVIEW}),
    E.PUBLISHED: frozenset(),
    # Regenerate (script / media / narration) after reject or failure.
    E.REJECTED: frozenset({E.SCRIPTING, E.GENERATING_MEDIA}),
    E.NEEDS_ATTENTION: frozenset({E.SCRIPTING, E.GENERATING_MEDIA, E.VALIDATING}),
    E.STALE: frozenset({E.SCRIPTING}),
    E.CANCELED: frozenset(),
}
for _s in _STALEABLE:
    EPISODE_TRANSITIONS[_s] = EPISODE_TRANSITIONS[_s] | {E.STALE}
for _s in E:
    if _s not in (E.CANCELED, E.PUBLISHED):
        EPISODE_TRANSITIONS[_s] = EPISODE_TRANSITIONS[_s] | {E.CANCELED}

_TABLES = {StorySeries: SERIES_TRANSITIONS, StoryEpisode: EPISODE_TRANSITIONS}


def can_transition(table: dict, current, to) -> bool:
    return to in table.get(current, frozenset())


def transition(
    db: Session,
    obj: StorySeries | StoryEpisode,
    to,
    expected_from,
    **fields,
):
    """Atomically move `obj` to status `to` iff its current DB status is in
    `expected_from` (a status or an iterable of statuses). Extra `fields`
    are set in the same UPDATE (e.g. `error=None`, `pause_reason="user"`).

    Raises `InvalidTransition` if any expected status can't legally reach
    `to`, `TransitionConflict` if the row isn't in one of them anymore.
    On success the instance is refreshed and the change is flushed.
    """
    model = type(obj)
    table = _TABLES[model]
    expected = tuple([expected_from] if not isinstance(expected_from, Iterable) or isinstance(expected_from, str) else expected_from)
    for current in expected:
        if not can_transition(table, current, to):
            raise InvalidTransition(current, to)
    result = db.execute(
        update(model)
        .where(model.id == obj.id, model.status.in_(expected))
        .values(status=to, **fields)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise TransitionConflict(obj.id, to, expected)
    db.flush()
    db.refresh(obj)
    return obj
