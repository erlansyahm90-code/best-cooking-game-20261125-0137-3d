# shots.py -- headless smoke test, autoplay full serve cycle, and the 4
# screenshots for Junction Kitchen 3D. Run from the repo root:
#   ~/workspace/.venv-scrapling/bin/python tests/shots.py
import json
import os
import subprocess
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = [
    ("1-cover.jpg", "?scene=cover"),
    ("2-chop.jpg", "?scene=chop"),
    ("3-stove.jpg", "?scene=stove"),
    ("4-serve.jpg", "?scene=serve"),
]

AUTOPLAY = """
() => {
  const JK = window.JK;
  const log = [];
  const S = () => JK.state();
  JK.newGame();
  JK.setRealtime(false); // scripted clock only — no real-time drift
  JK.spawnOrder({recipeId: 'station-burger', passenger: 'santai'});
  const step = (n) => { for (let i = 0; i < n; i++) JK.step(0.5); };
  // Pantry: bread + lettuce (2 hands)
  JK.setChef(-5.3, -1.8); JK.interact();
  JK.pickIngredient('bread'); JK.pickIngredient('lettuce');
  log.push('hands after pantry: ' + JSON.stringify(S().chef.hands.map(h => h && h.ing)));
  // Chop lettuce at the board
  JK.setChef(-2.7, -1.8); JK.interact();
  step(6); // chop 2.0s
  log.push('lettuce chopped: ' + JSON.stringify(S().chef.hands[1]));
  // Plate the bread (raw, ready)
  JK.setChef(3.0, -1.8); JK.interact();
  step(5); // plate 1.8s
  log.push('plates: ' + JSON.stringify(S().plates.map(p => p.components.map(c => c.ing + ':' + c.done))));
  // Pantry: patty -> stove, cook to perfect zone
  JK.setChef(-5.3, -1.8); JK.interact(); JK.pickIngredient('patty');
  JK.setChef(0.1, -1.8); JK.interact();
  step(8); // 4s of 8s cook -> progress 0.5 (perfect zone)
  log.push('burner: ' + JSON.stringify(S().burners[0]));
  JK.interact(); // take the patty out (empty hands)
  log.push('patty in hand: ' + JSON.stringify(S().chef.hands));
  // Plate patty, then lettuce
  JK.setChef(3.0, -1.8); JK.interact(); step(5);
  JK.setChef(3.0, -1.8); JK.interact(); step(5);
  log.push('readyPlates: ' + JSON.stringify(S().readyPlates));
  // Serve at the window (plate flies to the passenger, ~0.9s), then coins land
  JK.setChef(5.6, -0.6); JK.interact();
  step(3);
  log.push('coins: ' + S().coins + ' serves: ' + S().serves + ' combo: ' + S().combo);
  return { log, coins: S().coins, serves: S().serves, errors: window.__errors || [] };
}
"""


def main():
    sys.path.insert(0, os.path.expanduser("~/.venv-scrapling/lib/python3.12/site-packages"))
    from patchright.sync_api import sync_playwright

    server = subprocess.Popen(
        ["node", "serve.ts"], cwd=REPO,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[
                "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                "--no-sandbox",
            ])
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto("http://localhost:8080/", wait_until="load")
            # Plain quiet wait: polling evaluates starve the module here.
            page.wait_for_timeout(4000)
            if not page.evaluate("() => typeof window.JK !== 'undefined'"):
                print("JK missing after quiet wait; forcing module check:",
                      page.evaluate("() => import('/js/main.js').then(() => 'OK cached', e => 'REJECTED: ' + (e && e.message))"))
                page.wait_for_timeout(1000)
            page.wait_for_timeout(1000)
            page.evaluate("() => { window.__errors = []; window.addEventListener('error', e => window.__errors.push(e.message)); }")
            has_jk = page.evaluate("() => !!window.JK")
            print("JK hook:", has_jk)
            print("JK typeof right before autoplay:", page.evaluate("() => typeof window.JK"))
            print("JK keys:", page.evaluate("() => window.JK ? Object.keys(window.JK) : null"))
            print("page url:", page.url)
            webgl = page.evaluate("() => { const c = document.getElementById('gl'); return !!c.getContext('webgl'); }")
            print("WebGL:", webgl)

            # Autoplay full serve cycle
            result = page.evaluate(AUTOPLAY)
            for line in result["log"]:
                print("  ", line)
            print("AUTOPLAY coins:", result["coins"], "serves:", result["serves"])
            assert result["coins"] > 0 and result["serves"] == 1, "autoplay failed to serve"
            print("AUTOPLAY: PASS")

            # Screenshots (fresh page per scene for a clean state)
            for name, query in SHOTS:
                pg = browser.new_page(viewport={"width": 1280, "height": 720})
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto("http://localhost:8080/" + query, wait_until="load")
                pg.wait_for_timeout(4000)
                if not pg.evaluate("() => typeof window.JK !== 'undefined'"):
                    pg.evaluate("() => import('/js/main.js').then(() => 'OK', e => 'ERR:' + (e && e.message))")
                    pg.wait_for_timeout(1000)
                pg.wait_for_timeout(1000)
                path = os.path.join(REPO, "screenshots", name)
                pg.screenshot(path=path, type="jpeg", quality=88)
                size = os.path.getsize(path)
                print(f"SHOT {name}: {size} bytes {'OK' if size <= 262144 else 'TOO BIG'}")
                assert size <= 262144, f"{name} over 256 KiB"
                pg.close()
            print("CONSOLE/PAGE ERRORS:", json.dumps(errors, indent=2) if errors else "none")
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)
    print("ALL SHOTS DONE")


if __name__ == "__main__":
    main()
