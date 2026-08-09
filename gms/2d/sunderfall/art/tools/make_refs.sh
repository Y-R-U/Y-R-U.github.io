#!/bin/sh
# Regenerate the five blind-test comparison frames in refs/ours/.
#
# The filenames MUST stay exactly as they are: the lab pairs refs/ours/<name> against
# refs/levels/<name>, and the blind test is only meaningful if it is re-run against the
# same references. Which location stands in for which reference was set in round 1;
# do not reshuffle it either.
set -e
cd "$(dirname "$0")/../.."

render() {   # <ref-name> <location> <camX>
  node art/tools/scene.js "$2" "art/work/ours_$1.png" --scale 1 --cam "$3" >/dev/null
  sips -s format jpeg -s formatOptions 88 "art/work/ours_$1.png" --out "refs/ours/$1.jpg" >/dev/null
  echo "refs/ours/$1.jpg  <-  $2 cam $3"
}

render ori_wotw_00      sunderwood  700
render hollowknight_01  sunderwood  250
render blasphemous2_02  ruinreach   700
render thelastfaith_00  glyphglade  700
render deadcells_04     thornmere   700
