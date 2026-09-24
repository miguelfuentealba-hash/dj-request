#!/bin/zsh
# Doble clic para arrancar DJ Request
cd "$(dirname "$0")"
( sleep 1.5; open "http://localhost:8095/dj"; open "http://localhost:8095/qr" ) &
node server.js
