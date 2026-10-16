#!/bin/sh
# Popula toda a demo (requer DEMO_PW e DEMO_DIR). Usuarios criados antes por 01_users.py.
set -e
cd "$(dirname "$0")"
python3 -u 03_seed_cortes.py
python3 -u 04_analyze.py | tail -3
python3 -u 05_seed_serie.py | tail -4
sh 05b_shift_ep2.sh
python3 -u 06_seed_pubs.py | tail -3
python3 -u 07_seed_blocked.py
python3 -u 08_seed_bruno.py
