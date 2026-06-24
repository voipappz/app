# Base Node image
FROM node:22-bullseye

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /app

# Keep container alive for interactive dev
CMD ["sleep", "infinity"]