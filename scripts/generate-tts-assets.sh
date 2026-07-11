#!/bin/sh
# Generate the time-announcement word sprites (issues #17, #24).
#
# Renders the words needed to speak any quarter-hour time with macOS
# text-to-speech robot voices, converted to small mono 22.05kHz WAVs under
# public/audio/tts/<voice>/<word>.wav. Requires macOS (say + afconvert).
# Re-run only when adding voices or words; the WAVs are committed.
#
# The base set (#17) speaks 12-hour times (one..twelve + o'clock + quarters).
# The extended set (#24) adds the 24-hour hour vocabulary — "zero" plus
# "thirteen".."twenty-three" — so announcements can honour the OS 24-hour
# preference (hour 15 reuses the existing "fifteen" minute sprite).
set -eu

cd "$(dirname "$0")/.."
OUT_ROOT="public/audio/tts"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# voice-dir:macos-voice pairs. "hal" (now surfaced as "Big Robot") uses Ralph;
# "daniel" is the movie-accurate HAL 9000 — a calm, natural baritone (#40).
VOICES="zarvox:Zarvox fred:Fred hal:Ralph daniel:Daniel"
# Measured HAL delivery (words per minute); default say rate is ~175.
HAL_SAY_RATE=155
# Movie-accurate HAL: unhurried but not sedated.
DANIEL_SAY_RATE=150

# word-id:spoken-text pairs (word ids are the filenames the app requests)
WORDS="its:It's one:one two:two three:three four:four five:five six:six seven:seven
eight:eight nine:nine ten:ten eleven:eleven twelve:twelve
fifteen:fifteen thirty:thirty fortyfive:forty-five oclock:o'clock
zero:zero thirteen:thirteen fourteen:fourteen sixteen:sixteen
seventeen:seventeen eighteen:eighteen nineteen:nineteen twenty:twenty
twentyone:twenty-one twentytwo:twenty-two twentythree:twenty-three"

for voice_pair in $VOICES; do
  dir=${voice_pair%%:*}
  voice=${voice_pair#*:}
  mkdir -p "$OUT_ROOT/$dir"
  for word_pair in $WORDS; do
    word=${word_pair%%:*}
    text=${word_pair#*:}
    aiff="$TMP/$dir-$word.aiff"
    wav="$OUT_ROOT/$dir/$word.wav"
    if [ "$dir" = "hal" ]; then
      say -v "$voice" -r "$HAL_SAY_RATE" -o "$aiff" "$text"
    elif [ "$dir" = "daniel" ]; then
      say -v "$voice" -r "$DANIEL_SAY_RATE" -o "$aiff" "$text"
    else
      say -v "$voice" -o "$aiff" "$text"
    fi
    afconvert -f WAVE -d LEI16@22050 -c 1 "$aiff" "$wav"
    printf '%s/%s: %s bytes\n' "$dir" "$word" "$(wc -c < "$wav" | tr -d ' ')"
  done
done
