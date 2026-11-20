#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
NODE_VERSION="v24.22.3"
TOOLS_DIR="${PROJECT_DIR}/.tools"

cd "${PROJECT_DIR}"

if command -v node >/dev/null 2>&1; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
else
  MACHINE_ARCH="$(uname -m)"
  case "${MACHINE_ARCH}" in
    arm64)
      NODE_ARCH="darwin-arm64"
      EXPECTED_SHA="1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5"
      ;;
    x86_64)
      NODE_ARCH="darwin-x64"
      EXPECTED_SHA="4daeec962855c1a6e66cda398a25037319dc1bbd4a0939188b3547afbbfb6490"
      ;;
    *)
      echo "Unsupported Mac architecture: ${MACHINE_ARCH}"
      exit 1
      ;;
  esac

  NODE_DIR="${TOOLS_DIR}/node-${NODE_VERSION}-${NODE_ARCH}"
  NODE_ARCHIVE="${TOOLS_DIR}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz"
  if [[ ! -x "${NODE_DIR}/bin/node" ]]; then
    mkdir -p "${TOOLS_DIR}"
    echo "Downloading the verified Node.js runtime…"
    curl -fsSL \
      "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz" \
      -o "${NODE_ARCHIVE}"
    ACTUAL_SHA="$(shasum -a 256 "${NODE_ARCHIVE}" | awk '{print $1}')"
    if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
      echo "Node.js checksum verification failed."
      exit 1
    fi
    tar -xJf "${NODE_ARCHIVE}" -C "${TOOLS_DIR}"
  fi
  NODE_BIN_DIR="${NODE_DIR}/bin"
fi

export PATH="${NODE_BIN_DIR}:/usr/bin:/bin:/usr/sbin:/sbin"

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "Opening Conviction at http://127.0.0.1:5173"
npm run dev
