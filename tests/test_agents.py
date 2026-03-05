from src.agents import ANALYZERS


def test_all_analyzers_defined():
    expected = {"summary", "key_points", "action_items", "questions", "quiz"}
    assert set(ANALYZERS.keys()) == expected


def test_analyzers_have_required_fields():
    for key, agent in ANALYZERS.items():
        assert "label" in agent, f"{key} missing label"
        assert "icon" in agent, f"{key} missing icon"
        assert "prompt" in agent, f"{key} missing prompt"
        assert len(agent["prompt"]) > 20, f"{key} prompt too short"
