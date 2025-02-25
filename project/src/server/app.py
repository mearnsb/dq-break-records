from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import pandas as pd
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus
from datetime import datetime, timedelta
import time
from concurrent.futures import ThreadPoolExecutor
import asyncio
from functools import partial
import socket
import subprocess

app = Flask(__name__)
# Enable CORS with more explicit settings
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5001",
            "http://127.0.0.1:5001",
            "http://0.0.0.0:5173",
            "http://0.0.0.0:5001",
            "https://dq-break-records-419920739008.us-central1.run.app",
            "http://dq-break-records-419920739008.us-central1.run.app"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": True
    }
})

# Load environment variables
load_dotenv()
print("Environment loaded")

def get_db_connection():
    print("\n=== Database Connection Attempt ===")
    try:
        # Get all environment variables
        db_url = os.getenv('DATABASE_URL')
        db_name = os.getenv('DATABASE_NAME')
        db_user = os.getenv('DATABASE_USERNAME')
        db_pass = os.getenv('DATABASE_PASSWORD')
        
        print("Environment variables loaded:")
        print(f"DATABASE_URL: {db_url}")
        print(f"DATABASE_NAME: {db_name}")
        print(f"DATABASE_USERNAME: {db_user}")
        
        # URL encode the password to handle special characters
        encoded_password = quote_plus(db_pass)
        
        # Create connection string with encoded password
        conn_str = f"postgresql://{db_user}:{encoded_password}@{db_url}:5432/{db_name}"
        print(f"Connection string (masked password): postgresql://{db_user}:****@{db_url}:5432/{db_name}")
        
        # Connect using the full connection string
        connection = psycopg2.connect(conn_str)
        
        # Test the connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
            print("✓ Database connection test successful")
        
        return connection
        
    except Exception as e:
        print("\n=== Database Connection Error ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")
        raise

@app.before_request
def log_request_info():
    print("\n=== Incoming Request ===")
    print(f"URL: {request.url}")
    print(f"Method: {request.method}")
    print(f"Headers: {dict(request.headers)}")
    print(f"Origin: {request.headers.get('Origin', 'No origin')}")
    return None

@app.route('/', methods=['GET'])
def root():
    return "Flask server is running"

