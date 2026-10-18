"""Bounded test using the user's existing qiaomu-llm credential; secrets stay in memory."""
import json
import pathlib
import subprocess
import sys

skill = pathlib.Path.home() / 'Nutstore Files/.agents/skills/qiaomu-llm/scripts'
if not skill.exists():
    raise SystemExit('This optional local test requires the qiaomu-llm skill and registry.')
sys.path.insert(0, str(skill))
import qiaomu_llm as llm

provider = llm.get_provider(llm.load_registry(llm.DEFAULT_REGISTRY), 'magpie-openai')
llm.ensure_enabled(provider)
secret = llm.resolve_secret(provider)
root = pathlib.Path(__file__).resolve().parent.parent
args = [arg for arg in sys.argv[1:] if arg in ['--post','--connection']]
result = subprocess.run(['node', str(root / 'scripts/live.mjs'), *args], input=json.dumps({'apiKey': secret}), text=True, cwd=root, capture_output=True)
print(result.stdout, end='')
if result.returncode:
    print('Live test failed; no credential or raw provider response was logged.', file=sys.stderr)
raise SystemExit(result.returncode)
