"""Structural checks, not a substitute for UI or business acceptance tests."""
import ast
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors = []


class CheckHTML(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.viewport = False
        self.lang = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'html' and attrs.get('lang'):
            self.lang = True
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and urlsplit(attrs.get('href', '')).scheme:
            errors.append(f'{self.path}: remote stylesheet')
        if tag == 'meta' and attrs.get('name') == 'viewport':
            self.viewport = True
        for name in ('href', 'src'):
            value = attrs.get(name)
            if not value or value.startswith('#'):
                continue
            url = urlsplit(value)
            if url.scheme or url.netloc:
                if name == 'src':
                    errors.append(f'{self.path}: remote dependency {value}')
                continue
            target = self.path.parent / unquote(url.path)
            if not target.exists():
                errors.append(f'{self.path}: missing link {value}')


for name in ['AGENTS.md', 'CLAUDE.md', 'README.md', 'readme.html', 'DESIGN.md', 'designs.md', 'memory/STATE.md', 'knowledge/INDEX.md', '_work/TEMPLATE.md', 'prompts/README.md']:
    if not (ROOT / name).is_file():
        errors.append('Missing ' + name)
for path in (ROOT / 'scripts').glob('*.py'):
    ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
for path in [ROOT / 'readme.html', * (ROOT / '_work').rglob('*.html')]:
    if path.exists():
        parser = CheckHTML(path)
        parser.feed(path.read_text(encoding='utf-8'))
        if not parser.viewport:
            errors.append(f'{path}: missing viewport')
        if not parser.lang:
            errors.append(f'{path}: missing language')
if errors:
    raise SystemExit('\n'.join(errors))
print('PASS: required files, Python syntax, HTML local links, lang/viewport, src and stylesheet checks. This is not browser or comprehensive network/security verification.')
