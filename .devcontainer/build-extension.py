#!/usr/bin/env python3
"""Build the resolution-lock Guacamole extension JAR from source files.
Runs on the Codespace host via devcontainer initializeCommand."""
import zipfile
import os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'guacamole', 'extensions-src', 'resolution-lock')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'guacamole', 'extensions', 'resolution-lock.jar')

os.makedirs(os.path.dirname(OUT), exist_ok=True)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(SRC, 'guac-manifest.json'), 'guac-manifest.json')
    z.write(os.path.join(SRC, 'js', 'resolution-lock.js'), 'js/resolution-lock.js')

print(f'Built {OUT}')
