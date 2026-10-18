# Qiaomu Banbot

- Read qiaomu-dev-skill and references/ui.md, native-helper.md, hunt.md, ship.md before extension/release work.
- If available, use personal skills from ~/Nutstore Files/.agents/skills; these are optional local maintainer tools, not build dependencies.
- Never automate WeChat/Weixin or embedded WeChat pages.
- Never commit credentials or user browsing data. Read local test credentials into the test process only through qiaomu-llm.
- Jev uses /v1/systemone with state + questions, not chat completions.
- AI authorship is uncertain. Fail open on unknown/invalid responses; never infer an account is a bot from one reply.
- Never automatically block an X account. User-initiated X actions stop at X's own confirmation.
- Test code, rendered fixtures, actual extension runtime, model calls, and real X behavior are separate acceptance boundaries.

Commands: npm test; npm run build; npm run package; npm run preview; npm run test:live.
