FROM nginx:alpine

# Create cache directory for Plausible proxy
RUN mkdir -p /var/run/nginx-cache/jscache && \
    chown -R nginx:nginx /var/run/nginx-cache

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static files
COPY web /usr/share/nginx/html

# Stamp build date at build time
RUN DATE="$(date -u +%Y-%m-%d)" && \
    find /usr/share/nginx/html -name '*.html' | \
      xargs sed -i "s/__BUILD_DATE__/${DATE}/g"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
