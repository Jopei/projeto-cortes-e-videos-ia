#!/bin/sh
# Gera videos SINTETICOS (sem conteudo de terceiros) dentro do container worker, em /tmp/demo.
# Uso: docker compose exec -T worker sh < 02_make_videos.sh
set -e
mkdir -p /tmp/demo && cd /tmp/demo
FONT=$(fc-list 2>/dev/null | head -1 | cut -d: -f1); [ -z "$FONT" ] && FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
mk() { # nome titulo cor1 cor2 cor3 freq
  n=$1; t=$2; i=0; : > list_$n.txt
  for seg in 1 2 3 4 5 6; do
    case $seg in 1) a=$3;b=$4;; 2) a=$4;b=$5;; 3) a=$5;b=$3;; 4) a=$4;b=$3;; 5) a=$5;b=$4;; 6) a=$3;b=$5;; esac
    ffmpeg -y -loglevel error -f lavfi -i "gradients=s=1280x720:d=14:speed=0.07:c0=$a:c1=$b:x0=0:y0=0:x1=1280:y1=720:rate=30" \
      -f lavfi -i "aevalsrc='0.35*sin(2*PI*$6*t)*(0.5+0.5*sin(2*PI*t/($seg+2)))+0.25*sin(2*PI*($6*3)*t)*lt(mod(t,7),1.2)':s=44100:d=14" \
      -vf "drawbox=x='100+80*t*$seg':y=300:w=140:h=140:color=white@0.35:t=fill,drawtext=fontfile=$FONT:text='CENA $seg':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=150:shadowx=3:shadowy=3" \
      -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k seg_${n}_$seg.mp4
    echo "file seg_${n}_$seg.mp4" >> list_$n.txt
  done
  ffmpeg -y -loglevel error -f concat -i list_$n.txt -c copy $n.mp4; rm seg_${n}_*.mp4
}
mk sintel "Sintel (demo)" 0x1e1b4b 0xf97316 0x0ea5e9 196
mk farol "Farol (demo)" 0x0f172a 0x0891b2 0x7c3aed 261
mk acao "Perseguicao (demo)" 0x7f1d1d 0xf59e0b 0x111827 330
ls -la /tmp/demo/*.mp4
