.PHONY: serve test lint format

serve:
	uvicorn src.api.main:app --reload --port 8001

test:
	pytest tests/ -v

lint:
	ruff check src/

format:
	ruff format src/
