import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from helpers import paginate_most_recent_first


def test_orders_most_recent_first():
    page, total = paginate_most_recent_first([1, 2, 3, 4], limit=10, offset=0)
    assert page == [4, 3, 2, 1]
    assert total == 4


def test_total_is_fetched_count_not_page_size():
    # The old bug: total reported the page size (2) instead of what was fetched.
    page, total = paginate_most_recent_first(list(range(10)), limit=2, offset=0)
    assert page == [9, 8]
    assert total == 10


def test_offset_slices_after_reversal():
    page, total = paginate_most_recent_first([1, 2, 3, 4, 5], limit=2, offset=2)
    assert page == [3, 2]
    assert total == 5


def test_empty_input():
    page, total = paginate_most_recent_first([], limit=5, offset=0)
    assert page == []
    assert total == 0
