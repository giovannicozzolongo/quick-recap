from src.agents import RECAP_PROMPT


def test_recap_prompt_exists():
    assert len(RECAP_PROMPT) > 50


def test_recap_prompt_has_key_instructions():
    assert "dominant language" in RECAP_PROMPT.lower() or "same language" in RECAP_PROMPT.lower()
    assert "filler" in RECAP_PROMPT.lower() or "repetition" in RECAP_PROMPT.lower()
