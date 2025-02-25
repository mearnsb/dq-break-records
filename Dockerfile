FROM python:3.12-slim

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    python3-dev \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g n \
    && n 18.17.0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create and activate virtual environment
ENV VIRTUAL_ENV=/app/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Upgrade pip
RUN pip install --upgrade pip

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the project directory first
COPY project /app/project

# Set working directory to the project directory for Node.js
WORKDIR /app/project

# Install Node.js dependencies (including dev dependencies for Cloud Run)
RUN npm install --include=dev

# Copy the rest of the application
COPY . /app

# Expose ports for both services
EXPOSE 5001 5173

# Set production environment variables
ENV NODE_ENV=production
ENV FLASK_ENV=production

# Start both services using npm
CMD ["npm", "run", "dev"] 