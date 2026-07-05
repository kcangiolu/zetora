"""Pure helpers, kept import-light so they can be unit-tested without
graphiti_core installed."""

from typing import Sequence, TypeVar

T = TypeVar("T")


def paginate_most_recent_first(episodes: Sequence[T], limit: int, offset: int) -> tuple[list[T], int]:
    """Order episodes most-recent-first and slice one page.

    `episodes` is what retrieve_episodes returned (oldest first, at most
    limit+offset items). Returns (page, total_fetched) where total_fetched is
    the number of episodes available up to this page's horizon — NOT the page
    size (that was the old bug) and not the global count, which Graphiti
    can't provide cheaply.
    """
    ordered = list(reversed(list(episodes)))
    return ordered[offset : offset + limit], len(ordered)
