#!/bin/sh
set -eu

INSTALL_DIR="${FEATHER_PATCHER_INSTALL_DIR:-$HOME/.local/share/feather-launcher-patcher}"
BIN_DIR="${FEATHER_PATCHER_BIN_DIR:-$HOME/.local/bin}"
SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

prompt_yes_no() {
  question="$1"
  default="${2:-n}"

  if [ ! -t 0 ]; then
    return 1
  fi

  if [ "$default" = "y" ]; then
    suffix="[Y/n]"
  else
    suffix="[y/N]"
  fi

  printf "%s %s " "$question" "$suffix"
  read answer || return 1
  case "$answer" in
    [Yy]|[Yy][Ee][Ss]) return 0 ;;
    [Nn]|[Nn][Oo]) return 1 ;;
    "")
      [ "$default" = "y" ]
      return
      ;;
    *) return 1 ;;
  esac
}

append_dir_to_shell_profile() {
  dir="$1"
  shell_name="$(basename "${SHELL:-sh}")"
  case "$shell_name" in
    zsh) profile="$HOME/.zshrc" ;;
    bash) profile="$HOME/.bashrc" ;;
    *) profile="$HOME/.profile" ;;
  esac

  mkdir -p "$(dirname "$profile")"
  touch "$profile"

  if grep -F "$dir" "$profile" >/dev/null 2>&1; then
    echo "$dir already appears in $profile."
    return 0
  fi

  {
    echo
    echo "export PATH=\"\$PATH:$dir\""
  } >> "$profile"

  echo "Added $dir to $profile."
  echo "Open a new shell or run:"
  echo "  . $profile"
}

find_npm_outside_path() {
  for npm_path in \
    /opt/homebrew/bin/npm \
    /usr/local/bin/npm \
    "$HOME/.nvm/current/bin/npm" \
    "$HOME/.volta/bin/npm" \
    "$HOME/.asdf/shims/npm"
  do
    if [ -x "$npm_path" ]; then
      dirname "$npm_path"
      return 0
    fi
  done

  return 1
}

install_npm() {
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Node.js and npm with Homebrew..."
    brew install node
    return
  fi

  echo "Homebrew is not installed, so npm cannot be installed automatically."
  echo "Install Node.js from https://nodejs.org/ or install Homebrew and run:"
  echo "  brew install node"
}

color() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    printf '\033[%sm%s\033[0m' "$1" "$2"
  else
    printf '%s' "$2"
  fi
}

line() {
  color "38;5;255" "  Feather Utility"
  printf '\n'
  color "38;5;250" "  installer"
  printf '\n'
  color "38;5;245" "  ----------------------------"
  printf '\n\n'
}

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

cp "$SOURCE_DIR/patch-feather.js" "$INSTALL_DIR/patch-feather.js"
cp "$SOURCE_DIR/package.json" "$INSTALL_DIR/package.json"
cp "$SOURCE_DIR/README.md" "$INSTALL_DIR/README.md"
chmod +x "$INSTALL_DIR/patch-feather.js"

ln -sf "$INSTALL_DIR/patch-feather.js" "$BIN_DIR/feather-patcher"

line
color "38;5;250" "installed"
echo " $BIN_DIR/feather-patcher"
echo
echo "Run:"
echo "  feather-patcher"
echo "  feather-patcher patch"
echo "  feather-patcher restore"
echo "  feather-patcher repair"
echo
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "Note: $BIN_DIR is not in PATH for this shell."
    if prompt_yes_no "Add it to your shell PATH now?"; then
      append_dir_to_shell_profile "$BIN_DIR"
    else
      echo "Run directly with:"
      echo "  $BIN_DIR/feather-patcher --help"
    fi
    ;;
esac

if ! command -v npm >/dev/null 2>&1; then
  echo
  if npm_dir="$(find_npm_outside_path)"; then
    echo "Note: npm exists at $npm_dir/npm but is not available in PATH."
    if prompt_yes_no "Add $npm_dir to your shell PATH now?"; then
      append_dir_to_shell_profile "$npm_dir"
    else
      echo "Add $npm_dir to PATH before running npm from this shell."
    fi
  else
    echo "Note: npm is not installed or could not be found."
    if prompt_yes_no "Install Node.js and npm now?"; then
      install_npm
    else
      echo "Install Node.js/npm before running feather-patcher if node is unavailable."
    fi
  fi
fi
