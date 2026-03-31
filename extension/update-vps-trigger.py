#!/usr/bin/env python3
"""
Run this on the VPS to add Aljex cookie + DAT cookies endpoints to tl-trigger.py
"""
import re

f = "/root/scripts/tl-trigger.py"
content = open(f).read()

# Add new endpoint handlers before the existing update-dat-token handler
new_endpoints = '''
        # Handle Aljex full cookie string sync
        if path == "/update-aljex-cookie":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                cookie_str = body.get("cookie", "")
                cookies_list = body.get("cookies", [])
                
                env_path = "/root/.truckinglane-dat.env"
                env = open(env_path).read()
                
                # Update ALJEX_COOKIE
                if "ALJEX_COOKIE=" in env:
                    env = re.sub(r"ALJEX_COOKIE=.*", f"ALJEX_COOKIE={cookie_str}", env)
                else:
                    env += f"\\nALJEX_COOKIE={cookie_str}"
                
                # Also save individual cookies as JSON
                import json as json_mod
                cookies_path = "/root/.aljex-cookies.json"
                with open(cookies_path, "w") as cf:
                    json_mod.dump(cookies_list, cf)
                
                open(env_path, "w").write(env)
                ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "updated": ts}).encode())
            except Exception as e:
                self.send_response(400)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        # Handle DAT cookies sync (fallback when no tab open)
        if path == "/update-dat-cookies":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                cookies = body.get("cookies", "")
                
                env_path = "/root/.truckinglane-dat.env"
                env = open(env_path).read()
                
                if "DAT_COOKIES=" in env:
                    env = re.sub(r"DAT_COOKIES=.*", f"DAT_COOKIES={cookies}", env)
                else:
                    env += f"\\nDAT_COOKIES={cookies}"
                
                open(env_path, "w").write(env)
                ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "updated": ts}).encode())
            except Exception as e:
                self.send_response(400)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

'''

# Insert before the existing update-dat-token handler
if "/update-dat-token" in content and new_endpoints.strip() not in content:
    content = content.replace(
        '        # Handle DAT token update',
        new_endpoints + '        # Handle DAT token update'
    )
    open(f, "w").write(content)
    print("✅ New endpoints added to tl-trigger.py")
else:
    print("⚠️ Could not find insertion point or already added")
    print("Looking for '# Handle DAT token update' in file...")
    if "# Handle DAT token update" in content:
        print("Found it - may already be updated")
    else:
        print("Pattern not found - manual edit needed")
