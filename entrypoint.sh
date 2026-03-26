#!/bin/sh
# Stamp git revision at container startup
REV="${GIT_REV:-dev}"
SHORT="$(echo "$REV" | cut -c1-7)"
# Replace build placeholders (covers script tags, sw.js cache name, css links, version display)
find /usr/share/nginx/html -name '*.html' -o -name '*.js' | \
  xargs sed -i \
    -e "s/__BUILD_SHORT__/${SHORT}/g" \
    -e "s/__BUILD_HASH__/${REV}/g"
# Stamp ES module imports that don't already have a query string
find /usr/share/nginx/html -name '*.js' | \
  xargs sed -i "s/\(from\s*[\"'][^\"']*\.js\)\([\"']\)/\1?v=${REV}\2/g"

exec nginx -g "daemon off;"
