# proxy.py
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import os
import json

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Cho phép CORS

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'
DATA_FILE = 'aqi_history.json'

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    try:
        headers = {
            'Authorization': f'Bearer {TOKEN}'
        }
        response = requests.get(API_URL, headers=headers)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/log', methods=['POST'])
def log_data():
    try:
        new_data = request.json
        if not new_data:
            return jsonify({"error": "No data received"}), 400

        # Đọc dữ liệu cũ nếu có
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
        else:
            data = []

        data.append(new_data)

        # Ghi lại file
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f)

        return jsonify({"message": "Logged successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/log', methods=['GET'])
def get_logged_data():
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
        else:
            data = []

        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5500)
