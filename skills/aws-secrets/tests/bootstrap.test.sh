#!/usr/bin/env bash
set -euo pipefail

SKILL_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/tapioca-bootstrap.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/fake-bin" "$TEST_ROOT/prefix"
printf '#!/usr/bin/env bash\necho "aws-cli/2.32.0 Python/3.13 Darwin/24 exe/arm64"\n' > "$TEST_ROOT/fake-bin/aws"
chmod +x "$TEST_ROOT/fake-bin/aws"

OUTPUT=$(PATH="$TEST_ROOT/fake-bin:$PATH" TAPIOCA_PREFIX="$TEST_ROOT/prefix" \
  bash "$SKILL_ROOT/scripts/bootstrap.sh" 2>&1)

test -x "$TEST_ROOT/prefix/bin/tapioca"
"$TEST_ROOT/prefix/bin/tapioca" --help | grep -q "secrets"
grep -q "Tapioca instalado" <<<"$OUTPUT"
grep -q "$TEST_ROOT/prefix/bin" <<<"$OUTPUT"

PATH="$TEST_ROOT/prefix/bin:$TEST_ROOT/fake-bin:$PATH" TAPIOCA_PREFIX="$TEST_ROOT/prefix" \
  bash "$SKILL_ROOT/scripts/bootstrap.sh" >/dev/null

mkdir -p "$TEST_ROOT/collision"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TEST_ROOT/collision/tapioca"
chmod +x "$TEST_ROOT/collision/tapioca"
if PATH="$TEST_ROOT/collision:$TEST_ROOT/fake-bin:$PATH" TAPIOCA_PREFIX="$TEST_ROOT/other-prefix" \
  bash "$SKILL_ROOT/scripts/bootstrap.sh" >/dev/null 2>&1; then
  echo "FAIL: bootstrap sobrescreveu colisão" >&2
  exit 1
fi

echo "PASS bootstrap"