@app.route('/api/datasets', methods=['GET'])
def get_datasets():
    print("\n=== GET /api/datasets called ===")
    try:
        # Get days parameter from query string, default to 1
        days = int(request.args.get('days', 1))
        date_threshold = datetime.now() - timedelta(days=days)
        
        print(f"Fetching data for last {days} days (since {date_threshold})")
        
        conn = get_db_connection()
        
        sql = """ with
            li as ( select * from opt_owl where linkid is not null ),
            ro as ( select * from rule_output ),
            lr as ( select max(run_id) as run_id, dataset from rule_output group by dataset ),
            j as ( select distinct ro.dataset, ro.run_id, li.linkid from li
            inner join ro on li.dataset = ro.dataset
            inner join lr on lr.dataset = ro.dataset and lr.run_id = ro.run_id
            where ro.score > 0 
            and ro.dataset in ( 
                select dataset 
                from rule_breaks 
                where run_id >= %s
            )
            order by ro.dataset, ro.run_id ),
            headers AS (
                SELECT string_to_array(linkid, '~|') AS header
                FROM opt_owl
                WHERE dataset = (select dataset from j limit 1 )
            )
            select * from j"""
        
        df = pd.read_sql(sql, conn, params=[date_threshold])
        print(f"Query returned {len(df)} rows")
        
        result = df.to_dict('records')
        conn.close()
        
        return jsonify(result)

    except Exception as e:
        print("\n=== Error in /api/datasets ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/parse', methods=['GET'])
def parse_dataset():
    print("\n=== GET /api/datasets/parse called ===")
    try:
        # Get and validate parameters
        dataset = request.args.get('dataset')
        if not dataset:
            return jsonify({"error": "Dataset parameter is required"}), 400
            
        print(f"Requested dataset: {dataset}")
        
        # Get pagination parameters with validation
        try:
            page = max(1, int(request.args.get('page', 1)))
            page_size = max(1, min(1000, int(request.args.get('pageSize', 100))))  # Limit max page size
            days = max(1, int(request.args.get('days', 1)))
        except ValueError as e:
            return jsonify({"error": f"Invalid pagination parameters: {str(e)}"}), 400
            
        date_threshold = datetime.now() - timedelta(days=days)
        offset = (page - 1) * page_size
        
        print(f"Parameters validated: page={page}, size={page_size}, days={days}")
        
        # Get database connection
        conn = get_db_connection()
        print("Database connected successfully")
        
        try:
            # First verify the dataset exists
            verify_sql = "SELECT COUNT(*) FROM opt_owl WHERE dataset = %s"
            with conn.cursor() as cursor:
                cursor.execute(verify_sql, [dataset])
                if cursor.fetchone()[0] == 0:
                    return jsonify({"error": f"Dataset '{dataset}' not found"}), 404
            
            # Get total count for pagination
            count_sql = """
            SELECT COUNT(*) 
            FROM rule_breaks 
            WHERE dataset = %s 
            AND run_id >= %s limit 1000000
            """
            with conn.cursor() as cursor:
                cursor.execute(count_sql, [dataset, date_threshold])
                total_count = cursor.fetchone()[0]
                print(f"Total records for dataset: {total_count}")
            
            # Get headers
            headers_sql = """
            SELECT string_to_array(linkid, '~|') AS header
            FROM opt_owl
            WHERE dataset = %s
            LIMIT 1
            """
            
            print("Fetching headers...")
            headers_df = pd.read_sql(headers_sql, conn, params=[dataset])
            if len(headers_df) == 0:
                return jsonify({"error": f"No headers found for dataset '{dataset}'"}), 404
                
            headers = headers_df.iloc[0]['header']
            print(f"Found headers: {headers}")
            
            # Build the dynamic query
            try:
                column_expressions = [
                    f"d.value[{i+1}] AS {col.strip()}"  # Strip whitespace from column names
                    for i, col in enumerate(headers)
                    if col.strip()  # Skip empty column names
                ]
                columns_sql = ", ".join(column_expressions)
                
                parse_sql = f"""
                WITH values AS (
                    SELECT dataset, run_id, rule_nm,
                    string_to_array(link_id, '~|') AS value
                    FROM rule_breaks 
                    WHERE dataset = %s
                    AND run_id >= %s
                    ORDER BY run_id DESC
                    LIMIT %s OFFSET %s
                )
                SELECT dataset, run_id, rule_nm, {columns_sql}
                FROM values d
                """
                
                print("Executing parse query...")
                print("SQL Parameters:", [dataset, date_threshold, page_size, offset])
                
                # Execute the parse query
                df = pd.read_sql(parse_sql, conn, params=[
                    dataset, 
                    date_threshold,
                    page_size,
                    offset
                ])
                
                print(f"Query returned {len(df)} rows")
                if len(df) > 0:
                    print("Sample row:", df.iloc[0].to_dict())
                
            except Exception as e:
                print("Error in query execution:")
                print(str(e))
                raise
                
            # Store both queries for debugging
            list_query = """
            WITH li AS ( 
                SELECT * FROM opt_owl WHERE linkid is not null 
            ),
            ro AS ( 
                SELECT * FROM rule_output 
            ),
            lr AS ( 
                SELECT max(run_id) as run_id, dataset 
                FROM rule_output 
                GROUP BY dataset 
            ),
            j AS ( 
                SELECT DISTINCT ro.dataset, ro.run_id, li.linkid 
                FROM li
                INNER JOIN ro ON li.dataset = ro.dataset
                INNER JOIN lr ON lr.dataset = ro.dataset AND lr.run_id = ro.run_id
                WHERE ro.score > 0 
                AND ro.dataset = %s
                AND ro.run_id >= %s
                ORDER BY ro.dataset, ro.run_id 
            )
            SELECT * FROM j
            """

            result = {
                "columns": [h for h in headers if h.strip()],  # Filter out empty headers
                "rows": df.to_dict('records'),
                "pagination": {
                    "page": page,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    "totalPages": (total_count + page_size - 1) // page_size
                },
                "listQuery": list_query,
                "parseQuery": parse_sql,
                "parameters": {
                    "dataset": dataset,
                    "date_threshold": date_threshold.isoformat(),
                    "page_size": page_size,
                    "offset": offset
                }
            }
            
            return jsonify(result)
            
        finally:
            conn.close()
            print("Database connection closed")

    except Exception as e:
        print("\n=== Error in /api/datasets/parse ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")
        return jsonify({
            "error": str(e),
            "type": str(type(e).__name__),
            "details": traceback.format_exc()
        }), 500

@app.after_request
def after_request(response):
    print(f"\n=== Request Details ===")
    print(f"Path: {request.path}")
    print(f"Method: {request.method}")
    print(f"Headers: {dict(request.headers)}")
    print(f"Response Status: {response.status}")
    print(f"Response Headers: {dict(response.headers)}")
    return response

@app.route('/api/test', methods=['GET'])
def test():
    print("\n=== Test endpoint called ===")
    return jsonify({
        "status": "ok",
        "message": "Flask server is running"
    })

def execute_query(conn, query, query_name):
    """Execute a single query and return its results with timing"""
    start_time = time.time()
    result = pd.read_sql(query, conn)
    query_time = time.time() - start_time
    return query_name, result, query_time

@app.route('/api/dashboard/health', methods=['GET'])
def get_dashboard_health():
    try:
        print("\n=== GET /api/dashboard/health called ===")
        days = int(request.args.get('days', 2))  # Default to 48 hours
        print(f"Requested days: {days}")
        
        conn = get_db_connection()
        query_timings = {}

        # First verify we have data for the requested time range
        verify_sql = """
        SELECT COUNT(*) 
        FROM public.rule_output 
        WHERE run_id::date >= NOW()::date - INTERVAL '%s day'
        AND run_id::date <= NOW()::date + INTERVAL '1 day'
        """
        
        with conn.cursor() as cursor:
            cursor.execute(verify_sql, [days])
            count = cursor.fetchone()[0]
            print(f"Found {count} records in rule_output for the selected time range")
            if count == 0:
                return jsonify({
                    "error": f"No data found for the selected time range (last {days} days)",
                    "globalHealth": [],
                    "timeSeries": [],
                    "dimensions": [],
                    "businessUnits": [],
                    "queryTimings": {}
                }), 404

        # Define the base CTE once
        base_cte = f"""
        WITH a AS (
            SELECT * FROM public.rule_output
            WHERE run_id::date >= NOW()::date - INTERVAL '{days} day'
            AND run_id::date <= NOW()::date + INTERVAL '1 day'
        ),
        b AS (
            SELECT * FROM public.dataset_scan 
            WHERE rc > 1
            AND run_id::date >= NOW()::date - INTERVAL '{days} day'
        ),
        c AS (
            SELECT * FROM public.owl_rule
        ),
        e AS (
            SELECT * FROM public.dq_dimension
        ),
        g AS (
            SELECT * FROM public.owl_catalog
        ),
        h AS (
            SELECT * FROM public.business_unit_to_dataset
        ),
        i AS (
            SELECT * FROM public.business_units
        ),
        j AS (
            SELECT DISTINCT dataset, col_nm, col_semantic 
            FROM public.dataset_schema
            WHERE updated_at >= NOW() - INTERVAL '{days} day'
        ),
        f AS (
            SELECT
                a.dataset,
                a.rule_nm,
                a.score as rule_point,
                (CASE 
                    WHEN a.score = 0 and (a.exception is null or a.exception = '') then 'PASSING' 
                    WHEN length(a.exception) > 1 THEN 'EXCEPTION' 
                    WHEN a.score > 0 THEN 'BREAKING' 
                END) as pass_fail_exception,
                COALESCE(e.dim_name, 'UNSPECIFIED') AS dim_name,
                i.name as businss_unit,
                a.run_id::date as run_date
            FROM a
            LEFT JOIN b ON a.dataset = b.dataset AND a.run_id::date = b.run_id::date
            INNER JOIN c ON a.dataset = c.dataset AND a.rule_nm = c.rule_nm
            LEFT JOIN e ON e.dim_id = c.dim_id
            INNER JOIN g ON g.dataset = a.dataset
            LEFT JOIN h ON h.dataset = g.dataset
            LEFT JOIN i ON i.id = h.id
            LEFT JOIN j ON a.dataset = j.dataset AND c.column_name = j.col_nm
        )
        """

        # Define all queries
        queries = {
            'globalHealth': f"""
                {base_cte},
                all_statuses AS (
                    SELECT unnest(ARRAY['PASSING', 'BREAKING', 'EXCEPTION']) as pass_fail_exception
                ),
                health_counts AS (
                    SELECT 
                        pass_fail_exception,
                        COUNT(*) as cnt
                    FROM f 
                    WHERE run_date >= (select max(run_date) from f) - INTERVAL '{days} day'
                    GROUP BY pass_fail_exception
                )
                SELECT 
                    s.pass_fail_exception,
                    COALESCE(h.cnt, 0) as cnt,
                    COALESCE(CAST(h.cnt AS DECIMAL) / NULLIF((SELECT SUM(cnt) FROM health_counts), 0), 0) as ratio
                FROM all_statuses s
                LEFT JOIN health_counts h ON s.pass_fail_exception = h.pass_fail_exception
                ORDER BY s.pass_fail_exception
            """,
            'timeSeries': f"""
                {base_cte}
                SELECT 
                    pass_fail_exception,
                    COUNT(*) as cnt,
                    run_date as run_id
                FROM f 
                WHERE run_date >= (select max(run_date) from f) - INTERVAL '{days} day'
                GROUP BY pass_fail_exception, run_date
                ORDER BY run_date ASC, pass_fail_exception
            """,
            'dimensions': f"""
                {base_cte}
                SELECT 
                    dim_name as dimension,
                    pass_fail_exception,
                    COUNT(*) as cnt
                FROM f 
                WHERE run_date >= (select max(run_date) from f) - INTERVAL '{days} day'
                GROUP BY dim_name, pass_fail_exception
                ORDER BY dim_name, pass_fail_exception
            """,
            'businessUnits': f"""
                {base_cte}
                SELECT 
                    COALESCE(businss_unit, 'UNSPECIFIED') as biz_unit,
                    pass_fail_exception,
                    COUNT(*) as cnt
                FROM f 
                WHERE run_date >= (select max(run_date) from f) - INTERVAL '{days} day'
                GROUP BY businss_unit, pass_fail_exception
                ORDER BY businss_unit, pass_fail_exception
            """
        }

        # Execute queries in parallel using ThreadPoolExecutor
        results = {}
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Create a dictionary to store futures
            futures_dict = {}
            
            # Submit each query only once
            for query_name, query in queries.items():
                futures_dict[query_name] = executor.submit(execute_query, conn, query, query_name)
            
            # Collect results as they complete
            for query_name, future in futures_dict.items():
                try:
                    query_name, result, timing = future.result()
                    results[query_name] = result
                    query_timings[query_name] = timing
                    print(f"{query_name} query completed in {timing:.2f} seconds")
                except Exception as e:
                    print(f"Error executing {query_name} query: {str(e)}")
                    raise

        # Log the results
        print("\n=== Query Results Summary ===")
        for key, df in results.items():
            print(f"{key}: {len(df)} records")

        if len(results['timeSeries']) > 0:
            print(f"Time series date range: {results['timeSeries']['run_id'].min()} to {results['timeSeries']['run_id'].max()}")

        return jsonify({
            "globalHealth": results['globalHealth'].to_dict('records'),
            "timeSeries": results['timeSeries'].to_dict('records'),
            "dimensions": results['dimensions'].to_dict('records'),
            "businessUnits": results['businessUnits'].to_dict('records'),
            "queryTimings": query_timings
        })

    except Exception as e:
        print("\n=== Error in /api/dashboard/health ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")
        return jsonify({
            "error": str(e),
            "type": str(type(e).__name__),
            "details": traceback.format_exc()
        }), 500

    finally:
        if 'conn' in locals():
            conn.close()
            print("Database connection closed")

@app.route('/api/schema', methods=['GET'])
def get_schema():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Get dataset_scan columns
            cursor.execute("""
                SELECT 'dataset_scan' as table_name, column_name, data_type, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = 'dataset_scan'
                ORDER BY ordinal_position;
            """)
            dataset_scan_columns = cursor.fetchall()
            
            # Get dataset_schema columns
            cursor.execute("""
                SELECT 'dataset_schema' as table_name, column_name, data_type, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = 'dataset_schema'
                ORDER BY ordinal_position;
            """)
            dataset_schema_columns = cursor.fetchall()

            # Get owl_catalog columns
            cursor.execute("""
                SELECT 'owl_catalog' as table_name, column_name, data_type, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = 'owl_catalog'
                ORDER BY ordinal_position;
            """)
            owl_catalog_columns = cursor.fetchall()
            
            return jsonify({
                "dataset_scan": [{
                    "column": col[1],
                    "type": col[2],
                    "max_length": col[3]
                } for col in dataset_scan_columns],
                "dataset_schema": [{
                    "column": col[1],
                    "type": col[2],
                    "max_length": col[3]
                } for col in dataset_schema_columns],
                "owl_catalog": [{
                    "column": col[1],
                    "type": col[2],
                    "max_length": col[3]
                } for col in owl_catalog_columns]
            })
    except Exception as e:
        print(f"Error getting schema: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/ip', methods=['GET'])
def get_ip():
    # Get host name and IP
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    
    # Get external IP using curl
    try:
        external_ip = subprocess.check_output(['curl', '-s', 'https://api.ipify.org']).decode('utf-8')
    except:
        try:
            external_ip = subprocess.check_output(['curl', '-s', 'https://ifconfig.me']).decode('utf-8')
        except:
            external_ip = "Could not determine external IP"
    
    # Get client IP
    client_ip = request.remote_addr
    x_forwarded_for = request.headers.get('X-Forwarded-For')
    
    return jsonify({
        'hostname': hostname,
        'local_ip': local_ip,
        'external_ip': external_ip,
        'client_ip': client_ip,
        'x_forwarded_for': x_forwarded_for,
        'request_headers': dict(request.headers)
    })

if __name__ == '__main__':
    print("\n=== Starting Flask Server ===")
    
    # Get and display external IP at startup
    try:
        external_ip = subprocess.check_output(['curl', '-s', 'https://api.ipify.org']).decode('utf-8').strip()
        print(f"\nExternal IP: {external_ip}")
    except Exception as e:
        print(f"\nCould not determine external IP: {str(e)}")
    
    # Determine environment and port
    is_production = os.getenv('FLASK_ENV') == 'production'
    port = int(os.getenv('PORT', 8080)) if is_production else 5001
    
    print("\nServer endpoints available at:")
    print(f"  http://127.0.0.1:{port}/api/datasets")
    print(f"  http://127.0.0.1:{port}/api/test")
    
    app.run(host='0.0.0.0', port=port, debug=not is_production) 