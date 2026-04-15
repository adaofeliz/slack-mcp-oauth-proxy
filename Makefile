.PHONY: dev build start test test-watch typecheck lint format docker-up docker-down docker-logs clean

dev:
	npx tsx watch src/index.ts

build:
	npm run build

start:
	node dist/index.js

test:
	npx vitest run

test-watch:
	npx vitest

typecheck:
	npx tsc --noEmit -p tsconfig.test.json

lint:
	npx eslint src/ tests/

format:
	npx prettier --write src/ tests/

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

clean:
	rm -rf dist/ node_modules/
