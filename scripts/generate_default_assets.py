"""Generate default examples using an isolated cache, from any working directory."""
import json
from pathlib import Path
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[1]

def main():
    sys.path[:0] = [str(ROOT/'backend'/'physics'), str(ROOT/'backend')]
    import service
    from settings import parameters
    from terminal_cache import TerminalCache
    previous = service.CACHE
    output = ROOT/'frontend'/'assets'
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='magnetron_default_assets_') as directory:
        cache = TerminalCache(directory)
        service.CACHE = cache
        try:
            params = parameters({})
            for kind,name in [('point','default_point'),('scan','default_scan')]:
                result = service.execute(kind,params)
                (output/(name+'.json')).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
                print(name,result['engine'],result['elapsed_s'],flush=True)
        finally:
            try:cache.close()
            finally:service.CACHE = previous

if __name__ == '__main__':main()
