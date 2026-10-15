#!/bin/bash
# usage: send.sh <dir> <n> <jsfile>
# Appends one JS snippet (joined to a single line — no // comments) to <dir>/in<n>.txt,
# which a persistent `tail -f in<n>.txt | aside repl --account u<n> > out<n>.txt` session reads,
# then waits for the next [ok|error] marker in out<n>.txt and prints the new output.
D="$1"; IN="$D/in$2.txt"; OUT="$D/out$2.txt"
n=$(grep -c -E '\[(ok|error) \|' "$OUT")
tr '\n' ' ' < "$3" >> "$IN"; echo >> "$IN"
for i in $(seq 1 300); do
  m=$(grep -c -E '\[(ok|error) \|' "$OUT"); [ "$m" -gt "$n" ] && break; sleep 1
done
awk -v n="$n" 'BEGIN{c=0} {if(c>=n) print} /\[(ok|error) \|/{c++}' "$OUT" | sed 's/\x1b\[[0-9;]*m//g'
