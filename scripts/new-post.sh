#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTS_DIR="$ROOT_DIR/_posts"
PHOTOS_DIR="$ROOT_DIR/assets/photos"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/new-post.sh
  ./scripts/new-post.sh "제목"
  ./scripts/new-post.sh "제목" "부제목"
  ./scripts/new-post.sh "제목" "부제목" "/path/to/photo.jpg"

Description:
  대화형 입력 또는 인자를 이용해 새 글 포스트를 자동 생성합니다.
EOF
}

sanitize_slug() {
  local input="$1"
  local slug
  slug="$(printf '%s' "$input" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  if [[ -z "$slug" ]]; then
    slug="entry-$(date '+%H%M%S')"
  fi
  printf '%s' "$slug"
}

sanitize_name() {
  local input="$1"
  local cleaned
  cleaned="$(printf '%s' "$input" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  if [[ -z "$cleaned" ]]; then
    cleaned="photo"
  fi
  printf '%s' "$cleaned"
}

escape_yaml_double() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

title="${1:-}"
subtitle="${2:-}"
image_path="${3:-}"

if [[ -z "$title" ]]; then
  read -r -p "제목: " title
fi

if [[ -z "$title" ]]; then
  echo "제목은 필수입니다."
  exit 1
fi

if [[ -z "${2:-}" ]]; then
  read -r -p "부제목(선택): " subtitle
fi

if [[ -z "${3:-}" ]]; then
  read -r -p "사진 경로(선택): " image_path
fi

mkdir -p "$POSTS_DIR" "$PHOTOS_DIR"

today="$(date '+%Y-%m-%d')"
time_for_file="$(date '+%H%M%S')"
timestamp="$(date '+%Y-%m-%d %H:%M:%S %z')"
slug="$(sanitize_slug "$title")"
post_file="$POSTS_DIR/${today}-${slug}.md"

if [[ -f "$post_file" ]]; then
  post_file="$POSTS_DIR/${today}-${slug}-${time_for_file}.md"
fi

cover_line=""
image_markdown=""
title_yaml="$(escape_yaml_double "$title")"
subtitle_yaml="$(escape_yaml_double "$subtitle")"

if [[ -n "$image_path" ]]; then
  if [[ ! -f "$image_path" ]]; then
    echo "사진 파일을 찾을 수 없습니다: $image_path"
    exit 1
  fi

  image_base="$(basename "$image_path")"
  image_name="${image_base%.*}"
  image_ext="${image_base##*.}"
  safe_image_name="$(sanitize_name "$image_name")"
  copied_name="$(date '+%Y%m%d-%H%M%S')-${safe_image_name}.${image_ext}"
  copied_path="$PHOTOS_DIR/$copied_name"
  cp "$image_path" "$copied_path"

  cover_line="cover: /assets/photos/$copied_name"
  image_markdown="![오늘의 사진](/assets/photos/$copied_name)"
fi

{
  echo "---"
  echo "title: \"$title_yaml\""
  if [[ -n "$subtitle" ]]; then
    echo "subtitle: \"$subtitle_yaml\""
  fi
  echo 'category: "일기"'
  echo "date: $timestamp"
  if [[ -n "$cover_line" ]]; then
    echo "$cover_line"
  fi
  echo "---"
  echo
  echo "오늘 하루를 기록해보세요."
  echo
  if [[ -n "$image_markdown" ]]; then
    echo "$image_markdown"
    echo
  fi
  echo "## 오늘의 메모"
  echo
  echo "- 좋았던 순간:"
  echo "- 감사한 일:"
  echo "- 내일의 한 가지 목표:"
} > "$post_file"

echo "포스트 생성 완료:"
echo "  $post_file"
if [[ -n "$image_markdown" ]]; then
  echo "사진도 assets/photos에 복사했습니다."
fi
echo
echo "다음 단계:"
echo "  1) 파일 열어서 내용 보강"
echo "  2) bundle exec jekyll serve --host 127.0.0.1 --port 4001"
