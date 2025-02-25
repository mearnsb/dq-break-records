from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def hello():
    print("Root endpoint called")
    return 'Hello, World!'

@app.route('/test')
def test():
    print("Test endpoint called")
    return jsonify({
        "status": "ok",
        "message": "Test endpoint working"
    })

if __name__ == '__main__':
    print("\n=== Starting Test Flask Server ===")
    print("Try these URLs:")
    print("  http://127.0.0.1:5000")
    print("  http://localhost:5000")
    print("  http://127.0.0.1:5000/test")
    print("  http://localhost:5000/test")
    app.run(host='0.0.0.0', port=5000, debug=True) 