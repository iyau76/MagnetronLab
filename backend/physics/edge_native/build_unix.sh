#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CXX="${CXX:-c++}"
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
    OUT="$SCRIPT_DIR/libedge_core.dylib"
    SHARED_FLAG="-dynamiclib"
else
    OUT="$SCRIPT_DIR/libedge_core.so"
    SHARED_FLAG="-shared"
fi
"$CXX" -O3 -std=c++17 -fPIC -pthread $SHARED_FLAG \
    "$SCRIPT_DIR/edge_core.cpp" -o "$OUT"
echo "Built $OUT"
