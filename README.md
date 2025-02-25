# DQ Break Records Application

A data quality front-end for viewing break records (rule violations) and summary rule health metrics built with React, TypeScript, Vite, and Flask.  This is intended to be run with a Collibra DQ instance metastore instance.  This is for explaining the linkId concept and examples of common summary visualizations.

## Project Structure
```
.
├── project/                 # Main application directory
│   ├── src/                # Frontend source code
│   │   ├── components/     # React components
│   │   └── server/        # Flask backend
│   ├── public/            # Static assets
│   ├── index.html         # Entry HTML file
│   ├── vite.config.ts     # Vite configuration
│   ├── package.json       # Node.js dependencies
│   └── tsconfig.json      # TypeScript configuration
├── Dockerfile             # Docker configuration
├── requirements.txt       # Python dependencies
└── .env                   # Environment variables
```

## Prerequisites
- Node.js v18.17.0
- Python 3.12.4
- Docker (optional)

## Environment Variables
Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
DATABASE_URL=your_database_url
DATABASE_NAME=your_database_name
DATABASE_USERNAME=your_username
DATABASE_PASSWORD=your_password
DATABASE_TENANT=your_tenant

# Flask Configuration
FLASK_APP=src/server/app.py
FLASK_ENV=development
```

## Local Development Setup

1. Clone the repository:
```bash
git clone https://github.com/mearnsb/dq-break-records.git
cd dq-break-records
```

2. Install Python dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

3. Install Node.js dependencies:
```bash
cd project
npm install
```

4. Start the development servers:
```bash
# In the project directory
npm run dev
```

This will start both:
- Flask backend on http://localhost:5001
- Vite dev server on http://localhost:5173

## Docker Setup

1. Build the Docker image:
```bash
docker build -t dq-break-records .
```

2. Run the container:
```bash
docker run -p 5001:5001 -p 5173:5173 dq-break-records
```

Note: For Docker, you can modify CORS in app.py and vite.config.ts to allow for localhost:5173 and localhost:5001 to access the API.

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5001

## API Endpoints

### GET /api/datasets
Retrieves available datasets.
- Query Parameters:
  - days: Number of days to look back (default: 1)

### GET /api/datasets/parse
Parses specific dataset information.
- Query Parameters:
  - dataset: Dataset name
  - page: Page number (default: 1)
  - pageSize: Items per page (default: 100)
  - days: Number of days to look back (default: 1)

### GET /api/dashboard/health
Retrieves dashboard health metrics.
- Query Parameters:
  - days: Number of days to analyze (default: 2)

## Development

### Frontend Development
The frontend is built with:
- React 18
- TypeScript
- Vite
- Tailwind CSS

### Backend Development
The backend uses:
- Flask
- pandas
- psycopg2 for PostgreSQL connection

## Environment Variables Explained

### Database Configuration
- `DATABASE_URL`: PostgreSQL database URL (e.g., "35.191.162.34")
- `DATABASE_NAME`: Name of the database (e.g., "dev")
- `DATABASE_USERNAME`: Database user with appropriate permissions
- `DATABASE_PASSWORD`: Database user password
- `DATABASE_TENANT`: Database tenant (e.g., "public")

### Flask Configuration
- `FLASK_APP`: Path to the Flask application (default: src/server/app.py)
- `FLASK_ENV`: Environment mode (development/production)

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Troubleshooting

### Common Issues

1. Port conflicts:
   - Ensure ports 5001 and 5173 are not in use
   - Change ports in vite.config.ts and app.py if needed

2. Database connection:
   - Verify .env variables are correct
   - Check database accessibility from your network

3. Node.js/Python version mismatches:
   - Use nvm or pyenv to manage versions
   - Match versions specified in prerequisites
